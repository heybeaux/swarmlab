/**
 * Economic agents — sweep runner.
 *
 * For every (cost c × budget B) cell we run TRIALS seeded trials through the metered
 * economy engine. Trial 0 of each cell is the "exhibition" trial: its worker agents are
 * spawned through core and every paid message + end-of-round snapshot is broadcast on the
 * core bus, so the trace replays visually in the observatory. All trials feed the cell's
 * aggregate score. Balance changes are carried on each `message` body (`balanceAfter`),
 * so the ledger is fully reconstructable from the append-only trace.
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
import type { EconMessage, RoundSnapshot, TrialConfig, TrialResult } from './types.js';

// --- configuration -----------------------------------------------------------

const TRIALS = Number(process.env.ECON_TRIALS ?? 30);
const SEED = process.env.ECON_SEED ?? 'economic-agents-v1';

/** Per-message cost sweep: free speech → prohibitively expensive speech. */
const COSTS: readonly number[] = [1, 2, 4, 8, 12, 16, 24];
/** Starting-budget sweep: destitute → lean → flush wallets. */
const BUDGETS: readonly number[] = [10, 20, 40, 80, 160];

const AGENTS = Number(process.env.ECON_AGENTS ?? 12);
const PIECES = Number(process.env.ECON_PIECES ?? 8);
const MAX_ROUNDS = Number(process.env.ECON_MAXROUNDS ?? 60);

interface Cell {
  id: string;
  cost: number;
  budget: number;
}

const cells: Cell[] = [];
for (const budget of BUDGETS) {
  for (const cost of COSTS) {
    cells.push({ id: `c${cost}-B${budget}`, cost, budget });
  }
}

function cellConfig(cell: Cell): TrialConfig {
  return {
    agents: AGENTS,
    pieces: PIECES,
    budget: cell.budget,
    cost: cell.cost,
    maxRounds: MAX_ROUNDS,
  };
}

// --- setup ---------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `econ-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '10-economic-agents' });
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
    costs: COSTS,
    budgets: BUDGETS,
    agents: AGENTS,
    pieces: PIECES,
    maxRounds: MAX_ROUNDS,
  },
});

console.log(`run ${runId} | cells=${cells.length} trials/cell=${TRIALS} agents=${AGENTS} pieces=${PIECES}`);

// --- sweep -----------------------------------------------------------------------

interface CellAggregate {
  cell: Cell;
  completionRate: number;
  meanTimeToComplete: number;
  meanTotalMessages: number;
  meanBankruptcies: number;
  meanGiniComms: number;
  meanAvgBalanceRemaining: number;
  meanFinalCoverage: number;
}

const aggregates: CellAggregate[] = [];

/** Cap on how many worker agents we spawn through core per exhibition trial (trace hygiene). */
const EXHIBITION_AGENT_CAP = 12;

for (let c = 0; c < cells.length; c += 1) {
  const cell = cells[c];
  if (!cell) continue;
  const cfg = cellConfig(cell);

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'cell',
    body: { cell: cell.id, cost: cell.cost, budget: cell.budget },
  });

  // Spawn a capped set of worker agents for the exhibition trial's visual replay.
  const spawnCount = Math.min(cfg.agents, EXHIBITION_AGENT_CAP);
  const workers: AgentHandle[] = [];
  for (let i = 0; i < spawnCount; i += 1) {
    workers.push(
      await spawnAgent(
        {
          id: `${cell.id}:w${i}`,
          systemPrompt:
            i === 0
              ? `You are the aggregator in a swarm of ${cfg.agents}. Collect all ${cfg.pieces} task pieces.`
              : `You are worker ${i} in a swarm of ${cfg.agents}. Forward task pieces toward the aggregator. Each message costs ${cell.cost} tokens from your budget of ${cell.budget}.`,
        },
        { runtime, trace },
      ),
    );
  }
  const workerId = (idx: number): string =>
    idx < spawnCount ? (workers[idx]?.id ?? `${cell.id}:w${idx}`) : `${cell.id}:w${idx}`;

  const results: TrialResult[] = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const rand = seeded(`${SEED}:${cell.id}:${t}`);
    if (t === 0) {
      bus.publish({
        from: 'moderator',
        to: '*',
        topic: 'deal',
        body: { cell: cell.id, pieces: cfg.pieces, budget: cfg.budget, cost: cfg.cost },
      });
      const emit = (m: EconMessage): void => {
        bus.publish({
          from: workerId(m.from),
          to: m.to < spawnCount ? workerId(m.to) : '*',
          topic: 'forward',
          body: {
            round: m.round,
            from: m.from,
            to: m.to,
            piece: m.piece,
            balanceAfter: m.balanceAfter,
            delivered: m.delivered,
          },
        });
      };
      const emitSnap = (snap: RoundSnapshot): void => {
        bus.publish({
          from: 'moderator',
          to: '*',
          topic: 'snapshot',
          body: { cell: cell.id, round: snap.round, coverage: snap.coverage, muted: snap.muted },
        });
      };
      results.push(runTrial(cfg, rand, emit, emitSnap));
    } else {
      results.push(runTrial(cfg, rand));
    }
  }

  for (const w of workers) {
    await w.kill();
    bus.removeAgent(w.id);
  }

  const mean = (f: (r: TrialResult) => number): number =>
    round3(results.reduce((s, r) => s + f(r), 0) / results.length);

  const agg: CellAggregate = {
    cell,
    completionRate: mean((r) => (r.completed ? 1 : 0)),
    meanTimeToComplete: mean((r) => r.timeToComplete),
    meanTotalMessages: mean((r) => r.totalMessages),
    meanBankruptcies: mean((r) => r.bankruptcies),
    meanGiniComms: mean((r) => r.giniComms),
    meanAvgBalanceRemaining: mean((r) => r.avgBalanceRemaining),
    meanFinalCoverage: mean((r) => r.finalCoverage),
  };
  aggregates.push(agg);

  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      cellIndex: c,
      cost: cell.cost,
      budget: cell.budget,
      trials: TRIALS,
      completionRate: agg.completionRate,
      meanTimeToComplete: agg.meanTimeToComplete,
      totalMessages: agg.meanTotalMessages,
      bankruptcies: agg.meanBankruptcies,
      giniComms: agg.meanGiniComms,
      avgBalanceRemaining: agg.meanAvgBalanceRemaining,
      finalCoverage: agg.meanFinalCoverage,
    },
  });

  console.log(
    `${cell.id.padEnd(12)} | done=${fmt(agg.completionRate)} ttc=${fmt(agg.meanTimeToComplete)} ` +
      `msgs=${fmt(agg.meanTotalMessages)} bankrupt=${fmt(agg.meanBankruptcies)} ` +
      `gini=${fmt(agg.meanGiniComms)} bal=${fmt(agg.meanAvgBalanceRemaining)} cov=${fmt(agg.meanFinalCoverage)}`,
  );
}

// --- summary: where does collaboration break under price? ------------------------

function agg(cost: number, budget: number): CellAggregate | undefined {
  return aggregates.find((a) => a.cell.cost === cost && a.cell.budget === budget);
}

/**
 * The scarcity threshold: at each budget, the lowest per-message COST at which the mean
 * completion rate drops below `floor` (collaboration "breaks"), and the cost/budget RATIO
 * at that break. The headline claim is that the ratio — not the absolute cost — is the
 * invariant, so we report the ratio at each budget and its mean/spread across budgets.
 */
function scarcityThreshold(floor: number): {
  breakCostByBudget: Record<string, number>;
  breakRatioByBudget: Record<string, number>;
  meanRatio: number;
} {
  const breakCostByBudget: Record<string, number> = {};
  const breakRatioByBudget: Record<string, number> = {};
  let ratioSum = 0;
  let ratioN = 0;
  for (const budget of BUDGETS) {
    let breakCost = Number.POSITIVE_INFINITY;
    for (const cost of COSTS) {
      const a = agg(cost, budget);
      if (a && a.completionRate < floor) {
        breakCost = cost;
        break;
      }
    }
    const finite = Number.isFinite(breakCost);
    breakCostByBudget[`B${budget}`] = finite ? breakCost : -1;
    breakRatioByBudget[`B${budget}`] = finite ? round3(breakCost / budget) : -1;
    if (finite) {
      ratioSum += breakCost / budget;
      ratioN += 1;
    }
  }
  return {
    breakCostByBudget,
    breakRatioByBudget,
    meanRatio: ratioN === 0 ? -1 : round3(ratioSum / ratioN),
  };
}

/** Mean Gini of communication across cheap cells vs expensive cells: does price concentrate voice? */
function giniShift(): { cheap: number; expensive: number; delta: number } {
  const loC = COSTS[0];
  const hiC = COSTS[COSTS.length - 1];
  if (loC === undefined || hiC === undefined) return { cheap: 0, expensive: 0, delta: 0 };
  const meanFor = (cost: number): number => {
    let sum = 0;
    let n = 0;
    for (const budget of BUDGETS) {
      const a = agg(cost, budget);
      if (a) {
        sum += a.meanGiniComms;
        n += 1;
      }
    }
    return n === 0 ? 0 : sum / n;
  };
  const cheap = round3(meanFor(loC));
  const expensive = round3(meanFor(hiC));
  return { cheap, expensive, delta: round3(expensive - cheap) };
}

/** Count cells that fail to complete while wallets still hold tokens: coordination failure, not just poverty. */
function starvedWithMoneyCount(): number {
  let count = 0;
  for (const a of aggregates) {
    if (a.completionRate < 0.5 && a.meanAvgBalanceRemaining > a.cell.cost) count += 1;
  }
  return count;
}

/** The most expensive cell that still completes reliably (completion ≥ 0.99): the affordability frontier. */
function affordabilityFrontier(): { id: string; cost: number; budget: number } {
  let best: CellAggregate | undefined;
  for (const a of aggregates) {
    if (a.completionRate >= 0.99) {
      if (!best || a.cell.cost > best.cell.cost) best = a;
    }
  }
  return best
    ? { id: best.cell.id, cost: best.cell.cost, budget: best.cell.budget }
    : { id: 'none', cost: -1, budget: -1 };
}

const threshold = scarcityThreshold(0.9);
const shift = giniShift();
const frontier = affordabilityFrontier();

const summaryScorer: Scorer = {
  score() {
    return {
      cells: aggregates.length,
      trialsPerCell: TRIALS,
      scarcityMeanCostBudgetRatio: threshold.meanRatio,
      giniCheap: shift.cheap,
      giniExpensive: shift.expensive,
      giniDelta: shift.delta,
      starvedWithMoney: starvedWithMoneyCount(),
      frontierCost: frontier.cost,
      frontierBudget: frontier.budget,
    };
  },
};
const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));
console.log('scarcity break-cost by budget:', JSON.stringify(threshold.breakCostByBudget));
console.log('scarcity break-ratio (cost/budget) by budget:', JSON.stringify(threshold.breakRatioByBudget));

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
