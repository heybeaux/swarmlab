/**
 * Part B — trust routing sweep runner.
 *
 * 3 arms (amnesiac / incontext / engram) × 2 failure styles (loud /
 * confident-wrong), TRUST_TRIALS seeded trials each, R=30 rounds per trial,
 * same seeds and identical environment draws across arms. Includes the reset
 * probe (root killed between rounds 15/16) and the transfer probe (brand-new
 * root reads the store at round 30). Trial 0 of each condition is the
 * exhibition trial: root + workers spawned through core, every choice and
 * outcome on the bus.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MessageBus,
  TraceWriter,
  readRunRecord,
  runScorer,
  spawnAgent,
  StubRuntime,
  type Scorer,
  type TraceEvent,
} from '@swarmlab/core';
import { round3 } from './rng.js';
import {
  INCAPABLE,
  P_CAPABLE_TRANSIENT_FAIL,
  RESET_AFTER_ROUND,
  ROUNDS,
  TASK_CLASS,
  WINDOW,
  WORKERS,
  runTrustTrial,
} from './trust.js';
import type { Arm, FailStyle, TrustTrialResult } from './types.js';

const TRIALS = Number(process.env.TRUST_TRIALS ?? 25);
const SEED = process.env.TRUST_SEED ?? 'trust-routing-v1';

const ARMS: readonly Arm[] = ['amnesiac', 'incontext', 'engram'];
const STYLES: readonly FailStyle[] = ['loud', 'confident-wrong'];

interface Condition {
  id: string;
  arm: Arm;
  style: FailStyle;
}

const conditions: Condition[] = [];
for (const arm of ARMS) {
  for (const style of STYLES) {
    conditions.push({ id: `${arm}-${style}`, arm, style });
  }
}

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `dd-b-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '14-delegation-decay' });
const bus = new MessageBus({ trace });
const runtime = new StubRuntime();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    part: 'B',
    mode: 'sim',
    trials: TRIALS,
    seed: SEED,
    rounds: ROUNDS,
    resetAfterRound: RESET_AFTER_ROUND,
    window: WINDOW,
    workers: WORKERS.map((w) => w.id),
    incapable: INCAPABLE,
    taskClass: TASK_CLASS,
    pCapableTransientFail: P_CAPABLE_TRANSIENT_FAIL,
    engramModule: '@openengram/reconciliation (file: dep, branch versioned-facts-anti-entropy, PR #323)',
    conditions: conditions.map((c) => c.id),
  },
});

console.log(`run ${runId} | conditions=${conditions.length} trials=${TRIALS} rounds=${ROUNDS}`);

interface ConditionAggregate {
  condition: Condition;
  selByRound: number[];
  lateRate: number;
  convergenceRound: number;
  meanWasted: number;
  wastedSlopeLate: number;
  postResetRate: number;
  transferAvoidRate: number;
  transferEvidenceRate: number;
  capableExcludedMean: number;
  reconcileTotals: Record<string, number>;
}

const aggregates: ConditionAggregate[] = [];

for (let c = 0; c < conditions.length; c += 1) {
  const cond = conditions[c];
  if (!cond) continue;

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'condition',
    body: { condition: cond.id, arm: cond.arm, style: cond.style },
  });

  // Exhibition trial 0: real spawns, every choice + outcome on the bus.
  const handles = [];
  handles.push(
    await spawnAgent(
      {
        id: `${cond.id}:root`,
        systemPrompt: `Delegation root (${cond.arm}). Choose one worker per round for ${TASK_CLASS} tasks. Worker roster: ${WORKERS.map((w) => `${w.id} — ${w.blurb}`).join(' | ')}`,
      },
      { runtime, trace },
    ),
  );
  for (const w of WORKERS) {
    handles.push(
      await spawnAgent(
        {
          id: `${cond.id}:${w.id}`,
          systemPrompt: `Worker ${w.id}: ${w.blurb}`,
        },
        { runtime, trace },
      ),
    );
  }

  const results: TrustTrialResult[] = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const seedBase = `${SEED}:${cond.style}:t${t}`;
    const emit =
      t === 0
        ? {
            choice: (round: number, root: string, worker: string) => {
              bus.publish({
                from: `${cond.id}:${root}`,
                to: `${cond.id}:${worker}`,
                topic: 'delegate',
                body: { round, taskClass: TASK_CLASS },
              });
            },
            outcome: (round: number, worker: string, success: boolean, failedAssertion?: string) => {
              bus.publish({
                from: `${cond.id}:${worker}`,
                to: `${cond.id}:root`,
                topic: 'outcome',
                body: { round, success, failedAssertion: failedAssertion ?? null },
              });
            },
            marker: (topic: 'reset' | 'transfer', body: Record<string, unknown>) => {
              bus.publish({ from: 'moderator', to: '*', topic, body: { condition: cond.id, ...body } });
            },
          }
        : undefined;
    results.push(runTrustTrial(cond.arm, cond.style, seedBase, emit));
  }

  for (const h of handles) {
    await h.kill();
    bus.removeAgent(h.id);
  }

  // --- aggregate --------------------------------------------------------------
  const selByRound: number[] = [];
  for (let r = 0; r < ROUNDS; r += 1) {
    selByRound.push(
      round3(results.reduce((s, res) => s + (res.incapableChosen[r] ? 1 : 0), 0) / results.length),
    );
  }
  const lateRate = round3(
    selByRound.slice(24).reduce((s, x) => s + x, 0) / selByRound.slice(24).length,
  );
  // Sustained means sustained: require the ≤0.05 tail to be at least 3 rounds
  // long, so one lucky final round can't masquerade as convergence.
  let convergenceRound = -1;
  for (let r = 0; r <= ROUNDS - 3; r += 1) {
    if (selByRound.slice(r).every((x) => x <= 0.05)) {
      convergenceRound = r + 1;
      break;
    }
  }
  const meanAt = (r: number): number =>
    results.reduce((s, res) => s + (res.wastedCum[r] ?? 0), 0) / results.length;
  const meanWasted = round3(meanAt(ROUNDS - 1));
  const wastedSlopeLate = round3((meanAt(ROUNDS - 1) - meanAt(ROUNDS - 7)) / 6);
  const rate = (f: (r: TrustTrialResult) => boolean): number =>
    round3(results.filter(f).length / results.length);
  const reconcileTotals: Record<string, number> = {};
  for (const res of results) {
    for (const [k, v] of Object.entries(res.reconcileOutcomes ?? {})) {
      reconcileTotals[k] = (reconcileTotals[k] ?? 0) + v;
    }
  }

  const agg: ConditionAggregate = {
    condition: cond,
    selByRound,
    lateRate,
    convergenceRound,
    meanWasted,
    wastedSlopeLate,
    postResetRate: rate((r) => r.postResetIncapable),
    transferAvoidRate: rate((r) => r.transferAvoided),
    transferEvidenceRate: rate((r) => r.transferHadEvidence),
    capableExcludedMean: round3(results.reduce((s, r) => s + r.capableExcluded, 0) / results.length),
    reconcileTotals,
  };
  aggregates.push(agg);

  const selScores: Record<string, number> = {};
  for (let r = 0; r < ROUNDS; r += 1) selScores[`selR${r + 1}`] = selByRound[r] ?? 0;
  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      conditionIndex: c,
      arm: cond.arm === 'amnesiac' ? 0 : cond.arm === 'incontext' ? 1 : 2,
      style: cond.style === 'loud' ? 0 : 1,
      trials: TRIALS,
      lateSelectionRate: agg.lateRate,
      convergenceRound: agg.convergenceRound,
      meanWastedTokens: agg.meanWasted,
      wastedSlopeLate: agg.wastedSlopeLate,
      postResetSelectionRate: agg.postResetRate,
      transferAvoidRate: agg.transferAvoidRate,
      transferEvidenceRate: agg.transferEvidenceRate,
      capableExcludedMean: agg.capableExcludedMean,
      reconcileAdopted: reconcileTotals['adopted'] ?? 0,
      reconcileHealed: reconcileTotals['healed'] ?? 0,
      reconcileKept: reconcileTotals['kept'] ?? 0,
      reconcileRejectedCorrupt: reconcileTotals['rejected_corrupt'] ?? 0,
      ...selScores,
    },
  });

  console.log(
    `${cond.id.padEnd(26)} | late=${agg.lateRate.toFixed(3)} conv=${String(agg.convergenceRound).padStart(3)} ` +
      `wasted=${agg.meanWasted.toFixed(0).padStart(4)} slopeLate=${agg.wastedSlopeLate.toFixed(1)} ` +
      `postReset=${agg.postResetRate.toFixed(2)} transferAvoid=${agg.transferAvoidRate.toFixed(2)}`,
  );
}

// --- summary -----------------------------------------------------------------------

const find = (arm: Arm, style: FailStyle): ConditionAggregate | undefined =>
  aggregates.find((a) => a.condition.arm === arm && a.condition.style === style);

const summaryScorer: Scorer = {
  score() {
    const s: Record<string, number> = { conditions: aggregates.length, trials: TRIALS };
    for (const arm of ARMS) {
      for (const style of STYLES) {
        const a = find(arm, style);
        if (!a) continue;
        const key = `${arm === 'amnesiac' ? 'am' : arm === 'incontext' ? 'ic' : 'en'}${style === 'loud' ? 'Loud' : 'CW'}`;
        s[`${key}Late`] = a.lateRate;
        s[`${key}Conv`] = a.convergenceRound;
        s[`${key}PostReset`] = a.postResetRate;
        s[`${key}Transfer`] = a.transferAvoidRate;
        s[`${key}Wasted`] = a.meanWasted;
      }
    }
    return s;
  },
};
const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

// --- per-round selection curves (for the README tables) -----------------------------

for (const a of aggregates) {
  console.log(`curve ${a.condition.id}: ${a.selByRound.map((x) => x.toFixed(2)).join(' ')}`);
}

// --- replay verification -------------------------------------------------------------

const written = trace.toRunRecord();
const replayed = await readRunRecord(traceFile);
const count = (events: readonly TraceEvent[], t: TraceEvent['t']): number =>
  events.filter((e) => e.t === t).length;
const kinds: readonly TraceEvent['t'][] = ['spawn', 'message', 'score', 'kill'];
for (const kind of kinds) {
  const a = count(written.events, kind);
  const b = count(replayed.events, kind);
  if (a !== b) throw new Error(`replay mismatch for ${kind}: wrote ${a}, replayed ${b}`);
}
console.log(
  `replay verified: ${replayed.events.length} events ` +
    `(${kinds.map((k) => `${k}=${count(replayed.events, k)}`).join(' ')})`,
);
console.log(`trace: ${traceFile}`);
