/**
 * Experiment 07 — Minimal Language.
 *
 * A swarm designs a tiny DSL, implements its interpreter, then writes programs in it.
 * Each role only sees the spec document — nobody shares reasoning. Spec ambiguity is
 * the independent variable; how well it holds the system together is what we measure.
 */

/** An opcode in the minimal DSL. */
export interface Opcode {
  /** Short mnemonic (e.g. "ADD", "PUSH", "JMP"). */
  name: string;
  /** Human-readable description as it appears in the spec. */
  description: string;
  /** Number of operand slots (0..2). */
  arity: number;
}

/**
 * A canonical (ground-truth) definition of an opcode's semantics.
 * The interpreter must reconstruct this from the spec text alone.
 */
export type OpcodeSemantics =
  | { kind: 'push'; value: number }           // push a literal
  | { kind: 'add' }                            // pop two, push sum
  | { kind: 'sub' }                            // pop two, push difference (top - second)
  | { kind: 'dup' }                            // duplicate top of stack
  | { kind: 'load' }                           // push input value onto stack
  | { kind: 'store' }                          // pop and add to output
  | { kind: 'jz'; offset: number }             // jump if top==0 (relative, pops)
  | { kind: 'jmp'; offset: number }            // unconditional jump (relative)
  | { kind: 'nop' };                           // no-op

/** A DSL spec as the designer produced it. */
export interface DslSpec {
  /** Spec ID (used in trace). */
  id: string;
  /** The spec document text (natural language). */
  text: string;
  /** Ordered list of opcodes described in the spec. */
  opcodes: Opcode[];
  /** Ground-truth semantics for each opcode (known to the evaluator, not the agents). */
  groundTruth: Map<string, OpcodeSemantics>;
  /** Number of intentionally ambiguous clauses in the spec. */
  ambiguousClauses: number;
}

/** A single instruction in a program. */
export interface Instruction {
  opcode: string;
  operands: number[];
}

/** A program produced by a Programmer agent. */
export interface Program {
  /** Programmer agent id. */
  agentId: string;
  /** Task this program is meant to solve. */
  taskId: string;
  /** The instructions. */
  instructions: Instruction[];
  /** Raw source string (for trace). */
  source: string;
}

/** How the interpreter maps an opcode to semantics. May diverge from ground truth. */
export interface InterpreterImpl {
  /** For each opcode name, the semantics the interpreter will apply. */
  opcodeMap: Map<string, OpcodeSemantics>;
  /** Notes about clauses the interpreter found ambiguous. */
  ambiguityNotes: string[];
  /** Number of clauses the interpreter read differently from ground truth. */
  misreadClauses: number;
}

/** The task given to all programmers. */
export interface Task {
  id: string;
  description: string;
  /** Function to check correctness given stack state after execution. */
  check(outputStack: number[], inputValue: number): boolean;
  /** Representative input values to test. */
  testInputs: number[];
}

/** Result of running one program. */
export interface ProgramResult {
  agentId: string;
  taskId: string;
  parsed: boolean;
  passed: boolean;
  /** How many test inputs passed. */
  testsPassed: number;
  totalTests: number;
}

/** Snapshot of one trial. */
export interface TrialResult {
  trialSeed: string;
  pAmbiguity: number;
  opcodeCount: number;
  parseRate: number;
  passRate: number;
  consistency: number;
  specCoverage: number;
  misreadClauses: number;
  programResults: ProgramResult[];
}

export interface ExperimentConfig {
  nProgrammers: number;
  nTasks: number;
  pAmbiguity: number;
  opcodeCount: number;
  maxOpcodes: number;
  seed: string;
}
