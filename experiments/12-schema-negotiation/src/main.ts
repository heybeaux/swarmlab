/**
 * Schema negotiation — sweep runner.
 *
 * For every (overlap × falseFriends) cell we run TRIALS seeded trials: build a divergent
 * (A, B) schema pair, negotiate a mapping with no referee, round-trip a batch of records
 * A->B->A, and score field-by-field fidelity + the headline SILENT-CORRUPTION rate.
 *
 * Trial 0 of each cell is the "exhibition" trial: agents A and B are spawned through core
 * and every negotiation turn is put on the bus as an A<->B `message`, so the trace replays
 * visually in the observatory. All trials feed the cell aggregate score.
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
import type { NegotiationTurn, TrialConfig, TrialResult } from './types.js';

// --- configuration -----------------------------------------------------------

const TRIALS = Number(process.env.SCHEMA_TRIALS ?? 40);
const SEED = process.env.SCHEMA_SEED ?? 'schema-negotiation-v1';

const OVERLAPS: readonly number[] = [0.25, 0.5, 0.75, 1.0];
const FALSE_FRIENDS: readonly number[] = [0, 1, 2, 3];

const BATCH_SIZE = Number(process.env.SCHEMA_BATCH ?? 24);
const MAX_ROUNDS = Number(process.env.SCHEMA_MAXROUNDS ?? 8);

interface Cell {
  id: string;
  overlap: number;
  falseFriends: number;
}

const cells: Cell[] = [];
for (const overlap of OVERLAPS) {
  for (const falseFriends of FALSE_FRIENDS) {
    cells.push({ id: `o${overlap}-ff${falseFriends}`, overlap, falseFriends });
  }
}

function cellConfig(cell: Cell): TrialConfig {
  return {
    overlap: cell.overlap,
    falseFriends: cell.falseFriends,
    batchSize: BATCH_SIZE,
    maxRounds: MAX_ROUNDS,
  };
}

// --- setup ---------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `sn-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '12-schema-negotiation' });
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
    overlaps: OVERLAPS,
    falseFriends: FALSE_FRIENDS,
    batchSize: BATCH_SIZE,
    maxRounds: MAX_ROUNDS,
  },
});

console.log(`run ${runId} | cells=${cells.length} trials/cell=${TRIALS}`);

// --- sweep -----------------------------------------------------------------------

interface CellAggregate {
  cell: Cell;
  agreementRate: number;
  meanRounds: number;
  fidelity: number;
  silentCorruption: number;
  falseFriendsCaught: number;
  meanMappedFields: number;
}

const aggregates: CellAggregate[] = [];

for (let c = 0; c < cells.length; c += 1) {
  const cell = cells[c];
  if (!cell) continue;
  const cfg = cellConfig(cell);

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'cell',
    body: { cell: cell.id, overlap: cell.overlap, falseFriends: cell.falseFriends },
  });

  // Spawn the two negotiating agents for the exhibition trial's visual replay.
  const agentA: AgentHandle = await spawnAgent(
    {
      id: `${cell.id}:A`,
      systemPrompt: `You are agent A. You hold your own order schema. Negotiate a field mapping with agent B — you cannot see B's field meanings, only names, types, and example values.`,
    },
    { runtime, trace },
  );
  const agentB: AgentHandle = await spawnAgent(
    {
      id: `${cell.id}:B`,
      systemPrompt: `You are agent B. You hold your own order schema. Negotiate a field mapping with agent A — you cannot see A's field meanings, only names, types, and example values.`,
    },
    { runtime, trace },
  );

  const results: TrialResult[] = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const rand = seeded(`${SEED}:${cell.id}:${t}`);
    if (t === 0) {
      const emit = (turn: NegotiationTurn): void => {
        bus.publish({
          from: turn.from === 'A' ? agentA.id : agentB.id,
          to: turn.to === 'A' ? agentA.id : agentB.id,
          topic: 'negotiate',
          body: {
            round: turn.round,
            kind: turn.kind,
            rows: turn.rows.map((r) => ({
              aName: r.aName,
              bName: r.bName,
              basis: r.basis,
              confidence: r.confidence,
            })),
          },
        });
      };
      results.push(runTrial(cfg, rand, { emit }));
    } else {
      results.push(runTrial(cfg, rand));
    }
  }

  await agentA.kill();
  bus.removeAgent(agentA.id);
  await agentB.kill();
  bus.removeAgent(agentB.id);

  const mean = (f: (r: TrialResult) => number): number =>
    round3(results.reduce((s, r) => s + f(r), 0) / results.length);

  const agg: CellAggregate = {
    cell,
    agreementRate: mean((r) => (r.agreed ? 1 : 0)),
    meanRounds: mean((r) => r.rounds),
    fidelity: mean((r) => r.fidelity),
    silentCorruption: mean((r) => r.silentCorruption),
    falseFriendsCaught: mean((r) => r.falseFriendsCaught),
    meanMappedFields: mean((r) => r.mappedFields),
  };
  aggregates.push(agg);

  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      cellIndex: c,
      overlap: cell.overlap,
      falseFriends: cell.falseFriends,
      trials: TRIALS,
      agreementRate: agg.agreementRate,
      meanRounds: agg.meanRounds,
      fidelity: agg.fidelity,
      silentCorruption: agg.silentCorruption,
      falseFriendsCaught: agg.falseFriendsCaught,
      meanMappedFields: agg.meanMappedFields,
    },
  });

  console.log(
    `${cell.id.padEnd(14)} | agree=${fmt(agg.agreementRate)} rounds=${agg.meanRounds} ` +
      `fid=${fmt(agg.fidelity)} silent=${fmt(agg.silentCorruption)} ffCaught=${fmt(agg.falseFriendsCaught)}`,
  );
}

// --- summary: does false-friend count drive silent corruption? -------------------

function agg(overlap: number, falseFriends: number): CellAggregate | undefined {
  return aggregates.find((a) => a.cell.overlap === overlap && a.cell.falseFriends === falseFriends);
}

/** Mean silent-corruption rate at a fixed false-friend count, averaged across overlaps. */
function silentByFalseFriends(ff: number): number {
  let sum = 0;
  let n = 0;
  for (const overlap of OVERLAPS) {
    const a = agg(overlap, ff);
    if (a) {
      sum += a.silentCorruption;
      n += 1;
    }
  }
  return n === 0 ? 0 : round3(sum / n);
}

/** Slope of silent corruption per added false friend (lowest ff -> highest ff), avg over overlaps. */
function silentCorruptionSlope(): number {
  const loFf = FALSE_FRIENDS[0];
  const hiFf = FALSE_FRIENDS[FALSE_FRIENDS.length - 1];
  if (loFf === undefined || hiFf === undefined || hiFf === loFf) return 0;
  const lo = silentByFalseFriends(loFf);
  const hi = silentByFalseFriends(hiFf);
  return round3((hi - lo) / (hiFf - loFf));
}

/** The worst cell: highest silent-corruption rate, and how confidently the pair agreed there. */
function worstCell(): { id: string; silent: number; agree: number; ffCaught: number } {
  let worst: CellAggregate | undefined;
  for (const a of aggregates) {
    if (!worst || a.silentCorruption > worst.silentCorruption) worst = a;
  }
  return worst
    ? {
        id: worst.cell.id,
        silent: worst.silentCorruption,
        agree: worst.agreementRate,
        ffCaught: worst.falseFriendsCaught,
      }
    : { id: 'none', silent: -1, agree: -1, ffCaught: -1 };
}

/**
 * The blind-spot number: mean fraction of injected false friends the negotiator FAILED to
 * catch across all cells that had any. This is exactly what a typed contract would make zero.
 */
function meanFalseFriendMissRate(): number {
  let sum = 0;
  let n = 0;
  for (const a of aggregates) {
    if (a.cell.falseFriends <= 0) continue;
    sum += 1 - a.falseFriendsCaught;
    n += 1;
  }
  return n === 0 ? 0 : round3(sum / n);
}

/** Mean negotiation rounds to agreement across cells that actually agreed. */
function meanRoundsToAgreement(): number {
  let sum = 0;
  let n = 0;
  for (const a of aggregates) {
    if (a.agreementRate >= 0.5) {
      sum += a.meanRounds;
      n += 1;
    }
  }
  return n === 0 ? 0 : round3(sum / n);
}

const summaryScorer: Scorer = {
  score() {
    return {
      cells: aggregates.length,
      trialsPerCell: TRIALS,
      silentAtFf0: silentByFalseFriends(0),
      silentAtFf1: silentByFalseFriends(1),
      silentAtFf2: silentByFalseFriends(2),
      silentAtFf3: silentByFalseFriends(3),
      silentCorruptionSlope: silentCorruptionSlope(),
      meanFalseFriendMissRate: meanFalseFriendMissRate(),
      meanRoundsToAgreement: meanRoundsToAgreement(),
      worstSilentCorruption: worstCell().silent,
    };
  },
};
const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));
console.log('worst cell:', JSON.stringify(worstCell()));

// --- replay verification (DoD: replay() must read the trace back) ----------------

const written = trace.toRunRecord();
const replayed = await readRunRecord(traceFile);
const count = (events: readonly TraceEvent[], t: TraceEvent['t']): number =>
  events.filter((e) => e.t === t).length;
const kinds: readonly TraceEvent['t'][] = ['spawn', 'message', 'score', 'kill'];
for (const kind of kinds) {
  const x = count(written.events, kind);
  const y = count(replayed.events, kind);
  if (x !== y) throw new Error(`replay mismatch for ${kind}: wrote ${x}, replayed ${y}`);
}
console.log(
  `replay verified: ${replayed.events.length} events ` +
    `(${kinds.map((k) => `${k}=${count(replayed.events, k)}`).join(' ')})`,
);
console.log(`trace: ${traceFile}`);

function fmt(n: number): string {
  return n.toFixed(2);
}
