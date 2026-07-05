/**
 * The fitness function selection actually optimizes. This is the ACR/AWM object
 * under test: what happens to an evolving population when the fitness signal is
 * TRUE vs. when it rewards a cheap PROXY.
 *
 * Two regimes, chosen by DARWIN_DECEPTION in [0,1]:
 *   - deception = 0: fitness = grade.f1 (the honest recovery of the hidden set).
 *   - deception = d: fitness = (1-d)*f1 + d*proxy, where `proxy` rewards raw
 *     prompt LENGTH (verbosity) — a metric that is cheap to compute and cheap to
 *     game but only weakly correlated with real quality. This models a lazy ACR
 *     fitness function that grades "the prompt looks thorough" instead of "the
 *     prompt produces the right answer."
 *
 * The proxy is normalized so a maxed-out (10-directive) genome scores 1.0 on it.
 * The prediction: under deception the population mode-seeks toward long,
 * verbose, mostly-off-theme prompts (Goodhart) while true F1 stagnates or falls,
 * even as reported fitness climbs. That divergence is the whole lesson.
 *
 * In BOTH regimes the numbers are computed here by the harness from the graded
 * artifact — never claimed by an agent.
 */
import type { Genome } from './genome.js';
import type { Grade } from './task.js';
import { round3 } from './task.js';

const MAX_DIRECTIVES = 10;

export interface Fitness {
  /** The scalar selection optimizes. */
  value: number;
  /** The honest quality (f1) — always tracked, even when not selected on. */
  trueF1: number;
  /** The proxy component (prompt length reward), for divergence analysis. */
  proxy: number;
}

export function computeFitness(genome: Genome, grade: Grade, deception: number): Fitness {
  const trueF1 = grade.f1;
  const proxy = Math.min(1, genome.directives.length / MAX_DIRECTIVES);
  const d = Math.max(0, Math.min(1, deception));
  const value = (1 - d) * trueF1 + d * proxy;
  return { value: round3(value), trueF1: round3(trueF1), proxy: round3(proxy) };
}
