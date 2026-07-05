/**
 * The Programmer agents: each reads the spec and writes programs for the given tasks.
 *
 * In the simulation, each programmer independently reads the spec — fuzzy clauses can
 * cause misreadings, just like in the interpreter. The key: interpreter and programmers
 * build their opcode models *independently*, so even when both misread the same clause
 * they may misread it differently, producing programs that fail in unexpected ways.
 *
 * Programming strategy is deterministic given the programmer's reading of the spec:
 * a correct reading → a correct program; a misreading → a syntactically valid but
 * semantically wrong (or empty) program.
 */

import type { DslSpec, Instruction, InterpreterImpl, Program } from './types.js';
import type { Rand } from './rng.js';
import { TASKS } from './designer.js';
import { interpret } from './interpreter.js';

/**
 * Write a single program for a task based on the programmer's opcode reading.
 */
function writeProgram(taskId: string, reading: InterpreterImpl, agentId: string): Program {
  let instructions: Instruction[];
  let source: string;

  const hasLoad = reading.opcodeMap.has('LOAD');
  const hasStore = reading.opcodeMap.has('STORE');
  const hasAdd = reading.opcodeMap.has('ADD');
  const hasPush = reading.opcodeMap.has('PUSH');

  if (taskId === 'inc') {
    if (hasLoad && hasAdd && hasStore && hasPush) {
      instructions = [
        { opcode: 'LOAD', operands: [] },
        { opcode: 'PUSH', operands: [1] },
        { opcode: 'ADD', operands: [] },
        { opcode: 'STORE', operands: [] },
      ];
      source = 'LOAD\nPUSH 1\nADD\nSTORE';
    } else if (hasLoad && hasStore) {
      // Can't compute N+1, just echo input (wrong result, but valid program)
      instructions = [
        { opcode: 'LOAD', operands: [] },
        { opcode: 'STORE', operands: [] },
      ];
      source = 'LOAD\nSTORE';
    } else {
      // Missing critical opcodes — emit first two known opcodes
      instructions = [...reading.opcodeMap.keys()].slice(0, 2).map((op) => ({
        opcode: op,
        operands: [] as number[],
      }));
      source = instructions.map((i) => i.opcode).join('\n');
    }
  } else if (taskId === 'const42') {
    if (hasPush && hasStore) {
      instructions = [
        { opcode: 'PUSH', operands: [42] },
        { opcode: 'STORE', operands: [] },
      ];
      source = 'PUSH 42\nSTORE';
    } else if (hasPush && hasAdd && hasStore) {
      // Alternate: PUSH 40, PUSH 2, ADD, STORE
      instructions = [
        { opcode: 'PUSH', operands: [40] },
        { opcode: 'PUSH', operands: [2] },
        { opcode: 'ADD', operands: [] },
        { opcode: 'STORE', operands: [] },
      ];
      source = 'PUSH 40\nPUSH 2\nADD\nSTORE';
    } else {
      instructions = [...reading.opcodeMap.keys()].slice(0, 1).map((op) => ({
        opcode: op,
        operands: [] as number[],
      }));
      source = instructions.map((i) => i.opcode).join('\n');
    }
  } else {
    instructions = [];
    source = '';
  }

  return { agentId, taskId, instructions, source };
}

/**
 * Simulate all programs written by one programmer agent.
 * Each programmer independently reads the spec (may differ from interpreter's reading).
 */
export function writeProgramsForAgent(
  agentId: string,
  spec: DslSpec,
  pAmbiguity: number,
  rand: Rand,
): Program[] {
  const reading = interpret(spec, pAmbiguity, rand);
  return TASKS.map((task) => writeProgram(task.id, reading, agentId));
}
