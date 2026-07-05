/**
 * exp-15 sweep runner — trust routing with forgiveness & decay.
 *
 * 3 arms (unforgiving control / time-decay / probation) × 2 failure styles
 * (loud / confident-wrong), TRIALS seeded trials each, R=30 rounds, SAME seeds
 * and environment draws as exp-14 Part B (`trust-routing-v1`). The control arm
 * is exp-14's `runTrustTrial('engram', …)` called DIRECTLY — the module is
 * reused, not forked — and the runner HALTS unless it reproduces RT-05's
 * pinned numbers (including the full 30-round selection curves). Reset probe
 * between rounds 15/16, transfer probe at round 30, trial 0 per condition is
 * the exhibition trial (root + workers spawned through core, on the bus).
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
import { round3 } from '@swarmlab/experiment-14-delegation-decay/dist/rng.js';
import {
  INCAPABLE,
  P_CAPABLE_TRANSIENT_FAIL,
  RESET_AFTER_ROUND,
  ROUNDS,
  TASK_CLASS,
  WORKERS,
  runTrustTrial,
} from '@swarmlab/experiment-14-delegation-decay/dist/trust.js';
import type { FailStyle, TrustTrialResult } from '@swarmlab/experiment-14-delegation-decay/dist/types.js';
import {
  DECAY_WINDOW,
  EVIDENCE_MARGIN,
  PROBE_BACKOFF,
  PROBE_BASE,
  runForgivingTrial,
  type ForgArm,
  type ForgTrialResult,
  type ForgivenessExtras,
} from './engine.js';

const TRIALS = Number(process.env.FORGIVE_TRIALS ?? 50);
const SEED = process.env.FORGIVE_SEED ?? 'trust-routing-v1'; // exp-14 Part B seed, unchanged
const SKIP_REPRO_GATE = process.env.SKIP_REPRO_GATE === '1';

const ARMS: readonly ForgArm[] = ['unforgiving', 'decay', 'probation', 'evidence'];
const STYLES: readonly FailStyle[] = ['loud', 'confident-wrong'];

interface Condition {
  id: string;
  arm: ForgArm;
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
const runId = `tf-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '15-trust-forgiveness' });
const bus = new MessageBus({ trace });
const runtime = new StubRuntime();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    mode: 'sim',
    trials: TRIALS,
    seed: SEED,
    rounds: ROUNDS,
    resetAfterRound: RESET_AFTER_ROUND,
    decayWindow: DECAY_WINDOW,
    probeBase: PROBE_BASE,
    probeBackoff: PROBE_BACKOFF,
    evidenceMargin: EVIDENCE_MARGIN,
    workers: WORKERS.map((w) => w.id),
    incapable: INCAPABLE,
    taskClass: TASK_CLASS,
    pCapableTransientFail: P_CAPABLE_TRANSIENT_FAIL,
    engramModule: '@openengram/reconciliation (file: dep, branch versioned-facts-anti-entropy, PR #323)',
    controlModule: '@swarmlab/experiment-14-delegation-decay runTrustTrial("engram") — reused, not forked',
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
  // forgiveness metrics (NaN / 0 where not applicable)
  capableRecoveriesMean: number;
  recoveryLatencyMean: number;
  incapableLeaksMean: number;
  capableBenchedEverMean: number;
  probeCountMean: number;
  probeTokensMean: number;
  probeTokensWastedMean: number;
  lateIncapableProbesMean: number;
  postResetProbeRate: number;
  midProbationAtResetRate: number;
  postResetContinuityRate: number;
  transferPoolHadIncapableRate: number;
  transferReadmittedProbationRate: number;
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
        systemPrompt: `Delegation root (${cond.arm} eligibility policy). Choose one worker per round for ${TASK_CLASS} tasks. Worker roster: ${WORKERS.map((w) => `${w.id} — ${w.blurb}`).join(' | ')}`,
      },
      { runtime, trace },
    ),
  );
  for (const w of WORKERS) {
    handles.push(
      await spawnAgent(
        { id: `${cond.id}:${w.id}`, systemPrompt: `Worker ${w.id}: ${w.blurb}` },
        { runtime, trace },
      ),
    );
  }

  const results: TrustTrialResult[] = [];
  const extras: ForgivenessExtras[] = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const seedBase = `${SEED}:${cond.style}:t${t}`; // identical to exp-14 mainb
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
    if (cond.arm === 'unforgiving') {
      // exp-14's module, exp-14's arm, exp-14's seeds → RT-05 must fall out.
      results.push(runTrustTrial('engram', cond.style, seedBase, emit));
    } else {
      const r: ForgTrialResult = runForgivingTrial(cond.arm, cond.style, seedBase, emit);
      results.push(r);
      extras.push(r.extras);
    }
  }

  for (const h of handles) {
    await h.kill();
    bus.removeAgent(h.id);
  }

  // --- aggregate (identical math to exp-14 mainb) -----------------------------
  const selByRound: number[] = [];
  for (let r = 0; r < ROUNDS; r += 1) {
    selByRound.push(
      round3(results.reduce((s, res) => s + (res.incapableChosen[r] ? 1 : 0), 0) / results.length),
    );
  }
  const lateRate = round3(
    selByRound.slice(24).reduce((s, x) => s + x, 0) / selByRound.slice(24).length,
  );
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
  const exMean = (f: (e: ForgivenessExtras) => number): number =>
    extras.length === 0 ? 0 : round3(extras.reduce((s, e) => s + f(e), 0) / extras.length);
  const exRate = (f: (e: ForgivenessExtras) => boolean): number =>
    extras.length === 0 ? 0 : round3(extras.filter(f).length / extras.length);
  const allLatencies = extras.flatMap((e) => e.recoveryLatencies);

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
    capableRecoveriesMean: exMean((e) => e.capableRecoveries),
    recoveryLatencyMean:
      allLatencies.length === 0
        ? -1
        : round3(allLatencies.reduce((s, x) => s + x, 0) / allLatencies.length),
    incapableLeaksMean: exMean((e) => e.incapableLeaks),
    capableBenchedEverMean: exMean((e) => e.capableBenchedEver),
    probeCountMean: exMean((e) => e.probeCount),
    probeTokensMean: exMean((e) => e.probeTokens),
    probeTokensWastedMean: exMean((e) => e.probeTokensWasted),
    lateIncapableProbesMean: exMean((e) => e.lateIncapableProbes),
    postResetProbeRate: exRate((e) => e.postResetIncapableWasProbe),
    midProbationAtResetRate: exRate((e) => e.midProbationAtReset),
    postResetContinuityRate: exRate((e) => e.postResetContinuityOk),
    transferPoolHadIncapableRate: exRate((e) => e.transferPoolHadIncapable),
    transferReadmittedProbationRate: exRate((e) => e.transferReadmittedProbation),
  };
  aggregates.push(agg);

  const selScores: Record<string, number> = {};
  for (let r = 0; r < ROUNDS; r += 1) selScores[`selR${r + 1}`] = selByRound[r] ?? 0;
  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      conditionIndex: c,
      arm: cond.arm === 'unforgiving' ? 0 : cond.arm === 'decay' ? 1 : cond.arm === 'probation' ? 2 : 3,
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
      capableRecoveriesMean: agg.capableRecoveriesMean,
      recoveryLatencyMean: agg.recoveryLatencyMean,
      incapableLeaksMean: agg.incapableLeaksMean,
      capableBenchedEverMean: agg.capableBenchedEverMean,
      probeCountMean: agg.probeCountMean,
      probeTokensMean: agg.probeTokensMean,
      probeTokensWastedMean: agg.probeTokensWastedMean,
      lateIncapableProbesMean: agg.lateIncapableProbesMean,
      postResetProbeRate: agg.postResetProbeRate,
      midProbationAtResetRate: agg.midProbationAtResetRate,
      postResetContinuityRate: agg.postResetContinuityRate,
      transferPoolHadIncapableRate: agg.transferPoolHadIncapableRate,
      transferReadmittedProbationRate: agg.transferReadmittedProbationRate,
      reconcileAdopted: reconcileTotals['adopted'] ?? 0,
      reconcileHealed: reconcileTotals['healed'] ?? 0,
      reconcileKept: reconcileTotals['kept'] ?? 0,
      reconcileRejectedCorrupt: reconcileTotals['rejected_corrupt'] ?? 0,
      ...selScores,
    },
  });

  console.log(
    `${cond.id.padEnd(28)} | late=${agg.lateRate.toFixed(3)} conv=${String(agg.convergenceRound).padStart(3)} ` +
      `wasted=${agg.meanWasted.toFixed(0).padStart(4)} capEx=${agg.capableExcludedMean.toFixed(2)} ` +
      `recov=${agg.capableRecoveriesMean.toFixed(2)} lat=${agg.recoveryLatencyMean.toFixed(1)} ` +
      `leaks=${agg.incapableLeaksMean.toFixed(2)} probes=${agg.probeCountMean.toFixed(1)} ` +
      `postReset=${agg.postResetRate.toFixed(2)} transferAvoid=${agg.transferAvoidRate.toFixed(2)}`,
  );
}

// --- control-arm reproduction gate (RT-05, run dd-b-mr7zvbuu) ----------------------
// Values pinned from exp-14's trace score events; the runner refuses to report
// forgiveness numbers unless the control reproduces them EXACTLY.

interface Rt05Expected {
  lateRate: number;
  convergenceRound: number;
  meanWasted: number;
  postResetRate: number;
  transferAvoidRate: number;
  transferEvidenceRate: number;
  capableExcludedMean: number;
  adopted: number;
  healed: number;
  curve: number[];
}

const RT05: Record<FailStyle, Rt05Expected> = {
  loud: {
    lateRate: 0,
    convergenceRound: 9,
    meanWasted: 15,
    postResetRate: 0,
    transferAvoidRate: 1,
    transferEvidenceRate: 1,
    capableExcludedMean: 0.22,
    adopted: 300,
    healed: 1200,
    curve: [
      0.26, 0.1, 0.1, 0.14, 0.06, 0.04, 0.1, 0.12, 0, 0.02, 0.04, 0, 0.02, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  'confident-wrong': {
    lateRate: 0.003,
    convergenceRound: 11,
    meanWasted: 30,
    postResetRate: 0,
    transferAvoidRate: 1,
    transferEvidenceRate: 1,
    capableExcludedMean: 0.22,
    adopted: 300,
    healed: 1200,
    curve: [
      0.16, 0.22, 0.18, 0.2, 0.08, 0.1, 0.06, 0.02, 0.02, 0.06, 0.04, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0.04, 0, 0, 0, 0, 0, 0, 0, 0, 0.02,
    ],
  },
};

let reproOk = true;
if (TRIALS === 50 && SEED === 'trust-routing-v1') {
  for (const style of STYLES) {
    const a = aggregates.find((x) => x.condition.arm === 'unforgiving' && x.condition.style === style);
    const e = RT05[style];
    if (!a) {
      reproOk = false;
      continue;
    }
    const checks: [string, number, number][] = [
      ['lateRate', a.lateRate, e.lateRate],
      ['convergenceRound', a.convergenceRound, e.convergenceRound],
      ['meanWasted', a.meanWasted, e.meanWasted],
      ['postResetRate', a.postResetRate, e.postResetRate],
      ['transferAvoidRate', a.transferAvoidRate, e.transferAvoidRate],
      ['transferEvidenceRate', a.transferEvidenceRate, e.transferEvidenceRate],
      ['capableExcludedMean', a.capableExcludedMean, e.capableExcludedMean],
      ['reconcileAdopted', a.reconcileTotals['adopted'] ?? 0, e.adopted],
      ['reconcileHealed', a.reconcileTotals['healed'] ?? 0, e.healed],
    ];
    for (const [name, got, want] of checks) {
      if (got !== want) {
        console.error(`REPRO FAIL [unforgiving-${style}] ${name}: got ${got}, want ${want} (RT-05)`);
        reproOk = false;
      }
    }
    for (let r = 0; r < ROUNDS; r += 1) {
      if ((a.selByRound[r] ?? -1) !== (e.curve[r] ?? -2)) {
        console.error(
          `REPRO FAIL [unforgiving-${style}] selR${r + 1}: got ${a.selByRound[r]}, want ${e.curve[r]}`,
        );
        reproOk = false;
      }
    }
  }
  if (!reproOk && !SKIP_REPRO_GATE) {
    console.error('control arm does NOT reproduce RT-05 — stopping before trusting the new arms.');
    process.exit(1);
  }
  console.log(`control-arm RT-05 reproduction: ${reproOk ? 'EXACT (all metrics + full curves)' : 'FAILED (gate skipped)'}`);
} else {
  console.log('control-arm RT-05 gate skipped (non-standard TRIALS/SEED)');
}

// --- summary -----------------------------------------------------------------------

const find = (arm: ForgArm, style: FailStyle): ConditionAggregate | undefined =>
  aggregates.find((a) => a.condition.arm === arm && a.condition.style === style);

const summaryScorer: Scorer = {
  score() {
    const s: Record<string, number> = {
      conditions: aggregates.length,
      trials: TRIALS,
      reproOk: reproOk ? 1 : 0,
    };
    for (const arm of ARMS) {
      for (const style of STYLES) {
        const a = find(arm, style);
        if (!a) continue;
        const key = `${arm === 'unforgiving' ? 'uf' : arm === 'decay' ? 'dc' : arm === 'probation' ? 'pb' : 'ev'}${style === 'loud' ? 'Loud' : 'CW'}`;
        s[`${key}Late`] = a.lateRate;
        s[`${key}CapEx`] = a.capableExcludedMean;
        s[`${key}Recov`] = a.capableRecoveriesMean;
        s[`${key}Leaks`] = a.incapableLeaksMean;
        s[`${key}Transfer`] = a.transferAvoidRate;
        s[`${key}Wasted`] = a.meanWasted;
        s[`${key}ProbeTok`] = a.probeTokensMean;
      }
    }
    return s;
  },
};
const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

// --- per-round selection curves ------------------------------------------------------

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
