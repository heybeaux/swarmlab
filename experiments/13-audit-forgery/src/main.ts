/**
 * Audit forgery — sweep runner.
 *
 * For every (attack × keyCompromised × stitch) cell we build an honest signed trail, apply
 * the attack, and run all four verifiers, over TRIALS seeded trials. Trial 0 of each cell is
 * the "exhibition" trial: its authors are spawned through core and every append / attack /
 * verdict is broadcast on the core bus so the run replays in the observatory. All trials feed
 * the cell's aggregate detection/false-clean scores.
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
import { round3, runTrial, VERIFIERS } from './sim.js';
import type {
  AppendStep,
  Attack,
  AttackStep,
  TrialConfig,
  VerdictStep,
} from './types.js';

// --- configuration -----------------------------------------------------------

const TRIALS = Number(process.env.FORGE_TRIALS ?? 40);
const SEED = process.env.FORGE_SEED ?? 'audit-forgery-v1';

const ATTACKS: readonly Attack[] = [
  'insert',
  'drop',
  'reorder',
  'backdate',
  'tamper-payload',
];
const KEY_STATES: readonly boolean[] = [false, true]; // outsider, insider
const STITCH_STATES: readonly boolean[] = [false, true]; // naive, sophisticated

const AUTHOR_COUNT = Number(process.env.FORGE_AUTHORS ?? 4);
const EVENT_COUNT = Number(process.env.FORGE_EVENTS ?? 24);

interface Cell {
  id: string;
  attack: Attack;
  keyCompromised: boolean;
  stitch: boolean;
}

const cells: Cell[] = [];
for (const attack of ATTACKS) {
  for (const keyCompromised of KEY_STATES) {
    for (const stitch of STITCH_STATES) {
      const k = keyCompromised ? 'insider' : 'outsider';
      const s = stitch ? 'stitched' : 'naive';
      cells.push({ id: `${attack}-${k}-${s}`, attack, keyCompromised, stitch });
    }
  }
}

function cellConfig(cell: Cell): TrialConfig {
  return {
    authorCount: AUTHOR_COUNT,
    eventCount: EVENT_COUNT,
    attack: cell.attack,
    stitch: cell.stitch,
    keyCompromised: cell.keyCompromised,
  };
}

const ATTACK_CODE: Record<Attack, number> = {
  insert: 0,
  drop: 1,
  reorder: 2,
  backdate: 3,
  'tamper-payload': 4,
};

// --- setup ---------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `af-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '13-audit-forgery' });
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
    attacks: ATTACKS,
    keyStates: KEY_STATES,
    stitchStates: STITCH_STATES,
    verifiers: VERIFIERS.map((v) => v.name),
    authorCount: AUTHOR_COUNT,
    eventCount: EVENT_COUNT,
  },
});

console.log(`run ${runId} | cells=${cells.length} trials/cell=${TRIALS} verifiers=${VERIFIERS.length}`);

// --- sweep -----------------------------------------------------------------------

interface CellAggregate {
  cell: Cell;
  /** detectionRate[i] = fraction of trials VERIFIERS[i] flagged the forgery. */
  detectionRate: number[];
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
    body: {
      cell: cell.id,
      attack: cell.attack,
      keyCompromised: cell.keyCompromised,
      stitch: cell.stitch,
    },
  });

  // Spawn one agent per honest author for the exhibition trial's visual replay.
  const authors: AgentHandle[] = [];
  for (let i = 0; i < AUTHOR_COUNT; i += 1) {
    authors.push(
      await spawnAgent(
        {
          id: `${cell.id}:author${i}`,
          systemPrompt: `You are signing author ${i} on a Sonder audit trail. Append signed, causally-linked events.`,
        },
        { runtime, trace },
      ),
    );
  }
  const authorId = (idx: number): string =>
    idx < authors.length ? (authors[idx]?.id ?? `${cell.id}:author${idx}`) : `${cell.id}:author${idx}`;

  const detCounts: number[] = new Array<number>(VERIFIERS.length).fill(0);

  for (let t = 0; t < TRIALS; t += 1) {
    const rand = seeded(`${SEED}:${cell.id}:${t}`);
    if (t === 0) {
      const emitAppend = (step: AppendStep): void => {
        bus.publish({
          from: authorId(step.author),
          to: '*',
          topic: 'append',
          body: { seq: step.seq, author: step.author, h: step.h, prev: step.prev, ts: step.ts },
        });
      };
      const emitAttack = (step: AttackStep): void => {
        bus.publish({
          from: 'adversary',
          to: '*',
          topic: 'attack',
          body: {
            attack: step.attack,
            stitch: step.stitch,
            keyCompromised: step.keyCompromised,
            targetSeq: step.targetSeq,
          },
        });
      };
      const emitVerdict = (step: VerdictStep): void => {
        bus.publish({
          from: 'verifier',
          to: '*',
          topic: 'verdict',
          body: { verifier: step.verifier, attack: step.attack, clean: step.clean, reason: step.reason },
        });
      };
      const res = runTrial(cfg, rand, emitAppend, emitAttack, emitVerdict);
      res.verdicts.forEach((v, i) => {
        if (!v.clean) detCounts[i] = (detCounts[i] ?? 0) + 1;
      });
    } else {
      const res = runTrial(cfg, rand);
      res.verdicts.forEach((v, i) => {
        if (!v.clean) detCounts[i] = (detCounts[i] ?? 0) + 1;
      });
    }
  }

  for (const a of authors) {
    await a.kill();
    bus.removeAgent(a.id);
  }

  const detectionRate = detCounts.map((n) => round3(n / TRIALS));
  const agg: CellAggregate = { cell, detectionRate };
  aggregates.push(agg);

  const scores: Record<string, number> = {
    cellIndex: c,
    attackCode: ATTACK_CODE[cell.attack],
    keyCompromised: cell.keyCompromised ? 1 : 0,
    stitch: cell.stitch ? 1 : 0,
    trials: TRIALS,
  };
  VERIFIERS.forEach((v, i) => {
    scores[`det_${v.name}`] = detectionRate[i] ?? 0;
  });
  trace.append({ t: 'score', ts: Date.now(), scores });

  console.log(
    `${cell.id.padEnd(30)} | ` +
      VERIFIERS.map((v, i) => `${v.name}=${fmt(detectionRate[i] ?? 0)}`).join(' '),
  );
}

// --- summary ---------------------------------------------------------------------

function det(cell: Cell, verifierName: string): number {
  const a = aggregates.find((x) => x.cell.id === cell.id);
  if (!a) return 0;
  const idx = VERIFIERS.findIndex((v) => v.name === verifierName);
  return idx < 0 ? 0 : (a.detectionRate[idx] ?? 0);
}

/** Count (cell, verifier) pairs where a forged trail passed as clean at least once (det<1). */
function silentForgerySurface(): number {
  let count = 0;
  for (const a of aggregates) {
    for (const rate of a.detectionRate) {
      if (rate < 1) count += 1;
    }
  }
  return count;
}

/** The fraction of ALL (cell, verifier) rulings that were silent (det<1) — the blind-spot rate. */
function overallBlindSpotRate(): number {
  let blind = 0;
  let total = 0;
  for (const a of aggregates) {
    for (const rate of a.detectionRate) {
      total += 1;
      if (rate < 1) blind += 1;
    }
  }
  return total === 0 ? 0 : round3(blind / total);
}

/**
 * Minimum sufficient verifier per attack, OUTSIDER model (keyCompromised=false), aggregated
 * over stitch states: the cheapest verifier (fewest invariants) that catches the attack in
 * every trial of every outsider cell. Encoded as the verifier's invariant count (1..4), or 0
 * if even the full verifier misses it.
 */
function minSufficientVerifier(attack: Attack): number {
  const outsiderCells = cells.filter((c) => c.attack === attack && !c.keyCompromised);
  // Verifiers ordered weakest→strongest already; return the first that catches all cells fully.
  for (const v of VERIFIERS) {
    const catchesAll = outsiderCells.every((c) => det(c, v.name) >= 1);
    if (catchesAll) return v.checks.size;
  }
  return 0;
}

/**
 * Key-compromise blast radius: with a compromised key AND a sophisticated (stitched)
 * attacker, count attacks the FULL verifier still catches (structural invariants bite) vs.
 * loses. Returns { caught, lost } as codes.
 */
function keyCompromiseBlastRadius(): { caught: number; lost: number } {
  let caught = 0;
  let lost = 0;
  for (const attack of ATTACKS) {
    const insiderStitched = cells.find(
      (c) => c.attack === attack && c.keyCompromised && c.stitch,
    );
    if (!insiderStitched) continue;
    if (det(insiderStitched, 'full') >= 1) caught += 1;
    else lost += 1;
  }
  return { caught, lost };
}

/** How much does the SIG check alone catch, averaged over outsider cells? The "trust the signature" rate. */
function sigOnlyOutsiderCatchRate(): number {
  const outsider = cells.filter((c) => !c.keyCompromised);
  if (outsider.length === 0) return 0;
  const sum = outsider.reduce((s, c) => s + det(c, 'sig-only'), 0);
  return round3(sum / outsider.length);
}

const blast = keyCompromiseBlastRadius();

const summaryScorer: Scorer = {
  score() {
    return {
      cells: aggregates.length,
      trialsPerCell: TRIALS,
      verifiers: VERIFIERS.length,
      silentForgerySurface: silentForgerySurface(),
      overallBlindSpotRate: overallBlindSpotRate(),
      sigOnlyOutsiderCatchRate: sigOnlyOutsiderCatchRate(),
      minVerifier_insert: minSufficientVerifier('insert'),
      minVerifier_drop: minSufficientVerifier('drop'),
      minVerifier_reorder: minSufficientVerifier('reorder'),
      minVerifier_backdate: minSufficientVerifier('backdate'),
      minVerifier_tamperPayload: minSufficientVerifier('tamper-payload'),
      insiderCaughtByFull: blast.caught,
      insiderLostByFull: blast.lost,
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
