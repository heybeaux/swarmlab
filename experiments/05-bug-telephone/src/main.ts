/**
 * Bug telephone — sweep runner.
 *
 * For every (chainLen × subtlety × policy) cell we run TRIALS seeded trials through
 * the same engine. Trial 0 of each cell is the "exhibition" trial: its injector and
 * reviewers are spawned through core and every review step is broadcast on the core
 * bus, so the trace replays visually in the observatory. All trials (exhibition
 * included) feed the cell's aggregate score event.
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
  type AgentHandle,
  type Scorer,
  type TraceEvent,
} from '@swarmlab/core';
import { seeded } from './rng.js';
import { round3, runTrial } from './sim.js';
import type { Policy, ReviewStep, TrialConfig, TrialResult } from './types.js';

// --- configuration -----------------------------------------------------------

const TRIALS = Number(process.env.BUG_TRIALS ?? 40);
const SEED = process.env.BUG_SEED ?? 'bug-telephone-v1';

const CHAIN_LENS: readonly number[] = [1, 2, 3, 5, 8];
const SUBTLETIES: readonly number[] = [0.2, 0.5, 0.8, 0.95];
const POLICIES: readonly Policy[] = ['serial', 'independent'];

const BASE_CATCH = Number(process.env.BUG_BASE ?? 0.75);
const MEAN_COMPETENCE = Number(process.env.BUG_COMPETENCE ?? 0.7);
const COMPETENCE_SPREAD = Number(process.env.BUG_SPREAD ?? 0.25);
const FATIGUE = Number(process.env.BUG_FATIGUE ?? 0.25);
const RUBBER_STAMP = Number(process.env.BUG_RUBBER ?? 0.3);

/** Ship-rate we'd like a gate to stay under (used by the summary scorer). */
const TARGET_SHIP_RATE = 0.1;

interface Cell {
  id: string;
  chainLen: number;
  subtlety: number;
  policy: Policy;
}

const cells: Cell[] = [];
for (const policy of POLICIES) {
  for (const subtlety of SUBTLETIES) {
    for (const chainLen of CHAIN_LENS) {
      cells.push({ id: `${policy}-L${chainLen}-s${subtlety}`, chainLen, subtlety, policy });
    }
  }
}

function cellConfig(cell: Cell): TrialConfig {
  return {
    chainLen: cell.chainLen,
    subtlety: cell.subtlety,
    policy: cell.policy,
    baseCatch: BASE_CATCH,
    meanCompetence: MEAN_COMPETENCE,
    competenceSpread: COMPETENCE_SPREAD,
    fatigue: FATIGUE,
    rubberStamp: RUBBER_STAMP,
  };
}

// --- setup ---------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `bt-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '05-bug-telephone' });
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
    chainLens: CHAIN_LENS,
    subtleties: SUBTLETIES,
    policies: POLICIES,
    baseCatch: BASE_CATCH,
    fatigue: FATIGUE,
    rubberStamp: RUBBER_STAMP,
  },
});

console.log(`run ${runId} | cells=${cells.length} trials/cell=${TRIALS}`);

// --- sweep -----------------------------------------------------------------------

interface CellAggregate {
  cell: Cell;
  shipRate: number;
  meanSurvivalDepth: number;
  meanReviewsUsed: number;
  catchRateAtPos0: number;
  catchRateDeep: number;
}

const aggregates: CellAggregate[] = [];

for (let c = 0; c < cells.length; c += 1) {
  const cell = cells[c];
  if (!cell) continue;
  const cfg = cellConfig(cell);

  // Exhibition trial (trial 0): real spawns + every review step on the bus.
  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'cell',
    body: { cell: cell.id, chainLen: cell.chainLen, subtlety: cell.subtlety, policy: cell.policy },
  });

  const injector = await spawnAgent(
    {
      id: `${cell.id}:injector`,
      systemPrompt: `Plant one bug of subtlety ${cell.subtlety} into the diff. Make it plausible.`,
    },
    { runtime, trace },
  );
  bus.publish({
    from: injector.id,
    to: '*',
    topic: 'inject',
    body: { subtlety: cell.subtlety, kind: 'off-by-one / boundary' },
  });

  const reviewers: AgentHandle[] = [];
  for (let i = 0; i < cfg.chainLen; i += 1) {
    reviewers.push(
      await spawnAgent(
        {
          id: `${cell.id}:r${i}`,
          systemPrompt:
            cell.policy === 'serial'
              ? `Review the diff. You can see that ${i} reviewer(s) already approved it.`
              : `Review the diff blind. You do NOT know whether anyone else has looked at it.`,
        },
        { runtime, trace },
      ),
    );
  }

  const results: TrialResult[] = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const rand = seeded(`${SEED}:${cell.id}:${t}`);
    const emit =
      t === 0
        ? (step: ReviewStep) => {
            const rev = reviewers[step.pos];
            bus.publish({
              from: rev ? rev.id : `${cell.id}:r${step.pos}`,
              to: '*',
              topic: 'review',
              body: {
                pos: step.pos,
                competence: step.competence,
                attention: step.attention,
                complacency: step.complacency,
                pCatch: step.pCatch,
                caught: step.caught,
              },
            });
          }
        : undefined;
    results.push(runTrial(cfg, rand, emit));
  }

  const exhibition = results[0];
  if (exhibition) {
    bus.publish({
      from: 'moderator',
      to: '*',
      topic: 'verdict',
      body: {
        cell: cell.id,
        survivalDepth: exhibition.survivalDepth,
        shipped: exhibition.shipped,
        chainLen: cell.chainLen,
      },
    });
  }
  await injector.kill();
  bus.removeAgent(injector.id);
  for (const r of reviewers) {
    await r.kill();
    bus.removeAgent(r.id);
  }

  const mean = (f: (r: TrialResult) => number): number =>
    round3(results.reduce((s, r) => s + f(r), 0) / results.length);

  // Detection rate at position 0 vs the deep tail (last third of the chain).
  const deepStart = Math.max(1, Math.ceil((cfg.chainLen * 2) / 3));
  const catchRateAt = (predicate: (pos: number) => boolean): number => {
    let reached = 0;
    let caught = 0;
    for (const r of results) {
      for (const step of r.steps) {
        if (!predicate(step.pos)) continue;
        reached += 1;
        if (step.caught) caught += 1;
      }
    }
    return reached === 0 ? 0 : round3(caught / reached);
  };

  const agg: CellAggregate = {
    cell,
    shipRate: mean((r) => (r.shipped ? 1 : 0)),
    meanSurvivalDepth: mean((r) => r.survivalDepth),
    meanReviewsUsed: mean((r) => r.reviewsUsed),
    catchRateAtPos0: catchRateAt((pos) => pos === 0),
    catchRateDeep: catchRateAt((pos) => pos >= deepStart),
  };
  aggregates.push(agg);

  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      cellIndex: c,
      policy: cell.policy === 'serial' ? 0 : 1,
      chainLen: cell.chainLen,
      subtlety: cell.subtlety,
      trials: TRIALS,
      shipRate: agg.shipRate,
      meanSurvivalDepth: agg.meanSurvivalDepth,
      meanReviewsUsed: agg.meanReviewsUsed,
      catchRateAtPos0: agg.catchRateAtPos0,
      catchRateDeep: agg.catchRateDeep,
    },
  });

  console.log(
    `${cell.id.padEnd(22)} | ship=${fmt(agg.shipRate)} survDepth=${agg.meanSurvivalDepth} ` +
      `pos0Catch=${fmt(agg.catchRateAtPos0)} deepCatch=${fmt(agg.catchRateDeep)}`,
  );
}

// --- summary: where does the gate break, and does depth pay? ---------------------

function agg(policy: Policy, chainLen: number, subtlety: number): CellAggregate | undefined {
  return aggregates.find(
    (a) => a.cell.policy === policy && a.cell.chainLen === chainLen && a.cell.subtlety === subtlety,
  );
}

/** Smallest chain length (serial) that keeps ship-rate under target for the subtlest bug. */
function cheapestSafeChain(policy: Policy, subtlety: number): number {
  for (const L of CHAIN_LENS) {
    const a = agg(policy, L, subtlety);
    if (a && a.shipRate <= TARGET_SHIP_RATE) return L;
  }
  return -1;
}

/**
 * The rubber-stamp penalty: mean (serial ship-rate − independent ship-rate) across
 * all (L>=2, s) cells. Positive => visible PASS trails make chains leakier.
 */
function rubberStampPenalty(): number {
  let sum = 0;
  let n = 0;
  for (const s of SUBTLETIES) {
    for (const L of CHAIN_LENS) {
      if (L < 2) continue;
      const ser = agg('serial', L, s);
      const ind = agg('independent', L, s);
      if (ser && ind) {
        sum += ser.shipRate - ind.shipRate;
        n += 1;
      }
    }
  }
  return n === 0 ? 0 : round3(sum / n);
}

/**
 * Does a LONGER serial chain ever ship MORE bugs than a shorter one at the same
 * subtlety? (Rubber-stamping making depth counterproductive.) Returns the count of
 * such non-monotone (L, s) pairs.
 */
function nonMonotoneCount(policy: Policy): number {
  let count = 0;
  for (const s of SUBTLETIES) {
    for (let i = 1; i < CHAIN_LENS.length; i += 1) {
      const shorterL = CHAIN_LENS[i - 1];
      const longerL = CHAIN_LENS[i];
      if (shorterL === undefined || longerL === undefined) continue;
      const shorter = agg(policy, shorterL, s);
      const longer = agg(policy, longerL, s);
      if (shorter && longer && longer.shipRate > shorter.shipRate + 0.001) count += 1;
    }
  }
  return count;
}

const summaryScorer: Scorer = {
  score() {
    return {
      cells: aggregates.length,
      trialsPerCell: TRIALS,
      cheapestSafeSerialSubtle: cheapestSafeChain('serial', 0.95),
      cheapestSafeIndepSubtle: cheapestSafeChain('independent', 0.95),
      rubberStampPenalty: rubberStampPenalty(),
      nonMonotoneSerial: nonMonotoneCount('serial'),
      nonMonotoneIndep: nonMonotoneCount('independent'),
    };
  },
};
const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

// --- replay verification (DoD: replay() must read the trace back) ----------------

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

function fmt(n: number): string {
  return n.toFixed(2);
}
