/**
 * The seam between the experiment and the two agents' *judgement*. The harness
 * always executes tests for real (see oracle.ts); these interfaces only stand in
 * for what a coder / breaker would DECIDE to do, so an LLM and a deterministic
 * simulation are interchangeable behind the same contract.
 *
 * The breaker sees the current code (it edits the same file, so this is fair) but
 * NOT the oracle — it must reason from the code's behaviour alone about where the
 * intent is violated. The coder sees the code and the full executed suite.
 */
import type { CodeModel } from './code.js';
import type { TestCase } from './oracle.js';

/** The breaker's move: propose one input it believes breaks the code, plus the
 *  label it will assert. `expected` may be a lie (poison); the harness tags it. */
export interface BreakerMove {
  input: number;
  expected: string;
}

/** The coder's move: a new implementation intended to pass the whole suite. */
export type CoderMove = CodeModel;

export interface PairAgents {
  readonly mode: 'llm' | 'sim';
  readonly model: string;
  /**
   * Breaker turn. Given the current code (black box on the oracle) and the tests
   * already filed, return the next test to file, or null if it gives up.
   */
  breakerMove(current: CodeModel, priorTests: readonly TestCase[]): Promise<BreakerMove | null>;
  /**
   * Coder turn. Given the current code and the full (executed) suite, return a
   * repaired implementation.
   */
  coderMove(current: CodeModel, suite: readonly TestCase[]): Promise<CoderMove>;
}
