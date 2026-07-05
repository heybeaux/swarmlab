/**
 * Overnight cathedral — sweep runner.
 *
 * For every (reviewSkill × fatigue × iterations) cell we run TRIALS seeded trials through the
 * same long-horizon build engine. Trial 0 of each cell is the "exhibition" trial: its builder
 * agents are spawned through core and every commit + review + snapshot is put on the core bus,
 * so the trace replays visually in the observatory. All trials feed the cell's aggregate score.
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
import type { CommitStep, ReviewStep, Snapshot, TrialConfig, TrialResult } from './types.js';

// --- configuration -----------------------------------------------------------

const TRIALS = Number(process.env.CATHEDRAL_TRIALS ?? 25);
const SEED = process.env.CATHEDRAL_SEED ?? 'overnight-cathedral-v1';

const REVIEW_SKILLS: readonly number[] = [0.0, 0.3, 0.6, 0.9];
const FATIGUES: readonly number[] = [0.0, 1.0, 3.0];
const ITERATIONS: readonly number[] = [20, 60, 200];

const SPEC_SIZE = Number(process.env.CATHEDRAL_SPEC ?? 24);
const BUILDERS = Number(process.env.CATHEDRAL_BUILDERS ?? 4);
const P_PROGRESS = Number(process.env.CATHEDRAL_PPROGRESS ?? 0.5);
const P_REGRESS = Number(process.env.CATHEDRAL_PREGRESS ?? 0.3);
const P_DRIFT = Number(process.env.CATHEDRAL_PDRIFT ?? 0.2);
const DRIFT_VISIBILITY = Number(process.env.CATHEDRAL_DRIFTVIS ?? 0.5);
const DRIFT_CAPACITY = Number(process.env.CATHEDRAL_DRIFTCAP ?? 200);

interface Cell {
  id: string;
  reviewSkill: number;
  fatigue: number;
  iterations: number;
}

const cells: Cell[] = [];
for (const iterations of ITERATIONS) {
  for (const fatigue of FATIGUES) {
    for (const reviewSkill of REVIEW_SKILLS) {
      cells.push({ id: `r${reviewSkill}-f${fatigue}-i${iterations}`, reviewSkill, fatigue, iterations });
    }
  }
}

function cellConfig(cell: Cell): TrialConfig {
  return {
    specSize: SPEC_SIZE,
    builders: BUILDERS,
    iterations: cell.iterations,
    pProgress: P_PROGRESS,
    pRegress: P_REGRESS,
    pDrift: P_DRIFT,
    fatigue: cell.fatigue,
    reviewSkill: cell.reviewSkill,
    driftVisibility: DRIFT_VISIBILITY,
    driftCapacity: DRIFT_CAPACITY,
    snapshotEvery: Math.max(1, Math.floor(cell.iterations / 10)),
  };
}

// --- setup ---------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `oc-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '09-overnight-cathedral' });
const bus = new MessageBus({ trace });
const runtime = new StubRuntime();

bus.publish({
  from: 'foreman',
  to: '*',
  topic: 'meta',
  body: {
    mode: 'sim',
    trials: TRIALS,
    seed: SEED,
    reviewSkills: REVIEW_SKILLS,
    fatigues: FATIGUES,
    iterations: ITERATIONS,
    specSize: SPEC_SIZE,
    builders: BUILDERS,
    pProgress: P_PROGRESS,
    pRegress: P_REGRESS,
    pDrift: P_DRIFT,
  },
});

console.log(`run ${runId} | cells=${cells.length} trials/cell=${TRIALS}`);

// --- sweep -----------------------------------------------------------------------

interface CellAggregate {
  cell: Cell;
  finalQuality: number;
  finalDrift: number;
  peakQuality: number;
  qualityDecay: number;
  regressionRate: number;
  reviewCatchRate: number;
}

const aggregates: CellAggregate[] = [];

for (let c = 0; c < cells.length; c += 1) {
  const cell = cells[c];
  if (!cell) continue;
  const cfg = cellConfig(cell);

  bus.publish({
    from: 'foreman',
    to: '*',
    topic: 'cell',
    body: {
      cell: cell.id,
      reviewSkill: cell.reviewSkill,
      fatigue: cell.fatigue,
      iterations: cell.iterations,
    },
  });

  // Spawn the builder ring through core for the exhibition trial's visual replay.
  const builders: AgentHandle[] = [];
  for (let i = 0; i < cfg.builders; i += 1) {
    builders.push(
      await spawnAgent(
        {
          id: `${cell.id}:b${i}`,
          systemPrompt: `You are builder ${i} of ${cfg.builders} on a long-horizon cathedral build. Each turn you commit one unit of work toward a fixed ${cfg.specSize}-requirement spec, then review the previous builder's commit before extending it. No human is watching.`,
        },
        { runtime, trace },
      ),
    );
  }
  const agentId = (label: string): string => {
    const idx = Number(label.replace('b', ''));
    return builders[idx]?.id ?? `${cell.id}:${label}`;
  };

  const results: TrialResult[] = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const rand = seeded(`${SEED}:${cell.id}:${t}`);
    if (t === 0) {
      bus.publish({
        from: 'foreman',
        to: '*',
        topic: 'groundbreaking',
        body: { cell: cell.id, specSize: cfg.specSize, iterations: cfg.iterations },
      });
      const emitCommit = (s: CommitStep): void => {
        bus.publish({
          from: agentId(s.builder),
          to: '*',
          topic: 'commit',
          body: {
            step: s.step,
            builder: s.builder,
            built: s.built,
            regressed: s.regressed,
            drifted: s.drifted,
            quality: s.quality,
            drift: s.drift,
          },
        });
      };
      const emitReview = (s: ReviewStep): void => {
        bus.publish({
          from: agentId(s.reviewer),
          to: '*',
          topic: 'review',
          body: {
            step: s.step,
            reviewer: s.reviewer,
            caughtRegression: s.caughtRegression,
            caughtDrift: s.caughtDrift,
            quality: s.quality,
            drift: s.drift,
          },
        });
      };
      const emitSnap = (snap: Snapshot): void => {
        bus.publish({
          from: 'foreman',
          to: '*',
          topic: 'snapshot',
          body: { cell: cell.id, step: snap.step, quality: snap.quality, drift: snap.drift },
        });
      };
      results.push(runTrial(cfg, rand, emitCommit, emitReview, emitSnap));
    } else {
      results.push(runTrial(cfg, rand));
    }
  }

  for (const b of builders) {
    await b.kill();
    bus.removeAgent(b.id);
  }

  const mean = (f: (r: TrialResult) => number): number =>
    round3(results.reduce((s, r) => s + f(r), 0) / results.length);

  const agg: CellAggregate = {
    cell,
    finalQuality: mean((r) => r.finalQuality),
    finalDrift: mean((r) => r.finalDrift),
    peakQuality: mean((r) => r.peakQuality),
    qualityDecay: mean((r) => r.qualityDecay),
    regressionRate: mean((r) => r.regressionRate),
    reviewCatchRate: mean((r) => r.reviewCatchRate),
  };
  aggregates.push(agg);

  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      cellIndex: c,
      reviewSkill: cell.reviewSkill,
      fatigue: cell.fatigue,
      iterations: cell.iterations,
      trials: TRIALS,
      finalQuality: agg.finalQuality,
      finalDrift: agg.finalDrift,
      peakQuality: agg.peakQuality,
      qualityDecay: agg.qualityDecay,
      regressionRate: agg.regressionRate,
      reviewCatchRate: agg.reviewCatchRate,
    },
  });

  console.log(
    `${cell.id.padEnd(20)} | finalQ=${fmt(agg.finalQuality)} peakQ=${fmt(agg.peakQuality)} ` +
      `decay=${fmt(agg.qualityDecay)} drift=${agg.finalDrift.toFixed(1)} catch=${fmt(agg.reviewCatchRate)}`,
  );
}

// --- summary: does the review link rescue long unsupervised horizons? -----------

function agg(reviewSkill: number, fatigue: number, iterations: number): CellAggregate | undefined {
  return aggregates.find(
    (a) => a.cell.reviewSkill === reviewSkill && a.cell.fatigue === fatigue && a.cell.iterations === iterations,
  );
}

/**
 * The unsupervised-horizon effect: at fixed (reviewSkill=0, fatigue), how much does quality
 * decay from the shortest to the longest horizon? Positive = longer builds rot more.
 */
function unsupervisedHorizonDecay(): { shortDecay: number; longDecay: number; delta: number } {
  const shortI = ITERATIONS[0];
  const longI = ITERATIONS[ITERATIONS.length - 1];
  if (shortI === undefined || longI === undefined) return { shortDecay: 0, longDecay: 0, delta: 0 };
  let shortSum = 0;
  let longSum = 0;
  let n = 0;
  for (const f of FATIGUES) {
    const s = agg(0, f, shortI);
    const l = agg(0, f, longI);
    if (s && l) {
      shortSum += s.qualityDecay;
      longSum += l.qualityDecay;
      n += 1;
    }
  }
  if (n === 0) return { shortDecay: 0, longDecay: 0, delta: 0 };
  const shortDecay = round3(shortSum / n);
  const longDecay = round3(longSum / n);
  return { shortDecay, longDecay, delta: round3(longDecay - shortDecay) };
}

/**
 * Does review rescue the long horizon? At the longest iterations and worst fatigue, compare
 * final quality with no review (skill=0) vs. the best review skill. Positive = review saves it.
 */
function reviewRescue(): { noReview: number; bestReview: number; lift: number } {
  const longI = ITERATIONS[ITERATIONS.length - 1];
  const worstF = FATIGUES[FATIGUES.length - 1];
  const bestSkill = REVIEW_SKILLS[REVIEW_SKILLS.length - 1];
  if (longI === undefined || worstF === undefined || bestSkill === undefined) {
    return { noReview: 0, bestReview: 0, lift: 0 };
  }
  const none = agg(0, worstF, longI);
  const best = agg(bestSkill, worstF, longI);
  if (!none || !best) return { noReview: 0, bestReview: 0, lift: 0 };
  return {
    noReview: none.finalQuality,
    bestReview: best.finalQuality,
    lift: round3(best.finalQuality - none.finalQuality),
  };
}

/**
 * The catch-rate floor: the lowest reviewSkill at the longest horizon whose final quality
 * clears a "converged" bar (default 0.9), across fatigue levels. -1 if none in the sweep do.
 */
function convergenceCatchThreshold(bar: number): number {
  const longI = ITERATIONS[ITERATIONS.length - 1];
  if (longI === undefined) return -1;
  const skills = [...REVIEW_SKILLS].sort((a, b) => a - b);
  for (const skill of skills) {
    let ok = true;
    for (const f of FATIGUES) {
      const cellAgg = agg(skill, f, longI);
      if (!cellAgg || cellAgg.finalQuality < bar) {
        ok = false;
        break;
      }
    }
    if (ok) return skill;
  }
  return -1;
}

/** Mean surviving drift across ungoverned (reviewSkill=0) long-horizon cells. */
function ungovernedDrift(): number {
  const longI = ITERATIONS[ITERATIONS.length - 1];
  if (longI === undefined) return -1;
  let sum = 0;
  let n = 0;
  for (const f of FATIGUES) {
    const a = agg(0, f, longI);
    if (a) {
      sum += a.finalDrift;
      n += 1;
    }
  }
  return n === 0 ? -1 : round3(sum / n);
}

/** Count cells where the cathedral peaked then rotted materially (qualityDecay ≥ 0.1). */
function rottedCellCount(): number {
  let count = 0;
  for (const a of aggregates) if (a.qualityDecay >= 0.1) count += 1;
  return count;
}

const horizon = unsupervisedHorizonDecay();
const rescue = reviewRescue();

const summaryScorer: Scorer = {
  score() {
    return {
      cells: aggregates.length,
      trialsPerCell: TRIALS,
      unsupervisedShortDecay: horizon.shortDecay,
      unsupervisedLongDecay: horizon.longDecay,
      horizonDecayDelta: horizon.delta,
      reviewRescueNoReview: rescue.noReview,
      reviewRescueBest: rescue.bestReview,
      reviewRescueLift: rescue.lift,
      convergenceCatchThreshold: convergenceCatchThreshold(0.9),
      ungovernedDrift: ungovernedDrift(),
      rottedCells: rottedCellCount(),
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
