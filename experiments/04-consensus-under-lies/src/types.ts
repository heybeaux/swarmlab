/** Shared contracts for the consensus-under-lies experiment. */

export type Policy = 'naive' | 'vigilant';
export type LiarStrategy = 'brazen' | 'sneaky';

export interface TrialConfig {
  /** Total deliberators (honest + liars). */
  nAgents: number;
  /** How many are secretly instructed to argue for the lie. */
  nLiars: number;
  /** Honest agents' belief-update rule. */
  policy: Policy;
  /** How the liars present themselves. */
  liarStrategy: LiarStrategy;
  /** The answer space. */
  answers: readonly string[];
  /** Ground truth (known to the scorer, never to the agents). */
  truth: string;
  /** The coordinated wrong answer all liars push. */
  lie: string;
  /** Probability an honest agent's private evidence points at the truth. */
  pEvidence: number;
  /** Hard cap on deliberation rounds. */
  maxRounds: number;
  /** Weight re-added to an honest agent's own evidence each round. */
  evidenceAnchor: number;
}

/** One public utterance on the bus: an agent's stated position + confidence. */
export interface Statement {
  round: number;
  agent: string;
  position: string;
  confidence: number;
}

export interface TrialResult {
  /** Majority answer at the end, or null if no strict majority. */
  consensus: string | null;
  truthWon: boolean;
  lieWon: boolean;
  rounds: number;
  /** Honest agents whose FINAL position is the lie (they got dragged). */
  honestOnLie: number;
  honestOnTruth: number;
  /** Mean trust honest agents assign to liars at the end (1.0 under naive). */
  meanLiarTrust: number;
  finalPositions: Record<string, string>;
  statements: Statement[];
}

/** Optional hook so the harness can trace every statement through the core bus. */
export type EmitStatement = (s: Statement) => void;
