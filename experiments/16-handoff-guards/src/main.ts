/**
 * exp-16 — handoff requirement-survival guards (spec 21) sweep runner.
 *
 * Same task, same exp-01-calibrated noise, same 20-cell sweep (d0–d4 × b1–b4),
 * SAME SEEDS as exp-14 Part A (`delegation-decay-v1`, seedBase `${SEED}:t{t}`),
 * 25 seeded trials/cell — × THREE guard tiers. The engine is exp-14's
 * `runDecayTrial` imported directly (module reused, not forked); the only new
 * lab code is the guard hook (guards.ts). Tier 1 passes `guard: undefined`,
 * which is literally exp-14's un-hooked path — an in-code gate asserts the
 * control arm reproduces the RT-05 Part A table (run `dd-a-mr7zv9zp`) on every
 * cell and HALTS the run on any mismatch, so the guarded arms are never
 * trusted on top of a broken baseline.
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
import { round3 } from '@swarmlab/experiment-14-delegation-decay/dist/rng.js';
import {
  BASELINE_COST,
  P_DROP,
  P_REINTERPRET,
  runDecayTrial,
} from '@swarmlab/experiment-14-delegation-decay/dist/decay.js';
import { N_REQUIREMENTS } from '@swarmlab/experiment-14-delegation-decay/dist/task.js';
import type { DecayTrialResult } from '@swarmlab/experiment-14-delegation-decay/dist/types.js';
import { emptyStats, makeGuard, TIERS, type GuardStats, type GuardTier } from './guards.js';

const TRIALS = Number(process.env.GUARD_TRIALS ?? 25);
const SEED = process.env.GUARD_SEED ?? 'delegation-decay-v1';

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

/**
 * RT-05 Part A pinned table (exp-14 README, run `dd-a-mr7zv9zp`, 25 trials/cell,
 * seed `delegation-decay-v1`): survival, reinterpreted, dropped, seam (round3)
 * and costAmp (round2). The control tier must match EXACTLY.
 */
const RT05: Record<string, [number, number, number, number, number]> = {
  d0b1: [1.0, 0, 0, 0, 1.0],
  d0b2: [1.0, 0, 0, 0, 1.0],
  d0b3: [1.0, 0, 0, 0, 1.0],
  d0b4: [1.0, 0, 0, 0, 1.0],
  d1b1: [0.84, 0.076, 0.084, 0.0, 1.24],
  d1b2: [0.758, 0.076, 0.12, 0.046, 1.23],
  d1b3: [0.746, 0.076, 0.118, 0.06, 1.24],
  d1b4: [0.732, 0.076, 0.118, 0.074, 1.26],
  d2b1: [0.698, 0.132, 0.17, 0.0, 1.44],
  d2b2: [0.57, 0.132, 0.216, 0.082, 1.48],
  d2b3: [0.538, 0.132, 0.224, 0.106, 1.55],
  d2b4: [0.532, 0.132, 0.22, 0.116, 1.66],
  d3b1: [0.578, 0.182, 0.24, 0.0, 1.63],
  d3b2: [0.424, 0.182, 0.286, 0.108, 1.78],
  d3b3: [0.392, 0.182, 0.298, 0.128, 2.05],
  d3b4: [0.39, 0.182, 0.294, 0.134, 2.47],
  d4b1: [0.484, 0.2, 0.316, 0.0, 1.8],
  d4b2: [0.302, 0.2, 0.364, 0.134, 2.13],
  d4b3: [0.276, 0.2, 0.378, 0.146, 2.76],
  d4b4: [0.272, 0.2, 0.372, 0.156, 3.54],
};

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `hg-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '16-handoff-guards' });
const bus = new MessageBus({ trace });
const runtime = new StubRuntime();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    experiment: 'handoff-guards',
    mode: 'sim',
    trials: TRIALS,
    seed: SEED,
    tiers: [...TIERS],
    requirements: N_REQUIREMENTS,
    pDrop: P_DROP,
    pReinterpret: P_REINTERPRET,
    baselineCost: BASELINE_COST,
    engine: 'exp-14 runDecayTrial via manifest hook (module reused, not forked)',
    controlGate: 'RT-05 Part A table dd-a-mr7zv9zp, exact per-cell match required',
    cells: cells.map((c) => c.id),
  },
});

console.log(`run ${runId} | cells=${cells.length} tiers=${TIERS.length} trials/cell=${TRIALS}`);

interface TierCellAggregate {
  cell: Cell;
  tier: GuardTier;
  survival: number;
  reinterpreted: number;
  dropped: number;
  integration: number;
  costAmplification: number;
  guardCost: number;
  guardCostAmp: number;
  dropRecovery: number;
  reinterpretRecovery: number;
  falseFlagRate: number;
  netTokenEfficiency: number;
}

const aggregates: TierCellAggregate[] = [];
let controlMismatch = false;

for (let c = 0; c < cells.length; c += 1) {
  const cell = cells[c];
  if (!cell) continue;

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'cell',
    body: { cell: cell.id, depth: cell.depth, branching: cell.branching },
  });

  // Exhibition tree: spawn once per cell through core (topology is identical
  // across tiers); trial 0 of every tier emits its handoffs + guard flags over
  // the same agents.
  const handles = new Map<string, AgentHandle>();
  const spawnNode = async (id: string, level: number): Promise<void> => {
    const role = level === 0 ? 'root' : level < cell.depth ? 'mid' : 'leaf';
    handles.set(
      id,
      await spawnAgent(
        {
          id: `${cell.id}:${id}`,
          systemPrompt: `Delegation-tree ${role} at level ${level} (d=${cell.depth}, b=${cell.branching}). Execute or sub-delegate your brief; verify inbound briefs against the handoff manifest when one is attached.`,
        },
        { runtime, trace },
      ),
    );
    if (level < cell.depth) {
      for (let i = 0; i < cell.branching; i += 1) await spawnNode(`${id}.${i}`, level + 1);
    }
  };
  await spawnNode('a0', 0);

  const cellAggs = new Map<GuardTier, TierCellAggregate>();

  for (const tier of TIERS) {
    const results: DecayTrialResult[] = [];
    const stats: GuardStats[] = [];
    for (let t = 0; t < TRIALS; t += 1) {
      const seedBase = `${SEED}:t${t}`;
      const st = emptyStats();
      const emit =
        t === 0
          ? {
              brief: (parent: string, child: string, level: number, items: number, keyTaskCount: number) => {
                bus.publish({
                  from: `${cell.id}:${parent}`,
                  to: `${cell.id}:${child}`,
                  topic: 'brief',
                  body: { tier, level, items, keyTasks: keyTaskCount },
                });
              },
              leaf: (agent: string, keys: readonly string[]) => {
                bus.publish({
                  from: `${cell.id}:${agent}`,
                  to: `${cell.id}:a0`,
                  topic: 'fragment',
                  body: { tier, keys: [...keys] },
                });
              },
            }
          : undefined;
      const onFlag =
        t === 0
          ? (e: { parent: string; child: string; level: number; reqId: string; role: string; kind: string }) => {
              bus.publish({
                from: `${cell.id}:${e.child}`,
                to: `${cell.id}:${e.parent}`,
                topic: 'guard-flag',
                body: { tier, level: e.level, reqId: e.reqId, role: e.role, kind: e.kind },
              });
            }
          : undefined;
      const guard = makeGuard(tier, st, onFlag);
      results.push(runDecayTrial(cell.depth, cell.branching, seedBase, emit, guard));
      stats.push(st);
    }

    const mean = (f: (r: DecayTrialResult) => number): number =>
      round3(results.reduce((s, r) => s + f(r), 0) / results.length);
    const sum = (f: (s: GuardStats) => number): number => stats.reduce((a, s) => a + f(s), 0);
    const dropsOccurred = sum((s) => s.dropsOccurred);
    const perturbsOccurred = sum((s) => s.perturbsOccurred);
    const flags = sum((s) => s.flags);
    const guardCost = round3(sum((s) => s.guardCost) / TRIALS);

    const control = cellAggs.get('unguarded');
    const costAmp = mean((r) => r.costAmplification);
    const survival = mean((r) => r.survival);
    const agg: TierCellAggregate = {
      cell,
      tier,
      survival,
      reinterpreted: mean((r) => r.reinterpreted / N_REQUIREMENTS),
      dropped: mean((r) => r.dropped / N_REQUIREMENTS),
      integration: mean((r) => r.integration / N_REQUIREMENTS),
      costAmplification: costAmp,
      guardCost,
      guardCostAmp: round3(guardCost / BASELINE_COST),
      dropRecovery: dropsOccurred === 0 ? -1 : round3(sum((s) => s.dropsCaught) / dropsOccurred),
      reinterpretRecovery:
        perturbsOccurred === 0 ? -1 : round3(sum((s) => s.perturbsCaught) / perturbsOccurred),
      falseFlagRate: flags === 0 ? 0 : round3(sum((s) => s.falseFlags) / flags),
      netTokenEfficiency:
        control === undefined || costAmp - control.costAmplification <= 0
          ? -1
          : round3((survival - control.survival) / (costAmp - control.costAmplification)),
    };
    cellAggs.set(tier, agg);
    aggregates.push(agg);

    // --- control reproduction gate (spec 21: stop and reconcile on mismatch) ---
    if (tier === 'unguarded') {
      const exp = RT05[cell.id];
      if (!exp) throw new Error(`no RT-05 pin for cell ${cell.id}`);
      const got = [
        agg.survival,
        agg.reinterpreted,
        agg.dropped,
        agg.integration,
        Math.round(agg.costAmplification * 100) / 100,
      ];
      const ok = got.every((g, i) => Math.abs(g - (exp[i] as number)) < 1e-9);
      if (!ok) {
        controlMismatch = true;
        throw new Error(
          `CONTROL REPRODUCTION FAILED at ${cell.id}: got [${got.join(', ')}] expected [${exp.join(', ')}] — reconcile before trusting guarded arms`,
        );
      }
    }

    trace.append({
      t: 'score',
      ts: Date.now(),
      scores: {
        cellIndex: c,
        tierIndex: TIERS.indexOf(tier), // 0=unguarded 1=presence 2=value-echo
        depth: cell.depth,
        branching: cell.branching,
        trials: TRIALS,
        requirementSurvival: agg.survival,
        driftReinterpreted: agg.reinterpreted,
        driftDropped: agg.dropped,
        integrationTax: agg.integration,
        costAmplification: agg.costAmplification,
        guardCost: agg.guardCost,
        guardCostAmp: agg.guardCostAmp,
        dropRecovery: agg.dropRecovery,
        reinterpretRecovery: agg.reinterpretRecovery,
        falseFlagRate: agg.falseFlagRate,
        netTokenEfficiency: agg.netTokenEfficiency,
      },
    });

    console.log(
      `${cell.id.padEnd(6)} ${tier.padEnd(10)} | survival=${agg.survival.toFixed(3)} ` +
        `reint=${agg.reinterpreted.toFixed(3)} drop=${agg.dropped.toFixed(3)} seam=${agg.integration.toFixed(3)} ` +
        `costAmp=${agg.costAmplification.toFixed(2)} guard=${agg.guardCost.toFixed(1)} ` +
        `dropRec=${agg.dropRecovery.toFixed(2)} reintRec=${agg.reinterpretRecovery.toFixed(2)} ` +
        `ffr=${agg.falseFlagRate.toFixed(3)} nte=${agg.netTokenEfficiency.toFixed(2)}`,
    );
  }

  const verdictBody: Record<string, unknown> = { cell: cell.id };
  for (const tier of TIERS) {
    const a = cellAggs.get(tier);
    if (a) verdictBody[tier] = { survival: a.survival, costAmp: a.costAmplification, guardCost: a.guardCost };
  }
  bus.publish({ from: 'moderator', to: '*', topic: 'verdict', body: verdictBody });

  for (const h of handles.values()) {
    await h.kill();
    bus.removeAgent(h.id);
  }
}

// --- summary --------------------------------------------------------------------

function meanBy(
  pred: (a: TierCellAggregate) => boolean,
  f: (a: TierCellAggregate) => number,
): number {
  const xs = aggregates.filter(pred);
  return xs.length === 0 ? -1 : round3(xs.reduce((s, a) => s + f(a), 0) / xs.length);
}

const summaryScorer: Scorer = {
  score() {
    const out: Record<string, number> = {};
    for (const tier of TIERS) {
      const tag = tier === 'unguarded' ? 'T1' : tier === 'presence' ? 'T2' : 'T3';
      for (const d of DEPTHS) {
        out[`survival${tag}D${d}`] = meanBy(
          (a) => a.tier === tier && a.cell.depth === d,
          (a) => a.survival,
        );
      }
      const deep = (a: TierCellAggregate): boolean => a.tier === tier && a.cell.depth >= 3;
      out[`deepSurvival${tag}`] = meanBy(deep, (a) => a.survival);
      out[`deepCostAmp${tag}`] = meanBy(deep, (a) => a.costAmplification);
      out[`deepGuardCostAmp${tag}`] = meanBy(deep, (a) => a.guardCostAmp);
      if (tier !== 'unguarded') {
        out[`deepNetTokenEff${tag}`] = meanBy(deep, (a) => a.netTokenEfficiency);
        out[`falseFlagRate${tag}`] = meanBy((a) => a.tier === tier, (a) => a.falseFlagRate);
      }
    }
    // HEADLINE: tier-3 minus tier-2 survival at deep cells — how much of the
    // recoverable loss is reinterpretation (expensive) vs drops (cheap).
    out['deepGapT3minusT2'] = round3(
      (out['deepSurvivalT3'] ?? 0) - (out['deepSurvivalT2'] ?? 0),
    );
    out['deepRecoveryT2'] = round3((out['deepSurvivalT2'] ?? 0) - (out['deepSurvivalT1'] ?? 0));
    out['deepRecoveryT3'] = round3((out['deepSurvivalT3'] ?? 0) - (out['deepSurvivalT1'] ?? 0));
    out['controlReproducedRT05'] = controlMismatch ? 0 : 1;
    return out;
  },
};
const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

// --- replay verification ----------------------------------------------------------

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
