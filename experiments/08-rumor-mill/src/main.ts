/**
 * Rumor mill — sweep runner.
 *
 * For every (fanout × mutationRate × size) cell we run TRIALS seeded trials through the
 * same gossip engine. Trial 0 of each cell is the "exhibition" trial: its nodes are spawned
 * through core and every retelling + end-of-round snapshot is broadcast on the core bus, so
 * the trace replays visually in the observatory. All trials feed the cell's aggregate score.
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
import { runEngramTrial } from './engram-sim.js';
import type { GossipStep, RoundSnapshot, TrialConfig, TrialResult } from './types.js';

// --- configuration -----------------------------------------------------------

const TRIALS = Number(process.env.RUMOR_TRIALS ?? 30);
const SEED = process.env.RUMOR_SEED ?? 'rumor-mill-v1';

/**
 * Adoption mode. `baseline` = first-write-wins (the committed exp-08 result).
 * `engram` = the Spec 16 retest: adoption via the REAL shipped
 * `@openengram/reconciliation` (`reconcile` + `antiEntropySync`), linked as a
 * `file:` dep — never reimplemented in the lab.
 */
const MODE = (process.env.RUMOR_MODE ?? 'baseline') as 'baseline' | 'engram';
const trialFn = MODE === 'engram' ? runEngramTrial : runTrial;

const FANOUTS: readonly number[] = [1, 2, 3];
const MUTATION_RATES: readonly number[] = [0.0, 0.02, 0.05, 0.1];
const SIZES: readonly number[] = [30, 60, 120];

const DEGREE = Number(process.env.RUMOR_DEGREE ?? 3);
const REWIRE = Number(process.env.RUMOR_REWIRE ?? 0.15);
const TOKEN_COUNT = Number(process.env.RUMOR_TOKENS ?? 12);
const ALPHABET = Number(process.env.RUMOR_ALPHABET ?? 6);
const SATURATION_THRESHOLD = Number(process.env.RUMOR_SATURATION ?? 0.99);
const MAX_ROUNDS = Number(process.env.RUMOR_MAXROUNDS ?? 40);

interface Cell {
  id: string;
  fanout: number;
  mutationRate: number;
  size: number;
}

const cells: Cell[] = [];
for (const size of SIZES) {
  for (const mutationRate of MUTATION_RATES) {
    for (const fanout of FANOUTS) {
      cells.push({ id: `f${fanout}-m${mutationRate}-N${size}`, fanout, mutationRate, size });
    }
  }
}

function cellConfig(cell: Cell): TrialConfig {
  return {
    size: cell.size,
    fanout: cell.fanout,
    mutationRate: cell.mutationRate,
    degree: DEGREE,
    rewire: REWIRE,
    tokenCount: TOKEN_COUNT,
    alphabet: ALPHABET,
    saturationThreshold: SATURATION_THRESHOLD,
    maxRounds: MAX_ROUNDS,
  };
}

// --- setup ---------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `rm-${MODE}-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '08-rumor-mill' });
const bus = new MessageBus({ trace });
const runtime = new StubRuntime();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    mode: MODE,
    engramModule: MODE === 'engram' ? '@openengram/reconciliation (file: dep, branch versioned-facts-anti-entropy)' : undefined,
    trials: TRIALS,
    seed: SEED,
    fanouts: FANOUTS,
    mutationRates: MUTATION_RATES,
    sizes: SIZES,
    degree: DEGREE,
    rewire: REWIRE,
    tokenCount: TOKEN_COUNT,
  },
});

console.log(`run ${runId} | mode=${MODE} cells=${cells.length} trials/cell=${TRIALS}`);

// --- sweep -----------------------------------------------------------------------

interface CellAggregate {
  cell: Cell;
  saturationRate: number;
  meanTimeToSaturation: number;
  fidelityAtSaturation: number;
  finalCoverage: number;
  fidelityNearHop: number;
  fidelityFarHop: number;
  /** Engram-mode healing accounting (mean per trial); 0 in baseline. */
  healedNodes: number;
  rejectedCorrupt: number;
}

const aggregates: CellAggregate[] = [];

/**
 * On the exhibition trial we spawn a bounded set of node agents through core (one per
 * mesh node, capped so a 120-node cell doesn't flood the trace) and route each retelling
 * / snapshot onto the bus. The gossip step's `from`/`to` are node indices; we resolve
 * them to spawned agent ids when the index is under the cap, else fall back to a label.
 */
const EXHIBITION_NODE_CAP = 24;

for (let c = 0; c < cells.length; c += 1) {
  const cell = cells[c];
  if (!cell) continue;
  const cfg = cellConfig(cell);

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'cell',
    body: {
      cell: cell.id,
      fanout: cell.fanout,
      mutationRate: cell.mutationRate,
      size: cell.size,
    },
  });

  // Spawn a capped set of node agents for the exhibition trial's visual replay.
  const spawnCount = Math.min(cell.size, EXHIBITION_NODE_CAP);
  const nodes: AgentHandle[] = [];
  for (let i = 0; i < spawnCount; i += 1) {
    nodes.push(
      await spawnAgent(
        {
          id: `${cell.id}:n${i}`,
          systemPrompt: `You are a gossip node in a mesh of ${cell.size}. Retell what you hear to ${cell.fanout} neighbor(s).`,
        },
        { runtime, trace },
      ),
    );
  }
  const nodeId = (idx: number): string =>
    idx < spawnCount ? (nodes[idx]?.id ?? `${cell.id}:n${idx}`) : `${cell.id}:n${idx}`;

  const results: TrialResult[] = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const rand = seeded(`${SEED}:${cell.id}:${t}`);
    if (t === 0) {
      bus.publish({
        from: 'moderator',
        to: '*',
        topic: 'seed',
        body: { cell: cell.id, tokenCount: cfg.tokenCount },
      });
      const emit = (step: GossipStep): void => {
        bus.publish({
          from: nodeId(step.from),
          to: step.to < spawnCount ? nodeId(step.to) : '*',
          topic: 'gossip',
          body: {
            round: step.round,
            from: step.from,
            to: step.to,
            adopted: step.adopted,
            fidelity: step.fidelity,
          },
        });
      };
      const emitSnap = (snap: RoundSnapshot): void => {
        bus.publish({
          from: 'moderator',
          to: '*',
          topic: 'snapshot',
          body: { cell: cell.id, round: snap.round, coverage: snap.coverage, meanFidelity: snap.meanFidelity },
        });
      };
      results.push(trialFn(cfg, rand, emit, emitSnap));
    } else {
      results.push(trialFn(cfg, rand));
    }
  }

  for (const n of nodes) {
    await n.kill();
    bus.removeAgent(n.id);
  }

  const mean = (f: (r: TrialResult) => number): number =>
    round3(results.reduce((s, r) => s + f(r), 0) / results.length);

  const agg: CellAggregate = {
    cell,
    saturationRate: mean((r) => (r.saturated ? 1 : 0)),
    meanTimeToSaturation: mean((r) => r.timeToSaturation),
    fidelityAtSaturation: mean((r) => r.fidelityAtSaturation),
    finalCoverage: mean((r) => r.finalCoverage),
    fidelityNearHop: mean((r) => r.fidelityNearHop),
    fidelityFarHop: mean((r) => r.fidelityFarHop),
    healedNodes: mean((r) => r.healedNodes ?? 0),
    rejectedCorrupt: mean((r) => r.rejectedCorrupt ?? 0),
  };
  aggregates.push(agg);

  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      cellIndex: c,
      fanout: cell.fanout,
      mutationRate: cell.mutationRate,
      size: cell.size,
      trials: TRIALS,
      saturationRate: agg.saturationRate,
      meanTimeToSaturation: agg.meanTimeToSaturation,
      fidelityAtSaturation: agg.fidelityAtSaturation,
      finalCoverage: agg.finalCoverage,
      fidelityNearHop: agg.fidelityNearHop,
      fidelityFarHop: agg.fidelityFarHop,
      healedNodes: agg.healedNodes,
      rejectedCorrupt: agg.rejectedCorrupt,
    },
  });

  console.log(
    `${cell.id.padEnd(20)} | sat=${fmt(agg.saturationRate)} tts=${agg.meanTimeToSaturation} ` +
      `fidSat=${fmt(agg.fidelityAtSaturation)} near=${fmt(agg.fidelityNearHop)} far=${fmt(agg.fidelityFarHop)}` +
      (MODE === 'engram'
        ? ` healed=${agg.healedNodes.toFixed(1)} rej=${agg.rejectedCorrupt.toFixed(1)}`
        : ''),
  );
}

// --- summary: how does fanout trade speed vs fidelity, and can coverage outrun truth? ---

function agg(fanout: number, mutationRate: number, size: number): CellAggregate | undefined {
  return aggregates.find(
    (a) => a.cell.fanout === fanout && a.cell.mutationRate === mutationRate && a.cell.size === size,
  );
}

/**
 * At fixed (size, mutationRate>0), does raising fanout buy speed with fidelity? Report the
 * mean change in (timeToSaturation, fidelityAtSaturation) from the lowest to highest fanout,
 * averaged across the noisy cells. Negative tts delta = faster; negative fid delta = costlier.
 */
function speedFidelityTrade(): { ttsDelta: number; fidDelta: number } {
  const loF = FANOUTS[0];
  const hiF = FANOUTS[FANOUTS.length - 1];
  let ttsSum = 0;
  let fidSum = 0;
  let n = 0;
  if (loF === undefined || hiF === undefined) return { ttsDelta: 0, fidDelta: 0 };
  for (const size of SIZES) {
    for (const m of MUTATION_RATES) {
      if (m <= 0) continue;
      const lo = agg(loF, m, size);
      const hi = agg(hiF, m, size);
      if (lo && hi) {
        ttsSum += hi.meanTimeToSaturation - lo.meanTimeToSaturation;
        fidSum += hi.fidelityAtSaturation - lo.fidelityAtSaturation;
        n += 1;
      }
    }
  }
  return n === 0
    ? { ttsDelta: 0, fidDelta: 0 }
    : { ttsDelta: round3(ttsSum / n), fidDelta: round3(fidSum / n) };
}

/** Count cells that reach full coverage (≥ threshold) while typical fidelity is below `floor`. */
function coverageOutrunsTruthCount(floor: number): number {
  let count = 0;
  for (const a of aggregates) {
    if (a.saturationRate >= 0.99 && a.fidelityAtSaturation < floor) count += 1;
  }
  return count;
}

/** The fastest-saturating cell (lowest mean time-to-saturation), and its fidelity cost. */
function fastestCell(): { id: string; tts: number; fidelity: number } {
  let best: CellAggregate | undefined;
  for (const a of aggregates) {
    if (!best || a.meanTimeToSaturation < best.meanTimeToSaturation) best = a;
  }
  return best
    ? { id: best.cell.id, tts: best.meanTimeToSaturation, fidelity: best.fidelityAtSaturation }
    : { id: 'none', tts: -1, fidelity: -1 };
}

/** Mean (nearHop − farHop) fidelity across noisy cells: the telephone gradient. */
function telephoneGradient(): number {
  let sum = 0;
  let n = 0;
  for (const a of aggregates) {
    if (a.cell.mutationRate <= 0) continue;
    sum += a.fidelityNearHop - a.fidelityFarHop;
    n += 1;
  }
  return n === 0 ? 0 : round3(sum / n);
}

const trade = speedFidelityTrade();
const fast = fastestCell();

/** Lowest fidelity-at-saturation across all saturated cells (the worst cell). */
function worstCellFidelity(): { id: string; fidelity: number } {
  let worst: CellAggregate | undefined;
  for (const a of aggregates) {
    if (a.saturationRate < 0.99) continue;
    if (!worst || a.fidelityAtSaturation < worst.fidelityAtSaturation) worst = a;
  }
  return worst
    ? { id: worst.cell.id, fidelity: worst.fidelityAtSaturation }
    : { id: 'none', fidelity: -1 };
}

const worst = worstCellFidelity();
const totalHealed = round3(aggregates.reduce((s, a) => s + a.healedNodes, 0));
const totalRejected = round3(aggregates.reduce((s, a) => s + a.rejectedCorrupt, 0));

const summaryScorer: Scorer = {
  score() {
    return {
      cells: aggregates.length,
      trialsPerCell: TRIALS,
      fastestTimeToSaturation: fast.tts,
      fastestCellFidelity: fast.fidelity,
      fanoutTtsDelta: trade.ttsDelta,
      fanoutFidelityDelta: trade.fidDelta,
      telephoneGradient: telephoneGradient(),
      coverageOutrunsTruth: coverageOutrunsTruthCount(0.9),
      worstCellFidelity: worst.fidelity,
      meanHealedPerTrial: totalHealed,
      meanRejectedPerTrial: totalRejected,
    };
  },
};
const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log(`summary [mode=${MODE}, worstCell=${worst.id}]:`, JSON.stringify(summary));

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
