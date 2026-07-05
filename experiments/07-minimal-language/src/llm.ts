/**
 * Experiment 07 — Minimal Language, real-LLM exhibition.
 *
 * The sim (main.ts) samples spec ambiguity from a template bank and models misreads
 * with a probability knob. This exhibition replaces every role with a real haiku:
 *
 *   1. DESIGNER writes a natural-language spec for a fixed 4-opcode stack machine
 *      (LOAD / PUSH / ADD / STORE) — its own words, no canonical text handed to it.
 *   2. INTERPRETER reads ONLY the designer's spec text (fresh isolated session) and
 *      emits an opcode->semantics JSON map.
 *   3. Two PROGRAMMERS read ONLY the spec text (fresh isolated sessions) and each write
 *      a program for the two tasks (inc: output N+1; const42: output 42).
 *
 * We then execute each program under (a) the ground-truth machine and (b) the
 * interpreter's reconstructed machine, and score pass rate + designer/interpreter
 * agreement. The whole point of the sim — that syntax parses while SEMANTICS silently
 * diverge from an independent reading of fuzzy prose — is measured here on real text,
 * not a probability. Isolation follows exp-01's "hijack" lesson (gen.ts).
 *
 * Run: node dist/llm.js. Env: ML_LLM_MODEL (default haiku). Exits 0 with a warning if
 * the claude CLI is unavailable — the sim sweep in main.ts is the primary artifact.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MessageBus,
  TraceWriter,
  readRunRecord,
  spawnAgent,
  StubRuntime,
} from '@swarmlab/core';
import { ClaudeCliGen, claudeCliAvailable, stripFences } from './gen.js';
import type { OpcodeSemantics } from './types.js';

const MODEL = process.env.ML_LLM_MODEL ?? 'claude-haiku-4-5-20251001';

/** The fixed ground-truth machine the designer must describe (in its own words). */
const GROUND_TRUTH: Record<string, OpcodeSemantics> = {
  LOAD: { kind: 'load' },
  PUSH: { kind: 'push', value: 0 },
  ADD: { kind: 'add' },
  STORE: { kind: 'store' },
};

interface Instr {
  op: string;
  operand?: number;
}

/** Execute a program on a machine defined by an opcode->semantics map. */
function run(prog: Instr[], sem: Record<string, OpcodeSemantics>, input: number): number[] {
  const stack: number[] = [];
  const output: number[] = [];
  for (const ins of prog) {
    const s = sem[ins.op];
    if (!s) continue; // unknown opcode: skip (halt-ish); scoring will catch the miss
    switch (s.kind) {
      case 'load':
        stack.push(input);
        break;
      case 'push':
        stack.push(ins.operand ?? 0);
        break;
      case 'add': {
        const b = stack.pop() ?? 0;
        const a = stack.pop() ?? 0;
        stack.push(a + b);
        break;
      }
      case 'sub': {
        const top = stack.pop() ?? 0;
        const second = stack.pop() ?? 0;
        stack.push(top - second);
        break;
      }
      case 'dup': {
        const t = stack[stack.length - 1] ?? 0;
        stack.push(t);
        break;
      }
      case 'store':
        output.push(stack.pop() ?? 0);
        break;
      default:
        break;
    }
  }
  return output;
}

const TASKS = [
  { id: 'inc', inputs: [0, 1, 5, 10], check: (out: number[], n: number) => out.at(-1) === n + 1 },
  { id: 'const42', inputs: [0, 3, 9], check: (out: number[], _n: number) => out.at(-1) === 42 },
] as const;

/** Parse the interpreter's JSON opcode map, tolerating fences and stray prose. */
function parseSemMap(raw: string): Record<string, OpcodeSemantics> {
  const text = stripFences(raw);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) return {};
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, { kind?: string }>;
    const out: Record<string, OpcodeSemantics> = {};
    for (const [k, v] of Object.entries(obj)) {
      const kind = (v?.kind ?? '').toLowerCase();
      if (kind === 'load') out[k.toUpperCase()] = { kind: 'load' };
      else if (kind === 'push') out[k.toUpperCase()] = { kind: 'push', value: 0 };
      else if (kind === 'add') out[k.toUpperCase()] = { kind: 'add' };
      else if (kind === 'store') out[k.toUpperCase()] = { kind: 'store' };
      else if (kind === 'sub') out[k.toUpperCase()] = { kind: 'sub' };
      else if (kind === 'dup') out[k.toUpperCase()] = { kind: 'dup' };
    }
    return out;
  } catch {
    return {};
  }
}

/** Parse a program: one instruction per line, "OP" or "OP N". */
function parseProgram(raw: string): Instr[] {
  const text = stripFences(raw);
  const prog: Instr[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z]+)(?:\s+(-?\d+))?\s*$/.exec(line.trim());
    if (!m || !m[1]) continue;
    const op = m[1].toUpperCase();
    if (!(op in GROUND_TRUTH)) continue; // ignore non-opcode lines (commentary etc.)
    prog.push(m[2] !== undefined ? { op, operand: Number(m[2]) } : { op });
  }
  return prog;
}

function semEqual(a: OpcodeSemantics, b: OpcodeSemantics): boolean {
  return a.kind === b.kind;
}

async function main(): Promise<void> {
  if (!claudeCliAvailable()) {
    console.warn('claude CLI unavailable — LLM exhibition skipped (sim sweep is the primary artifact)');
    return;
  }
  const gen = new ClaudeCliGen(MODEL);
  const runsDir = join(import.meta.dirname, '..', 'runs');
  mkdirSync(runsDir, { recursive: true });
  const runId = `ml-llm-${Date.now().toString(36)}`;
  const traceFile = join(runsDir, `${runId}.jsonl`);
  const trace = new TraceWriter(traceFile, { runId, experiment: '07-minimal-language' });
  const bus = new MessageBus({ trace });
  const runtime = new StubRuntime();

  bus.publish({
    from: 'orchestrator',
    to: '*',
    topic: 'meta',
    body: { mode: 'llm', model: MODEL, opcodes: Object.keys(GROUND_TRUTH), tasks: TASKS.map((t) => t.id) },
  });
  console.log(`run ${runId} | mode=llm model=${MODEL}`);

  await spawnAgent({ id: 'designer', model: MODEL, systemPrompt: 'DSL Designer' }, { runtime, trace });
  await spawnAgent({ id: 'interpreter', model: MODEL, systemPrompt: 'Interpreter' }, { runtime, trace });
  await spawnAgent({ id: 'programmer-0', model: MODEL, systemPrompt: 'Programmer' }, { runtime, trace });
  await spawnAgent({ id: 'programmer-1', model: MODEL, systemPrompt: 'Programmer' }, { runtime, trace });

  // --- Design phase: the designer writes the spec in its own words -----------
  const designSys =
    'You are a language designer. Write a short, self-contained specification document for a ' +
    'tiny stack-machine DSL with EXACTLY these four opcodes: LOAD, PUSH, ADD, STORE. Describe ' +
    'precisely what each does to the stack / input tape / output list. Do not give examples or ' +
    'programs — only the instruction reference. Plain prose, no code fences.';
  const spec = stripFences(await gen.gen(designSys, 'Write the specification now.'));
  bus.publish({ from: 'designer', to: '*', topic: 'spec', body: { specText: spec.slice(0, 400) } });
  console.log(`designer spec: ${spec.length} chars`);

  // --- Interpret phase: read ONLY the spec, emit a semantics map -------------
  const interpSys =
    'You implement an interpreter from a spec you are given. Read the spec below and output ONLY ' +
    'a JSON object mapping each opcode name to its semantics, using this exact vocabulary for ' +
    '"kind": "load" (push the next input value), "push" (push the literal operand), "add" (pop ' +
    'two, push their sum), "store" (pop one, append to output), "sub", "dup". Example shape: ' +
    '{"LOAD":{"kind":"load"},"PUSH":{"kind":"push"},"ADD":{"kind":"add"},"STORE":{"kind":"store"}}. ' +
    'Output the JSON and nothing else.';
  const interpRaw = await gen.gen(interpSys, `SPEC:\n${spec}`);
  const interpMap = parseSemMap(interpRaw);
  const interpMisreads = Object.keys(GROUND_TRUTH).filter(
    (op) => !interpMap[op] || !semEqual(interpMap[op] as OpcodeSemantics, GROUND_TRUTH[op] as OpcodeSemantics),
  );
  bus.publish({
    from: 'interpreter',
    to: '*',
    topic: 'impl',
    body: { opcodes: Object.keys(interpMap), misreads: interpMisreads },
  });
  console.log(`interpreter map: ${Object.keys(interpMap).join(',') || '(none)'} | misreads: ${interpMisreads.join(',') || 'none'}`);

  // --- Program phase: each programmer reads ONLY the spec, writes programs ----
  const progSys =
    'You write programs in a DSL, given only its spec. The spec is below. Output ONLY the program ' +
    'as one instruction per line ("OP" or "OP N" for opcodes that take an operand). No prose, no ' +
    'fences, no comments.';

  interface ProgRec {
    programmer: string;
    task: string;
    prog: Instr[];
    passTruth: boolean;
    passInterp: boolean;
  }
  const records: ProgRec[] = [];

  for (const pid of ['programmer-0', 'programmer-1']) {
    for (const task of TASKS) {
      const taskPrompt =
        task.id === 'inc'
          ? 'Task: read one integer N from the input tape and write N+1 to the output.'
          : 'Task: write the constant 42 to the output, ignoring the input.';
      const raw = await gen.gen(progSys, `SPEC:\n${spec}\n\n${taskPrompt}\n\nProgram:`);
      const prog = parseProgram(raw);
      const passTruth = task.inputs.every((n) => task.check(run(prog, GROUND_TRUTH, n), n));
      const passInterp =
        Object.keys(interpMap).length > 0 && task.inputs.every((n) => task.check(run(prog, interpMap, n), n));
      records.push({ programmer: pid, task: task.id, prog, passTruth, passInterp });
      bus.publish({
        from: pid,
        to: 'evaluator',
        topic: 'program',
        body: { task: task.id, source: prog.map((i) => (i.operand !== undefined ? `${i.op} ${i.operand}` : i.op)).join(' | '), passTruth, passInterp },
      });
      console.log(`  ${pid}/${task.id}: [${prog.map((i) => (i.operand !== undefined ? `${i.op} ${i.operand}` : i.op)).join(' ')}] truth=${passTruth} interp=${passInterp}`);
    }
  }

  // --- Score -----------------------------------------------------------------
  const nProg = records.length;
  const passTruthRate = nProg === 0 ? 0 : records.filter((r) => r.passTruth).length / nProg;
  const passInterpRate = nProg === 0 ? 0 : records.filter((r) => r.passInterp).length / nProg;
  // "Silent divergence": programs the interpreter accepts (passInterp) but the ground
  // truth rejects (!passTruth) — the interpreter's misreading masks a wrong program.
  const silentDivergence = records.filter((r) => r.passInterp && !r.passTruth).length;
  const interpAgreement = (Object.keys(GROUND_TRUTH).length - interpMisreads.length) / Object.keys(GROUND_TRUTH).length;

  const round3 = (n: number): number => Math.round(n * 1000) / 1000;
  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      programsWritten: nProg,
      passTruthRate: round3(passTruthRate),
      passInterpRate: round3(passInterpRate),
      interpMisreads: interpMisreads.length,
      interpAgreement: round3(interpAgreement),
      silentDivergence,
    },
  });

  for (const id of ['designer', 'interpreter', 'programmer-0', 'programmer-1']) {
    trace.append({ t: 'kill', ts: Date.now(), agentId: id });
  }

  const replayed = await readRunRecord(traceFile);
  console.log(
    `passTruth=${round3(passTruthRate)} passInterp=${round3(passInterpRate)} ` +
      `interpAgreement=${round3(interpAgreement)} silentDivergence=${silentDivergence} | ` +
      `replay verified: ${replayed.events.length} events | trace: ${traceFile}`,
  );
}

await main();
