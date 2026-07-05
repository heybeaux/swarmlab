/**
 * Part A — delegation decay sweep runner.
 *
 * 20 cells: depth d ∈ {0..4} × branching b ∈ {1..4}, DECAY_TRIALS seeded trials
 * per cell, same trial seeds across all cells (draws are keyed per requirement
 * × hop, not per cell). Trial 0 of each cell is the exhibition trial: the whole
 * delegation tree is spawned through core and every brief handoff + leaf
 * fragment goes on the bus, so the run replays in the observatory.
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
import { round3 } from './rng.js';
import { runDecayTrial, P_DROP, P_REINTERPRET, BASELINE_COST } from './decay.js';
import { N_REQUIREMENTS } from './task.js';
import type { DecayTrialResult } from './types.js';

const TRIALS = Number(process.env.DECAY_TRIALS ?? 25);
const SEED = process.env.DECAY_SEED ?? 'delegation-decay-v1';

const DEPTHS = [0, 1, 2, 3, 4] as const;
const BRANCHINGS = [1, 2, 3, 4] as const;

interface Cell {
  id: string;
  depth: number;
  branching: number;
}

const cells: Cell[] = [];
for (const depth of DEPTHS) {
  for (const branching of BRANCHINGS) {
    cells.push({ id: `d${depth}b${branching}`, depth, branching });
  }
}

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `dd-a-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '14-delegation-decay' });
const bus = new MessageBus({ trace });
const runtime = new StubRuntime();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    part: 'A',
    mode: 'sim',
    trials: TRIALS,
    seed: SEED,
    requirements: N_REQUIREMENTS,
    pDrop: P_DROP,
    pReinterpret: P_REINTERPRET,
    calibration: 'exp-01 telephone-compiler sim: rule drop 0.08/hop, number perturbation 0.15/hop',
    baselineCost: BASELINE_COST,
    cells: cells.map((c) => c.id),
  },
});

console.log(`run ${runId} | cells=${cells.length} trials/cell=${TRIALS}`);

interface CellAggregate {
  cell: Cell;
  survival: number;
  reinterpreted: number;
  dropped: number;
  integration: number;
  costAmplification: number;
}

const aggregates: CellAggregate[] = [];

for (let c = 0; c < cells.length; c += 1) {
  const cell = cells[c];
  if (!cell) continue;

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'cell',
    body: { cell: cell.id, depth: cell.depth, branching: cell.branching },
  });

  // Exhibition trial 0: spawn the full delegation tree through core.
  const handles = new Map<string, AgentHandle>();
  const spawnNode = async (id: string, level: number): Promise<void> => {
    const role = level === 0 ? 'root' : level < cell.depth ? 'mid' : 'leaf';
    handles.set(
      id,
      await spawnAgent(
        {
          id: `${cell.id}:${id}`,
          systemPrompt: `Delegation-tree ${role} at level ${level} (d=${cell.depth}, b=${cell.branching}). Execute or sub-delegate your brief.`,
        },
        { runtime, trace },
      ),
    );
    if (level < cell.depth) {
      for (let i = 0; i < cell.branching; i += 1) await spawnNode(`${id}.${i}`, level + 1);
    }
  };
  await spawnNode('a0', 0);

  const results: DecayTrialResult[] = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const seedBase = `${SEED}:t${t}`;
    const emit =
      t === 0
        ? {
            brief: (parent: string, child: string, level: number, items: number, keyTaskCount: number) => {
              bus.publish({
                from: `${cell.id}:${parent}`,
                to: `${cell.id}:${child}`,
                topic: 'brief',
                body: { level, items, keyTasks: keyTaskCount },
              });
            },
            leaf: (agent: string, keys: readonly string[]) => {
              bus.publish({
                from: `${cell.id}:${agent}`,
                to: `${cell.id}:a0`,
                topic: 'fragment',
                body: { keys: [...keys] },
              });
            },
          }
        : undefined;
    results.push(runDecayTrial(cell.depth, cell.branching, seedBase, emit));
  }

  const exhibition = results[0];
  if (exhibition) {
    bus.publish({
      from: 'moderator',
      to: '*',
      topic: 'verdict',
      body: {
        cell: cell.id,
        survival: exhibition.survival,
        reinterpreted: exhibition.reinterpreted,
        dropped: exhibition.dropped,
        integration: exhibition.integration,
        costAmplification: round3(exhibition.costAmplification),
      },
    });
  }
  for (const h of handles.values()) {
    await h.kill();
    bus.removeAgent(h.id);
  }

  const mean = (f: (r: DecayTrialResult) => number): number =>
    round3(results.reduce((s, r) => s + f(r), 0) / results.length);
  const agg: CellAggregate = {
    cell,
    survival: mean((r) => r.survival),
    reinterpreted: mean((r) => r.reinterpreted / N_REQUIREMENTS),
    dropped: mean((r) => r.dropped / N_REQUIREMENTS),
    integration: mean((r) => r.integration / N_REQUIREMENTS),
    costAmplification: mean((r) => r.costAmplification),
  };
  aggregates.push(agg);

  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      cellIndex: c,
      depth: cell.depth,
      branching: cell.branching,
      trials: TRIALS,
      requirementSurvival: agg.survival,
      driftReinterpreted: agg.reinterpreted,
      driftDropped: agg.dropped,
      integrationTax: agg.integration,
      costAmplification: agg.costAmplification,
    },
  });

  console.log(
    `${cell.id.padEnd(6)} | survival=${agg.survival.toFixed(3)} reint=${agg.reinterpreted.toFixed(3)} ` +
      `drop=${agg.dropped.toFixed(3)} seam=${agg.integration.toFixed(3)} costAmp=${agg.costAmplification.toFixed(2)}`,
  );
}

// --- summary: depth-vs-survival + the H-A seam question ---------------------------

function meanBy(pred: (a: CellAggregate) => boolean, f: (a: CellAggregate) => number): number {
  const xs = aggregates.filter(pred);
  return xs.length === 0 ? -1 : round3(xs.reduce((s, a) => s + f(a), 0) / xs.length);
}

const summaryScorer: Scorer = {
  score() {
    const byDepth: Record<string, number> = {};
    for (const d of DEPTHS) {
      byDepth[`survivalD${d}`] = meanBy((a) => a.cell.depth === d, (a) => a.survival);
    }
    // H-A: at d>=2 with real siblings (b>=2), is the seam the dominant loss class?
    const deep = (a: CellAggregate): boolean => a.cell.depth >= 2 && a.cell.branching >= 2;
    return {
      cells: aggregates.length,
      trialsPerCell: TRIALS,
      ...byDepth,
      deepSeamLoss: meanBy(deep, (a) => a.integration),
      deepDroppedLoss: meanBy(deep, (a) => a.dropped),
      deepReinterpretedLoss: meanBy(deep, (a) => a.reinterpreted),
      deepSeamShare: meanBy(deep, (a) => {
        const losses = a.integration + a.dropped + a.reinterpreted;
        return losses === 0 ? 0 : a.integration / losses;
      }),
      maxCostAmplification: aggregates.reduce((m, a) => Math.max(m, a.costAmplification), 0),
    };
  },
};
const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

// --- replay verification -----------------------------------------------------------

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
