/**
 * The Designer agent: produces a DSL spec from a template bank.
 *
 * In the simulation, the designer does NOT use an LLM — it samples from a
 * parameterized spec template. The spec text is natural language and deliberately
 * contains "soft" phrasings for some clauses. These soft clauses are the ambiguous
 * ones: the interpreter and programmers may read them differently.
 *
 * The ground-truth semantics are known only to the evaluator (not injected into
 * any agent). The designer picks an opcode vocabulary and renders a spec document.
 */

import type { DslSpec, Opcode, OpcodeSemantics } from './types.js';
import type { Rand } from './rng.js';

/** All possible opcodes this DSL system can express. */
const OPCODE_POOL: ReadonlyArray<{
  name: string;
  arity: number;
  semantics: OpcodeSemantics;
  clear: string;   // unambiguous spec clause
  fuzzy: string;   // ambiguous spec clause (maps to same semantics, but wording causes misreads)
}> = [
  {
    name: 'PUSH',
    arity: 1,
    semantics: { kind: 'push', value: 0 }, // value is filled in at instruction time
    clear: 'PUSH N — places the literal integer N on top of the stack.',
    fuzzy: 'PUSH N — adds the number N to the working area.',
  },
  {
    name: 'LOAD',
    arity: 0,
    semantics: { kind: 'load' },
    clear: 'LOAD — reads the next value from the input tape and pushes it onto the stack.',
    fuzzy: 'LOAD — brings the input value into scope.',
  },
  {
    name: 'STORE',
    arity: 0,
    semantics: { kind: 'store' },
    clear: 'STORE — pops the top of the stack and appends it to the output list.',
    fuzzy: 'STORE — saves the current top value as output.',
  },
  {
    name: 'ADD',
    arity: 0,
    semantics: { kind: 'add' },
    clear: 'ADD — pops two values from the stack, pushes their sum.',
    fuzzy: 'ADD — combines the top two stack values by addition.',
  },
  {
    name: 'SUB',
    arity: 0,
    semantics: { kind: 'sub' },
    clear: 'SUB — pops two values (top, then second), pushes (top − second).',
    fuzzy: 'SUB — subtracts: removes the two topmost values and pushes the difference.',
  },
  {
    name: 'DUP',
    arity: 0,
    semantics: { kind: 'dup' },
    clear: 'DUP — copies the top-of-stack value and pushes the copy.',
    fuzzy: 'DUP — duplicates whatever is on top, leaving two copies.',
  },
  {
    name: 'JZ',
    arity: 1,
    semantics: { kind: 'jz', offset: 0 }, // offset filled at instruction time
    clear: 'JZ N — pops the top of stack; if it equals zero, jumps N instructions forward.',
    fuzzy: 'JZ N — checks top of stack; if zero, skips ahead N steps.',
  },
  {
    name: 'NOP',
    arity: 0,
    semantics: { kind: 'nop' },
    clear: 'NOP — does nothing; advances to the next instruction.',
    fuzzy: 'NOP — a no-operation placeholder.',
  },
];

/** Tasks that every programmer must attempt. Fixed vocabulary for determinism. */
export const TASKS = [
  {
    id: 'inc',
    description: 'Given N on the input, push N+1 onto the output.',
    check(output: number[], input: number): boolean {
      return output.length > 0 && output[output.length - 1] === input + 1;
    },
    testInputs: [0, 1, 5, 10, 99],
  },
  {
    id: 'const42',
    description: 'Push the constant 42 onto the output regardless of input.',
    check(output: number[], _input: number): boolean {
      return output.length > 0 && output[output.length - 1] === 42;
    },
    testInputs: [0, 1, 7],
  },
] as const;

/**
 * Design phase: pick `opcodeCount` opcodes, render a spec with some fuzzy clauses.
 * `pAmbiguity` is the probability each opcode clause uses the fuzzy wording.
 */
export function design(id: string, opcodeCount: number, pAmbiguity: number, rand: Rand): DslSpec {
  // Always include LOAD, STORE, ADD (needed for the test tasks) + fill rest
  const required = ['LOAD', 'STORE', 'ADD', 'PUSH'];
  const optional = OPCODE_POOL.filter((o) => !required.includes(o.name)).map((o) => o.name);

  // Shuffle optional to pick fillers
  const shuffled = [...optional];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j] as string;
    shuffled[j] = tmp as string;
  }

  const chosen = [...required, ...shuffled.slice(0, Math.max(0, opcodeCount - required.length))];
  const selected = chosen
    .map((name) => OPCODE_POOL.find((o) => o.name === name))
    .filter((o): o is (typeof OPCODE_POOL)[number] => o !== undefined)
    .slice(0, opcodeCount);

  const opcodes: Opcode[] = [];
  const groundTruth = new Map<string, OpcodeSemantics>();
  const clauses: string[] = [];
  let ambiguousClauses = 0;

  for (const entry of selected) {
    const useFuzzy = rand() < pAmbiguity;
    if (useFuzzy) ambiguousClauses++;
    clauses.push(useFuzzy ? entry.fuzzy : entry.clear);
    opcodes.push({ name: entry.name, arity: entry.arity, description: clauses[clauses.length - 1] ?? '' });
    groundTruth.set(entry.name, entry.semantics);
  }

  const text = renderSpec(opcodes, clauses);
  return { id, text, opcodes, groundTruth, ambiguousClauses };
}

function renderSpec(opcodes: Opcode[], clauses: string[]): string {
  const lines: string[] = [
    'MinLang DSL Specification v1',
    '============================',
    '',
    'This document defines the complete MinLang instruction set.',
    'Programs are sequences of instructions. Each instruction is on its own line.',
    'Operands are separated from the opcode by a space.',
    'The stack is initially empty. Execution begins at instruction 0.',
    '',
    'Instruction Set:',
    '',
  ];
  for (let i = 0; i < opcodes.length; i++) {
    lines.push(`  ${clauses[i] ?? ''}`);
  }
  lines.push('');
  lines.push('Programs are terminated when execution reaches the last instruction.');
  lines.push('Any undefined opcode encountered halts execution immediately.');
  return lines.join('\n');
}
