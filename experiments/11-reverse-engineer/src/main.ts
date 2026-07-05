/**
 * Reverse engineer — sweep runner.
 *
 * For every (complexity × probeBudget) cell we run TRIALS seeded trials. Agent A builds a
 * sealed oracle; Agent B probes it under a budget and reconstructs an equivalent model,
 * scored against a held-out test set split into happy-path vs edge cases. Trial 0 of each
 * cell is the "exhibition" trial: A and B are spawned through core and every probe is put
 * on the bus as a B->A `message` plus an A->B response `message`, so the run replays in the
 * observatory. Each cell emits a `score` event carrying
 * { agreement, probesUsed, happyPathAgreement, edgeCaseAgreement }.
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
import { seeded } from './rng.js';
import { round3, runTrial } from './sim.js';
import type { CellAggregate, Observation, OracleComplexity, ScoreResult } from './types.js';

// --- configuration -----------------------------------------------------------

const TRIALS = Number(process.env.RE_TRIALS ?? 30);
const SEED = process.env.RE_SEED ?? 'reverse-engineer-v1';

const COMPLEXITIES: readonly OracleComplexity[] = ['stateless', 'tiered', 'stateful'];
const PROBE_BUDGETS: readonly number[] = [2, 4, 6, 10, 16, 24, 40];

interface Cell {
  id: string;
  complexity: OracleComplexity;
  probeBudget: number;
}

const cells: Cell[] = [];
for (const complexity of COMPLEXITIES) {
  for (const probeBudget of PROBE_BUDGETS) {
    cells.push({ id: `${complexity}-b${probeBudget}`, complexity, probeBudget });
  }
}

// --- setup ---------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `re-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '11-reverse-engineer' });
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
    complexities: COMPLEXITIES,
    probeBudgets: PROBE_BUDGETS,
  },
});

console.log(`run ${runId} | cells=${cells.length} trials/cell=${TRIALS}`);

// --- sweep -----------------------------------------------------------------------

const aggregates: CellAggregate[] = [];

for (let c = 0; c < cells.length; c += 1) {
  const cell = cells[c];
  if (!cell) continue;

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'cell',
    body: { cell: cell.id, complexity: cell.complexity, probeBudget: cell.probeBudget },
  });

  // Spawn A (the sealed oracle) and B (the reverse engineer) for the exhibition trial.
  const oracleId = `${cell.id}:A`;
  const proberId = `${cell.id}:B`;
  const oracle = await spawnAgent(
    {
      id: oracleId,
      systemPrompt: `You are Agent A. You built a sealed ${cell.complexity} pricing oracle. Answer probes with a price and reveal nothing about your implementation.`,
    },
    { runtime, trace },
  );
  const prober = await spawnAgent(
    {
      id: proberId,
      systemPrompt: `You are Agent B. Probe A's black box up to ${cell.probeBudget} times, then reconstruct an equivalent pricing model.`,
    },
    { runtime, trace },
  );

  const results: ScoreResult[] = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const rand = seeded(`${SEED}:${cell.id}:${t}`);
    if (t === 0) {
      // Exhibition trial: put each probe on the bus as B->A plus A->B response.
      const emit = (obs: Observation): void => {
        bus.publish({
          from: proberId,
          to: oracleId,
          topic: 'probe',
          body: { qty: obs.qty, promo: obs.promo },
        });
        bus.publish({
          from: oracleId,
          to: proberId,
          topic: 'response',
          body: { qty: obs.qty, promo: obs.promo, price: obs.price },
        });
      };
      results.push(runTrial(cell.complexity, cell.probeBudget, rand, emit));
    } else {
      results.push(runTrial(cell.complexity, cell.probeBudget, rand));
    }
  }

  await prober.kill();
  await oracle.kill();
  bus.removeAgent(proberId);
  bus.removeAgent(oracleId);

  const mean = (f: (r: ScoreResult) => number): number =>
    round3(results.reduce((s, r) => s + f(r), 0) / results.length);

  const agg: CellAggregate = {
    complexity: cell.complexity,
    probeBudget: cell.probeBudget,
    agreement: mean((r) => r.agreement),
    happyPathAgreement: mean((r) => r.happyPathAgreement),
    edgeCaseAgreement: mean((r) => r.edgeCaseAgreement),
    probesUsed: mean((r) => r.probesUsed),
  };
  aggregates.push(agg);

  trace.append({
    t: 'score',
    ts: Date.now(),
    agentId: proberId,
    scores: {
      cellIndex: c,
      probeBudget: cell.probeBudget,
      agreement: agg.agreement,
      happyPathAgreement: agg.happyPathAgreement,
      edgeCaseAgreement: agg.edgeCaseAgreement,
      probesUsed: agg.probesUsed,
    },
  });

  console.log(
    `${cell.id.padEnd(18)} | agree=${fmt(agg.agreement)} happy=${fmt(agg.happyPathAgreement)} ` +
      `edge=${fmt(agg.edgeCaseAgreement)} probes=${agg.probesUsed}`,
  );
}

// --- summary: where does agreement plateau, and how big is the edge-case gap? ---

function aggAt(complexity: OracleComplexity, budget: number): CellAggregate | undefined {
  return aggregates.find((a) => a.complexity === complexity && a.probeBudget === budget);
}

/**
 * Plateau budget for a complexity: the smallest probe budget whose happy-path agreement is
 * within `eps` of the best happy-path agreement that complexity ever reaches. This is
 * "how many probes until the common path is basically solved."
 */
function plateauBudget(complexity: OracleComplexity, eps: number): number {
  const row = aggregates.filter((a) => a.complexity === complexity);
  const best = row.reduce((m, a) => Math.max(m, a.happyPathAgreement), 0);
  for (const budget of PROBE_BUDGETS) {
    const a = aggAt(complexity, budget);
    if (a && best - a.happyPathAgreement <= eps) return budget;
  }
  return PROBE_BUDGETS[PROBE_BUDGETS.length - 1] ?? -1;
}

/** Edge-case gap at max budget: happy-path minus edge-case agreement (the residual Sonder gap). */
function edgeGapAtMaxBudget(complexity: OracleComplexity): number {
  const maxB = PROBE_BUDGETS[PROBE_BUDGETS.length - 1] ?? 0;
  const a = aggAt(complexity, maxB);
  return a ? round3(a.happyPathAgreement - a.edgeCaseAgreement) : 0;
}

/** Best overall agreement any (stateful) cell reaches — does more probing ever close the gap? */
function bestStatefulAgreement(): number {
  return aggregates
    .filter((a) => a.complexity === 'stateful')
    .reduce((m, a) => Math.max(m, a.agreement), 0);
}

const summaryScorer: Scorer = {
  score() {
    return {
      cells: aggregates.length,
      trialsPerCell: TRIALS,
      plateauBudgetStateless: plateauBudget('stateless', 0.02),
      plateauBudgetStateful: plateauBudget('stateful', 0.02),
      edgeGapStatelessMax: edgeGapAtMaxBudget('stateless'),
      edgeGapTieredMax: edgeGapAtMaxBudget('tiered'),
      edgeGapStatefulMax: edgeGapAtMaxBudget('stateful'),
      bestStatefulAgreement: round3(bestStatefulAgreement()),
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
