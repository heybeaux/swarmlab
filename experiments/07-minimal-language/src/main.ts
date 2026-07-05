/**
 * Experiment 07 — Minimal Language.
 *
 * A swarm designs a tiny DSL (the Designer), implements its interpreter (the Interpreter),
 * then writes programs in it (N Programmers). Each role sees only the spec text — no
 * shared reasoning. The spec's ambiguity is the independent variable; we measure whether
 * it holds the system together.
 *
 * Sweep: pAmbiguity × opcodeCount, 25 seeded trials/cell.
 * Exhibition trial (t=0) per cell: agents spawned through core/spawn, all messages on bus.
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
import { design, TASKS } from './designer.js';
import { interpret } from './interpreter.js';
import { writeProgramsForAgent } from './programmer.js';
import { evaluate } from './evaluator.js';
import type { TrialResult } from './types.js';

// --- configuration -----------------------------------------------------------

const TRIALS = Number(process.env.ML_TRIALS ?? 25);
const SEED = process.env.ML_SEED ?? 'minimal-language-v1';
const N_PROGRAMMERS = Number(process.env.ML_PROGRAMMERS ?? 4);
const MAX_OPCODES = Number(process.env.ML_MAX_OPCODES ?? 6);

const P_AMBIGUITIES = [0.0, 0.05, 0.15, 0.3, 0.6] as const;
const OPCODE_COUNTS = [3, 4, 6] as const;

interface Cell {
  id: string;
  pAmbiguity: number;
  opcodeCount: number;
}

const cells: Cell[] = [];
for (const pAmbiguity of P_AMBIGUITIES) {
  for (const opcodeCount of OPCODE_COUNTS) {
    cells.push({ id: `p${pAmbiguity}-o${opcodeCount}`, pAmbiguity, opcodeCount });
  }
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

// --- setup -------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `ml-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '07-minimal-language' });
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
    nProgrammers: N_PROGRAMMERS,
    maxOpcodes: MAX_OPCODES,
    cells: cells.map((c) => c.id),
  },
});

console.log(
  `run ${runId} | cells=${cells.length} trials/cell=${TRIALS} ` +
    `n_programmers=${N_PROGRAMMERS} max_opcodes=${MAX_OPCODES}`,
);

// --- sweep -------------------------------------------------------------------

interface CellAggregate {
  cell: Cell;
  meanParseRate: number;
  meanPassRate: number;
  meanConsistency: number;
  meanSpecCoverage: number;
  meanMisreadClauses: number;
}

const aggregates: CellAggregate[] = [];

for (let c = 0; c < cells.length; c += 1) {
  const cell = cells[c];
  if (!cell) continue;

  bus.publish({
    from: 'orchestrator',
    to: '*',
    topic: 'cell',
    body: { cell: cell.id, pAmbiguity: cell.pAmbiguity, opcodeCount: cell.opcodeCount },
  });

  // Exhibition trial: spawn real agents through core
  const designerHandle = await spawnAgent(
    {
      id: `${cell.id}:designer`,
      systemPrompt: 'You are the DSL Designer. Design a minimal language spec.',
    },
    { runtime, trace },
  );

  const interpreterHandle = await spawnAgent(
    {
      id: `${cell.id}:interpreter`,
      systemPrompt: 'You are the Interpreter. Read the spec and implement it.',
    },
    { runtime, trace },
  );

  const programmerHandles = [];
  for (let i = 0; i < N_PROGRAMMERS; i++) {
    programmerHandles.push(
      await spawnAgent(
        {
          id: `${cell.id}:programmer-${i}`,
          systemPrompt: 'You are a Programmer. Write programs per the spec.',
        },
        { runtime, trace },
      ),
    );
  }

  const evaluatorHandle = await spawnAgent(
    {
      id: `${cell.id}:evaluator`,
      systemPrompt: 'You are the Evaluator. Score all programs.',
    },
    { runtime, trace },
  );

  const trialResults: TrialResult[] = [];

  for (let t = 0; t < TRIALS; t += 1) {
    const trialSeed = `${SEED}:${cell.id}:${t}`;
    const rand = seeded(trialSeed);
    const specId = `${cell.id}:t${t}`;

    // --- Design phase ---
    const spec = design(specId, Math.min(cell.opcodeCount, MAX_OPCODES), cell.pAmbiguity, rand);

    if (t === 0) {
      bus.publish({
        from: `${cell.id}:designer`,
        to: '*',
        topic: 'spec',
        body: {
          specId,
          opcodeCount: spec.opcodes.length,
          clauseCount: spec.opcodes.length,
          ambiguousClauses: spec.ambiguousClauses,
          specText: spec.text.slice(0, 300), // truncated for trace
        },
      });
    }

    // --- Interpret phase ---
    const randInterp = seeded(`${trialSeed}:interpreter`);
    const impl = interpret(spec, cell.pAmbiguity, randInterp);

    if (t === 0) {
      bus.publish({
        from: `${cell.id}:interpreter`,
        to: `${cell.id}:evaluator`,
        topic: 'impl',
        body: {
          misreadClauses: impl.misreadClauses,
          ambiguityNotes: impl.ambiguityNotes,
          opcodes: [...impl.opcodeMap.keys()],
        },
      });
    }

    // --- Program phase ---
    const allPrograms = [];
    const programmerReadings = new Map();
    for (let i = 0; i < N_PROGRAMMERS; i++) {
      const progRand = seeded(`${trialSeed}:programmer-${i}`);
      const programs = writeProgramsForAgent(`programmer-${i}`, spec, cell.pAmbiguity, progRand);
      allPrograms.push(...programs);

      // Capture programmer's reading for consistency scoring
      const readingRand = seeded(`${trialSeed}:programmer-${i}`);
      const reading = interpret(spec, cell.pAmbiguity, readingRand);
      programmerReadings.set(`programmer-${i}`, reading);

      if (t === 0) {
        for (const prog of programs) {
          bus.publish({
            from: `${cell.id}:programmer-${i}`,
            to: `${cell.id}:evaluator`,
            topic: 'program',
            body: {
              agentId: `programmer-${i}`,
              task: prog.taskId,
              instructionCount: prog.instructions.length,
              source: prog.source,
            },
          });
        }
      }
    }

    // --- Evaluate phase ---
    const result = evaluate(allPrograms, spec, impl, programmerReadings);
    result.trialSeed = trialSeed;
    result.pAmbiguity = cell.pAmbiguity;
    trialResults.push(result);

    if (t === 0) {
      for (const pr of result.programResults) {
        bus.publish({
          from: `${cell.id}:evaluator`,
          to: '*',
          topic: 'result',
          body: {
            agentId: pr.agentId,
            task: pr.taskId,
            parsed: pr.parsed,
            passed: pr.passed,
            testsPassed: pr.testsPassed,
            totalTests: pr.totalTests,
          },
        });
      }
    }
  }

  // Kill spawned agents
  await designerHandle.kill();
  await interpreterHandle.kill();
  for (const h of programmerHandles) await h.kill();
  await evaluatorHandle.kill();

  bus.removeAgent(`${cell.id}:designer`);
  bus.removeAgent(`${cell.id}:interpreter`);
  for (let i = 0; i < N_PROGRAMMERS; i++) bus.removeAgent(`${cell.id}:programmer-${i}`);
  bus.removeAgent(`${cell.id}:evaluator`);

  // Aggregate
  const avg = (f: (r: TrialResult) => number): number =>
    round3(trialResults.reduce((s, r) => s + f(r), 0) / trialResults.length);

  const agg: CellAggregate = {
    cell,
    meanParseRate: avg((r) => r.parseRate),
    meanPassRate: avg((r) => r.passRate),
    meanConsistency: avg((r) => r.consistency),
    meanSpecCoverage: avg((r) => r.specCoverage),
    meanMisreadClauses: avg((r) => r.misreadClauses),
  };
  aggregates.push(agg);

  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      cellIndex: c,
      pAmbiguity: cell.pAmbiguity,
      opcodeCount: cell.opcodeCount,
      trials: TRIALS,
      meanParseRate: agg.meanParseRate,
      meanPassRate: agg.meanPassRate,
      meanConsistency: agg.meanConsistency,
      meanSpecCoverage: agg.meanSpecCoverage,
      meanMisreadClauses: agg.meanMisreadClauses,
    },
  });

  console.log(
    `${cell.id.padEnd(14)} | parse=${agg.meanParseRate.toFixed(2)} ` +
      `pass=${agg.meanPassRate.toFixed(2)} consist=${agg.meanConsistency.toFixed(2)} ` +
      `cov=${agg.meanSpecCoverage.toFixed(2)} misread=${agg.meanMisreadClauses.toFixed(2)}`,
  );
}

// --- summary -----------------------------------------------------------------

const summaryScorer: Scorer = {
  score() {
    const zeroAmb = aggregates.filter((a) => a.cell.pAmbiguity === 0);
    const highAmb = aggregates.filter((a) => a.cell.pAmbiguity >= 0.3);
    const meanPassZero = zeroAmb.length > 0
      ? round3(zeroAmb.reduce((s, a) => s + a.meanPassRate, 0) / zeroAmb.length) : 0;
    const meanPassHigh = highAmb.length > 0
      ? round3(highAmb.reduce((s, a) => s + a.meanPassRate, 0) / highAmb.length) : 0;
    const meanConsistZero = zeroAmb.length > 0
      ? round3(zeroAmb.reduce((s, a) => s + a.meanConsistency, 0) / zeroAmb.length) : 0;
    const meanConsistHigh = highAmb.length > 0
      ? round3(highAmb.reduce((s, a) => s + a.meanConsistency, 0) / highAmb.length) : 0;
    return {
      cells: aggregates.length,
      trialsPerCell: TRIALS,
      meanPassRateAtZeroAmbiguity: meanPassZero,
      meanPassRateAtHighAmbiguity: meanPassHigh,
      passRateDrop: round3(meanPassZero - meanPassHigh),
      meanConsistencyAtZeroAmbiguity: meanConsistZero,
      meanConsistencyAtHighAmbiguity: meanConsistHigh,
      consistencyDrop: round3(meanConsistZero - meanConsistHigh),
    };
  },
};

const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

// --- replay verification (DoD) -----------------------------------------------

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
