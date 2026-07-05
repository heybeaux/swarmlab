/** Shared contracts for the bug-telephone experiment. */

/**
 * Review policy under test (Lattice gate configuration):
 *   serial      — each reviewer sees the upstream PASS trail; rubber-stamp bias applies.
 *   independent — blind review; reviewers never learn prior verdicts (rubberStamp = 0).
 */
export type Policy = 'serial' | 'independent';

export interface TrialConfig {
  /** Number of reviewers in the chain. */
  chainLen: number;
  /** How well-hidden the bug is, 0 = glaring .. 1 = near-invisible. */
  subtlety: number;
  /** Gate policy. */
  policy: Policy;
  /** Base catch probability for an average reviewer on an average bug. */
  baseCatch: number;
  /** Mean reviewer competence (per-reviewer competence is drawn around this). */
  meanCompetence: number;
  /** Spread of per-reviewer competence draw. */
  competenceSpread: number;
  /** How fast effective attention decays with chain position (0 = no fatigue). */
  fatigue: number;
  /** How much each upstream PASS erodes this reviewer's scrutiny (serial only). */
  rubberStamp: number;
}

/** One reviewer's verdict on the diff. */
export interface ReviewStep {
  pos: number;
  competence: number;
  /** Effective attention after fatigue. */
  attention: number;
  /** Complacency multiplier from the upstream PASS trail (1 = fully vigilant). */
  complacency: number;
  pCatch: number;
  caught: boolean;
}

export interface TrialResult {
  /** Depth the bug reached: index of the catcher, or chainLen if it shipped. */
  survivalDepth: number;
  /** True if it walked the whole chain untouched. */
  shipped: boolean;
  /** How many reviewers actually ran before the chain stopped. */
  reviewsUsed: number;
  steps: ReviewStep[];
}

/** Optional hook so the harness can trace each review step through the core bus. */
export type EmitReview = (step: ReviewStep) => void;
