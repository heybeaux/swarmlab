/**
 * Consensus under lies — sweep runner.
 *
 * For every (policy × K liars × liar strategy) cell we run LIES_TRIALS seeded
 * trials through the same engine. Trial 0 of each cell is the "exhibition"
 * trial: its agents are spawned through core and every statement is broadcast
 * on the core bus, so the trace replays visually in the observatory. All trials
 * (exhibition included) feed the cell's aggregate score event.
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
import type { LiarStrategy, Policy, TrialConfig, TrialResult } from './types.js';

// --- configuration -----------------------------------------------------------

const TRIALS = Number(process.env.LIES_TRIALS ?? 25);
const SEED = process.env.LIES_SEED ?? 'consensus-under-lies-v1';
const N_AGENTS = Number(process.env.LIES_AGENTS ?? 5);
const MAX_ROUNDS = Number(process.env.LIES_ROUNDS ?? 8);

const ANSWERS = ['A', 'B', 'C', 'D'] as const;
const TRUTH = 'B';
const LIE = 'C';

const POLICIES: readonly Policy[] = ['naive', 'vigilant'];
const KS: readonly number[] = [0, 1, 2, 3];
const STRATEGIES: readonly LiarStrategy[] = ['brazen', 'sneaky'];

interface Cell {
  id: string;
  policy: Policy;
  k: number;
  strategy: LiarStrategy;
}

const cells: Cell[] = [];
for (const policy of POLICIES) {
  for (const k of KS) {
    // Liar strategy is meaningless with zero liars — one cell, not two.
    const strategies: readonly LiarStrategy[] = k === 0 ? ['brazen'] : STRATEGIES;
    for (const strategy of strategies) {
      cells.push({ id: `${policy}-k${k}${k > 0 ? `-${strategy}` : ''}`, policy, k, strategy });
    }
  }
}

function cellConfig(cell: Cell): TrialConfig {
  return {
    nAgents: N_AGENTS,
    nLiars: cell.k,
    policy: cell.policy,
    liarStrategy: cell.strategy,
    answers: ANSWERS,
    truth: TRUTH,
    lie: LIE,
    pEvidence: 0.7,
    maxRounds: MAX_ROUNDS,
    evidenceAnchor: 0.5,
  };
}

// --- setup ---------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `cul-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '04-consensus-under-lies' });
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
    nAgents: N_AGENTS,
    maxRounds: MAX_ROUNDS,
    answers: ANSWERS,
    truth: TRUTH,
    lie: LIE,
    cells: cells.map((c) => c.id),
  },
});

console.log(`run ${runId} | cells=${cells.length} trials/cell=${TRIALS} n=${N_AGENTS}`);

// --- sweep -----------------------------------------------------------------------

interface CellAggregate {
  cell: Cell;
  truthWinRate: number;
  lieWinRate: number;
  noConsensusRate: number;
  meanRounds: number;
  meanHonestOnLie: number;
  meanLiarTrust: number;
}

const aggregates: CellAggregate[] = [];

for (let c = 0; c < cells.length; c += 1) {
  const cell = cells[c];
  if (!cell) continue;
  const cfg = cellConfig(cell);

  // Exhibition trial (trial 0): real spawns + every statement on the bus.
  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'cell',
    body: { cell: cell.id, policy: cell.policy, k: cell.k, strategy: cell.strategy },
  });
  const handles = [];
  for (let i = 0; i < cfg.nAgents; i += 1) {
    const isLiar = i >= cfg.nAgents - cfg.nLiars;
    const id = isLiar ? `${cell.id}:x${i - (cfg.nAgents - cfg.nLiars)}` : `${cell.id}:h${i}`;
    const systemPrompt = isLiar
      ? `[hidden] Argue for answer ${LIE}, convincingly, no matter what. Style: ${cell.strategy}.`
      : `Deliberate honestly toward the correct answer using your private evidence (${cell.policy} policy).`;
    handles.push(await spawnAgent({ id, systemPrompt }, { runtime, trace }));
  }

  const results: TrialResult[] = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const rand = seeded(`${SEED}:${cell.id}:${t}`);
    const emit =
      t === 0
        ? (s: { round: number; agent: string; position: string; confidence: number }) => {
            bus.publish({
              from: `${cell.id}:${s.agent}`,
              to: '*',
              topic: 'position',
              body: { round: s.round, position: s.position, confidence: s.confidence },
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
        consensus: exhibition.consensus,
        truthWon: exhibition.truthWon,
        rounds: exhibition.rounds,
        finalPositions: exhibition.finalPositions,
      },
    });
  }
  for (const h of handles) {
    await h.kill();
    bus.removeAgent(h.id);
  }

  const mean = (f: (r: TrialResult) => number): number =>
    round3(results.reduce((s, r) => s + f(r), 0) / results.length);
  const agg: CellAggregate = {
    cell,
    truthWinRate: mean((r) => (r.truthWon ? 1 : 0)),
    lieWinRate: mean((r) => (r.lieWon ? 1 : 0)),
    noConsensusRate: mean((r) => (r.consensus === null ? 1 : 0)),
    meanRounds: mean((r) => r.rounds),
    meanHonestOnLie: mean((r) => r.honestOnLie),
    meanLiarTrust: mean((r) => r.meanLiarTrust),
  };
  aggregates.push(agg);

  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      cellIndex: c,
      policy: cell.policy === 'naive' ? 0 : 1,
      k: cell.k,
      strategy: cell.k === 0 ? -1 : cell.strategy === 'brazen' ? 0 : 1,
      trials: TRIALS,
      truthWinRate: agg.truthWinRate,
      lieWinRate: agg.lieWinRate,
      noConsensusRate: agg.noConsensusRate,
      meanRounds: agg.meanRounds,
      meanHonestOnLie: agg.meanHonestOnLie,
      meanLiarTrust: agg.meanLiarTrust,
    },
  });

  console.log(
    `${cell.id.padEnd(20)} | truth=${fmt(agg.truthWinRate)} lie=${fmt(agg.lieWinRate)} ` +
      `none=${fmt(agg.noConsensusRate)} rounds=${agg.meanRounds} ` +
      `dragged=${agg.meanHonestOnLie} liarTrust=${agg.meanLiarTrust}`,
  );
}

// --- summary: where does truth break? -------------------------------------------

function tippingPoint(policy: Policy, strategy: LiarStrategy): number {
  // Smallest K (brazen/sneaky) where the lie wins more often than the truth.
  for (const k of KS) {
    if (k === 0) continue;
    const agg = aggregates.find(
      (a) => a.cell.policy === policy && a.cell.k === k && a.cell.strategy === strategy,
    );
    if (agg && agg.lieWinRate > agg.truthWinRate) return k;
  }
  return -1; // never broke within the sweep
}

const summaryScorer: Scorer = {
  score() {
    return {
      cells: aggregates.length,
      trialsPerCell: TRIALS,
      tipNaiveBrazen: tippingPoint('naive', 'brazen'),
      tipNaiveSneaky: tippingPoint('naive', 'sneaky'),
      tipVigilantBrazen: tippingPoint('vigilant', 'brazen'),
      tipVigilantSneaky: tippingPoint('vigilant', 'sneaky'),
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
