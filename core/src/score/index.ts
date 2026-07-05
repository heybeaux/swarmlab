import type { RunRecord } from '../types.js';

/**
 * Pluggable fitness function. Each experiment supplies its own.
 * May return a single number or a named breakdown.
 */
export interface Scorer {
  score(run: RunRecord): number | Record<string, number>;
}

/** Coerce a Scorer result into a named-score map ('fitness' for bare numbers). */
export function normalizeScores(result: number | Record<string, number>): Record<string, number> {
  return typeof result === 'number' ? { fitness: result } : result;
}

/** Run a scorer and return trace-ready scores. */
export function runScorer(scorer: Scorer, run: RunRecord): Record<string, number> {
  return normalizeScores(scorer.score(run));
}
