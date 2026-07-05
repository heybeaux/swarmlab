/**
 * The Interpreter agent: reads the spec and builds an opcode map.
 *
 * In the simulation, the interpreter parses the spec's clause list and reconstructs
 * semantics. If `pAmbiguity > 0`, some clauses were phrased fuzzily, which causes
 * the interpreter to mis-read them — producing a semantics map that diverges from
 * the designer's ground truth.
 *
 * The divergence model: for each fuzzy clause, the interpreter picks from a set of
 * plausible-but-wrong interpretations based on the wording.
 */

import type { DslSpec, InterpreterImpl, OpcodeSemantics } from './types.js';
import type { Rand } from './rng.js';

/**
 * Possible mis-readings for each opcode when the clause is fuzzy.
 * Each entry is an alternative semantics a programmer might infer from fuzzy wording.
 */
const MIS_READINGS: Readonly<Record<string, readonly OpcodeSemantics[]>> = {
  PUSH: [
    { kind: 'dup' },      // "adds N to the working area" → interpreted as "copy"
  ],
  LOAD: [
    { kind: 'dup' },      // "brings into scope" → reader thinks it duplicates top
  ],
  STORE: [
    { kind: 'dup' },      // "saves current top" → reader thinks it leaves a copy, doesn't pop
  ],
  ADD: [
    { kind: 'sub' },      // "combines" → ambiguous about operand order
  ],
  SUB: [
    { kind: 'add' },      // "difference" → ambiguous which direction
  ],
  DUP: [
    { kind: 'load' },     // "duplicates whatever is on top" → reader thinks it loads from input
  ],
  JZ: [
    { kind: 'jmp', offset: 0 }, // "skips ahead" → unconditional read
  ],
  NOP: [],               // NOP is never ambiguous; correct by default
};

/**
 * Interpret the spec and return an opcode map, possibly with misreadings for fuzzy clauses.
 * `pAmbiguity` is the per-clause probability of triggering a mis-read.
 */
export function interpret(spec: DslSpec, pAmbiguity: number, rand: Rand): InterpreterImpl {
  const opcodeMap = new Map<string, OpcodeSemantics>();
  const ambiguityNotes: string[] = [];
  let misreadClauses = 0;

  for (const opcode of spec.opcodes) {
    const truth = spec.groundTruth.get(opcode.name);
    if (!truth) continue;

    const alternatives = MIS_READINGS[opcode.name];
    const isFuzzyClause = spec.ambiguousClauses > 0 && !opcode.description.includes(' — ') ||
      // detect fuzzy phrasing by checking for characteristic words
      opcode.description.includes('working area') ||
      opcode.description.includes('into scope') ||
      opcode.description.includes('current top') ||
      opcode.description.includes('combines') ||
      opcode.description.includes('removes the two') ||
      opcode.description.includes('whatever is on top') ||
      opcode.description.includes('skips ahead');

    if (isFuzzyClause && alternatives && alternatives.length > 0 && rand() < pAmbiguity) {
      const misread = alternatives[Math.floor(rand() * alternatives.length)];
      if (misread) {
        opcodeMap.set(opcode.name, misread);
        ambiguityNotes.push(`${opcode.name}: read as '${misread.kind}' (ground truth: '${truth.kind}')`);
        misreadClauses++;
        continue;
      }
    }

    // Correct read
    opcodeMap.set(opcode.name, truth);
  }

  return { opcodeMap, ambiguityNotes, misreadClauses };
}

/** Execute a program using the interpreter's opcode map. Returns output stack. */
export function execute(
  instructions: ReadonlyArray<{ opcode: string; operands: number[] }>,
  interpreterImpl: InterpreterImpl,
  inputValue: number,
): number[] {
  const stack: number[] = [];
  const output: number[] = [];
  const maxSteps = 1000; // safety against infinite loops
  let pc = 0;
  let steps = 0;

  while (pc < instructions.length && steps < maxSteps) {
    steps++;
    const instr = instructions[pc];
    if (!instr) break;

    const sem = interpreterImpl.opcodeMap.get(instr.opcode);
    if (!sem) break; // undefined opcode halts

    switch (sem.kind) {
      case 'push': {
        const val = instr.operands[0] ?? sem.value;
        stack.push(val);
        pc++;
        break;
      }
      case 'load':
        stack.push(inputValue);
        pc++;
        break;
      case 'store': {
        const v = stack.pop();
        if (v !== undefined) output.push(v);
        pc++;
        break;
      }
      case 'add': {
        const b = stack.pop() ?? 0;
        const a = stack.pop() ?? 0;
        stack.push(a + b);
        pc++;
        break;
      }
      case 'sub': {
        const top = stack.pop() ?? 0;
        const second = stack.pop() ?? 0;
        stack.push(top - second);
        pc++;
        break;
      }
      case 'dup': {
        const top = stack[stack.length - 1];
        if (top !== undefined) stack.push(top);
        pc++;
        break;
      }
      case 'jz': {
        const top = stack.pop() ?? 0;
        const offset = instr.operands[0] ?? sem.offset;
        if (top === 0) {
          pc += offset + 1;
        } else {
          pc++;
        }
        break;
      }
      case 'jmp': {
        const offset = instr.operands[0] ?? sem.offset;
        pc += offset + 1;
        break;
      }
      case 'nop':
        pc++;
        break;
    }
  }

  return output;
}
