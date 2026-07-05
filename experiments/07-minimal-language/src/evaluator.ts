/**
 * The Evaluator: runs each programmer's programs through the interpreter and scores them.
 *
 * The evaluator is the only agent with access to ground truth. It knows the correct
 * output for each task and test input, and scores whether the program actually produces
 * it when run through the interpreter's opcode map.
 *
 * Key metrics:
 * - parseRate: fraction of programs with all opcodes recognized by the interpreter
 * - passRate: fraction of programs that produce correct output on all test inputs
 * - consistency: fraction of programs where programmer and interpreter agreed on
 *   all opcodes (no independent misreads on the same clause)
 * - specCoverage: fraction of DSL opcodes that appear in at least one program
 */

import type { DslSpec, InterpreterImpl, Program, ProgramResult, TrialResult } from './types.js';
import { TASKS } from './designer.js';
import { execute } from './interpreter.js';

/** Check if a program is parseable (all opcodes recognized by the interpreter). */
function isParseable(program: Program, impl: InterpreterImpl): boolean {
  return program.instructions.every((i) => impl.opcodeMap.has(i.opcode));
}

/** Run a program through the interpreter for all test inputs of its task. */
function evaluateProgram(program: Program, impl: InterpreterImpl): ProgramResult {
  const task = TASKS.find((t) => t.id === program.taskId);
  if (!task) {
    return { agentId: program.agentId, taskId: program.taskId, parsed: false, passed: false, testsPassed: 0, totalTests: 0 };
  }

  const parsed = isParseable(program, impl);
  if (!parsed) {
    return { agentId: program.agentId, taskId: program.taskId, parsed: false, passed: false, testsPassed: 0, totalTests: task.testInputs.length };
  }

  let testsPassed = 0;
  for (const input of task.testInputs) {
    const output = execute(program.instructions, impl, input);
    if (task.check(output, input)) testsPassed++;
  }

  return {
    agentId: program.agentId,
    taskId: program.taskId,
    parsed,
    passed: testsPassed === task.testInputs.length,
    testsPassed,
    totalTests: task.testInputs.length,
  };
}

/**
 * Score all programs and compute aggregate trial metrics.
 *
 * `programmerReadings` is a map from agentId to the programmer's own opcode reading.
 * We use this to detect when programmer and interpreter independently agreed/disagreed.
 */
export function evaluate(
  programs: Program[],
  spec: DslSpec,
  interpreterImpl: InterpreterImpl,
  programmerReadings: Map<string, InterpreterImpl>,
): TrialResult {
  const results = programs.map((p) => evaluateProgram(p, interpreterImpl));

  const parseRate = results.length > 0 ? results.filter((r) => r.parsed).length / results.length : 0;
  const passRate = results.length > 0 ? results.filter((r) => r.passed).length / results.length : 0;

  // Consistency: for each program, check if programmer and interpreter agree on all opcodes
  let consistentPrograms = 0;
  for (const program of programs) {
    const progReading = programmerReadings.get(program.agentId);
    if (!progReading) continue;
    let allAgree = true;
    for (const opcode of spec.opcodes) {
      const intSem = interpreterImpl.opcodeMap.get(opcode.name);
      const progSem = progReading.opcodeMap.get(opcode.name);
      if (intSem && progSem && intSem.kind !== progSem.kind) {
        allAgree = false;
        break;
      }
    }
    if (allAgree) consistentPrograms++;
  }
  const consistency = programs.length > 0 ? consistentPrograms / programs.length : 0;

  // Spec coverage: fraction of DSL opcodes used in at least one program
  const usedOpcodes = new Set<string>();
  for (const p of programs) {
    for (const instr of p.instructions) usedOpcodes.add(instr.opcode);
  }
  const specCoverage = spec.opcodes.length > 0 ? usedOpcodes.size / spec.opcodes.length : 0;

  return {
    trialSeed: '',  // filled in by trial runner
    pAmbiguity: 0,  // filled in by trial runner
    opcodeCount: spec.opcodes.length,
    parseRate: round3(parseRate),
    passRate: round3(passRate),
    consistency: round3(consistency),
    specCoverage: round3(specCoverage),
    misreadClauses: interpreterImpl.misreadClauses,
    programResults: results,
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
