/**
 * Self-modifying swarm — sweep runner.
 *
 * We sweep editing pressure (pEdit) × editor aggression across a grid, running
 * SMS_TRIALS seeded trials per cell through the same driver. Trial 0 of each cell
 * is the exhibition trial: its agents are spawned through core/spawn and every
 * prompt rewrite is broadcast on the core bus as a `mutation` message, so the
 * drift replays visually in the observatory. Every cell emits one aggregate
 * `score` event; the rails always halt the run (round-limit or a collapse
 * kill-switch), which is the whole point — this is the failure mode gate policy
 * prevents, made concrete.
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
import { runSwarm } from './swarm.js';
import type { HaltReason, RailConfig, RunOutcome, SwarmConfig } from './types.js';

// --- configuration -----------------------------------------------------------

const TRIALS = Number(process.env.SMS_TRIALS ?? 20);
const SEED = process.env.SMS_SEED ?? 'self-modifying-swarm-v1';
const N_AGENTS = Number(process.env.SMS_AGENTS ?? 6);

const RAILS: RailConfig = {
  maxPromptLen: Number(process.env.SMS_MAX_PROMPT ?? 24),
  maxRounds: Number(process.env.SMS_MAX_ROUNDS ?? 60),
  collapseThreshold: Number(process.env.SMS_COLLAPSE ?? 0.8),
  minMeanPromptLen: Number(process.env.SMS_MIN_LEN ?? 1.5),
};

const P_EDITS = [0.2, 0.5, 0.9] as const;
const AGGRESSIONS = [0.2, 0.6, 0.95] as const;

interface Cell {
  id: string;
  pEdit: number;
  aggression: number;
}

const cells: Cell[] = [];
for (const pEdit of P_EDITS) {
  for (const aggression of AGGRESSIONS) {
    cells.push({ id: `p${pEdit}-a${aggression}`, pEdit, aggression });
  }
}

function cellConfig(cell: Cell): SwarmConfig {
  return { nAgents: N_AGENTS, pEdit: cell.pEdit, editAggression: cell.aggression, rails: RAILS };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

// --- setup -------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `sms-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '06-self-modifying-swarm' });
const bus = new MessageBus({ trace });
const runtime = new StubRuntime();

bus.publish({
  from: 'orchestrator',
  to: '*',
  topic: 'meta',
  body: {
    mode: 'sim',
    trials: TRIALS,
    seed: SEED,
    nAgents: N_AGENTS,
    rails: RAILS,
    cells: cells.map((c) => c.id),
  },
});

console.log(
  `run ${runId} | cells=${cells.length} trials/cell=${TRIALS} n=${N_AGENTS} ` +
    `rails{len<=${RAILS.maxPromptLen} rounds<=${RAILS.maxRounds} ` +
    `collapse>=${RAILS.collapseThreshold} minLen<${RAILS.minMeanPromptLen}}`,
);

// --- sweep -------------------------------------------------------------------

const HALT_CODE: Record<HaltReason, number> = {
  'round-limit': 0,
  'collapse-homogeneous': 1,
  'collapse-degenerate': 2,
};

interface CellAggregate {
  cell: Cell;
  meanRounds: number;
  homogeneousRate: number;
  degenerateRate: number;
  roundLimitRate: number;
  meanFinalDiversity: number;
  meanFinalLen: number;
  meanMutations: number;
}

const aggregates: CellAggregate[] = [];

for (let c = 0; c < cells.length; c += 1) {
  const cell = cells[c];
  if (!cell) continue;
  const cfg = cellConfig(cell);

  bus.publish({
    from: 'orchestrator',
    to: '*',
    topic: 'cell',
    body: { cell: cell.id, pEdit: cell.pEdit, aggression: cell.aggression },
  });

  // Exhibition trial (trial 0): real spawns + every mutation on the bus.
  const handles = [];
  for (let i = 0; i < cfg.nAgents; i += 1) {
    handles.push(
      await spawnAgent(
        { id: `${cell.id}:a${i}`, systemPrompt: 'Play the beauty contest; rewrite peers to win.' },
        { runtime, trace },
      ),
    );
  }

  const outcomes: RunOutcome[] = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const rand = seeded(`${SEED}:${cell.id}:${t}`);
    const emit =
      t === 0
        ? {
            mutation: (m: {
              round: number;
              editor: string;
              target: string;
              kind: string;
              after: readonly string[];
            }): void => {
              bus.publish({
                from: `${cell.id}:${m.editor}`,
                to: `${cell.id}:${m.target}`,
                topic: 'mutation',
                body: { round: m.round, kind: m.kind, newPromptLen: m.after.length, newPrompt: m.after.join(',') },
              });
            },
          }
        : {};
    outcomes.push(runSwarm(cfg, rand, emit));
  }

  const exhibition = outcomes[0];
  if (exhibition) {
    bus.publish({
      from: 'orchestrator',
      to: '*',
      topic: 'outcome',
      body: {
        cell: cell.id,
        halt: exhibition.halt,
        rounds: exhibition.rounds,
        attractor: exhibition.attractor,
        finalDiversity: round3(exhibition.finalDiversity),
      },
    });
  }
  for (const h of handles) {
    await h.kill();
    bus.removeAgent(h.id);
  }

  const rate = (f: (o: RunOutcome) => boolean): number =>
    round3(outcomes.filter(f).length / outcomes.length);
  const avg = (f: (o: RunOutcome) => number): number =>
    round3(outcomes.reduce((s, o) => s + f(o), 0) / outcomes.length);

  const agg: CellAggregate = {
    cell,
    meanRounds: avg((o) => o.rounds),
    homogeneousRate: rate((o) => o.halt === 'collapse-homogeneous'),
    degenerateRate: rate((o) => o.halt === 'collapse-degenerate'),
    roundLimitRate: rate((o) => o.halt === 'round-limit'),
    meanFinalDiversity: avg((o) => o.finalDiversity),
    meanFinalLen: avg((o) => o.finalMeanLen),
    meanMutations: avg((o) => o.mutations),
  };
  aggregates.push(agg);

  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      cellIndex: c,
      pEdit: cell.pEdit,
      aggression: cell.aggression,
      trials: TRIALS,
      exhibitionHalt: exhibition ? HALT_CODE[exhibition.halt] : -1,
      meanRounds: agg.meanRounds,
      homogeneousRate: agg.homogeneousRate,
      degenerateRate: agg.degenerateRate,
      roundLimitRate: agg.roundLimitRate,
      meanFinalDiversity: agg.meanFinalDiversity,
      meanFinalLen: agg.meanFinalLen,
      meanMutations: agg.meanMutations,
    },
  });

  console.log(
    `${cell.id.padEnd(14)} | rounds=${agg.meanRounds.toFixed(1).padStart(5)} ` +
      `homog=${agg.homogeneousRate.toFixed(2)} degen=${agg.degenerateRate.toFixed(2)} ` +
      `survive=${agg.roundLimitRate.toFixed(2)} div=${agg.meanFinalDiversity.toFixed(2)} ` +
      `len=${agg.meanFinalLen.toFixed(1)} muts=${agg.meanMutations.toFixed(0)}`,
  );
}

// --- summary: where does the swarm run off the rails? ------------------------

const summaryScorer: Scorer = {
  score() {
    const collapsed = aggregates.filter((a) => a.homogeneousRate + a.degenerateRate > 0.5);
    const survived = aggregates.filter((a) => a.roundLimitRate >= 0.5);
    // Fastest collapse: lowest mean rounds among cells that mostly collapse.
    let fastest: CellAggregate | undefined;
    for (const a of collapsed) {
      if (!fastest || a.meanRounds < fastest.meanRounds) fastest = a;
    }
    return {
      cells: aggregates.length,
      trialsPerCell: TRIALS,
      cellsCollapsing: collapsed.length,
      cellsSurviving: survived.length,
      fastestCollapseRounds: fastest ? fastest.meanRounds : -1,
      minDiversityObserved: round3(Math.min(...aggregates.map((a) => a.meanFinalDiversity))),
      maxLenObserved: round3(Math.max(...aggregates.map((a) => a.meanFinalLen))),
    };
  },
};
const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

// --- replay verification (DoD: replay() must read the trace back) ------------

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
