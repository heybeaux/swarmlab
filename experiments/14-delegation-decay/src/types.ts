/** Shared types for exp-14 — delegation decay (Part A) + trust routing (Part B). */

// --- Part A ------------------------------------------------------------------

/** A machine-verifiable requirement over the assembled config artifact. */
export interface UnaryReq {
  kind: 'unary';
  id: string;
  key: string;
  value: number;
}

/**
 * Relational requirement: `config[keyA] === config[keyB] + offset`. The task
 * hands workers a shared parameter P (keyB = P, keyA = P + offset); the
 * ASSERTION checks only the relation, never P itself — so a drifted P that
 * shifts both sides equally still satisfies the requirement. Only *divergent
 * copies* of P (a fork across siblings) can break it. That is the seam.
 */
export interface RelationalReq {
  kind: 'relational';
  id: string;
  keyA: string;
  keyB: string;
  offset: number;
  param: number;
}

export type Requirement = UnaryReq | RelationalReq;

/** How a single requirement fared in the assembled artifact. */
export type ReqOutcome = 'satisfied' | 'dropped' | 'reinterpreted' | 'integration';

export interface DecayTrialResult {
  /** fraction of the 20 requirements satisfied */
  survival: number;
  /** count present-but-wrong (unary value drifted) */
  reinterpreted: number;
  /** count absent (omitted somewhere down the chain) */
  dropped: number;
  /** count of relational requirements broken by divergent sibling copies */
  integration: number;
  /** modeled token cost of the whole tree */
  cost: number;
  /** cost / d=0 baseline cost */
  costAmplification: number;
}

export interface DecayCellConfig {
  depth: number;
  branching: number;
}

// --- Part B ------------------------------------------------------------------

export type Arm = 'amnesiac' | 'incontext' | 'engram';
export type FailStyle = 'loud' | 'confident-wrong';

export interface WorkerProfile {
  id: string;
  blurb: string;
}

export interface RoundRecord {
  round: number;
  chosen: string;
  /** ground truth: did the delegated work pass the harness assertions */
  success: boolean;
  /** decision round at which the root can first SEE this outcome */
  visibleAtRound: number;
  /** which assertion failed (provenance payload for the capability observation) */
  failedAssertion?: string;
  tokens: number;
}

export interface TrustTrialResult {
  /** chosen worker per round, 1-indexed by round */
  selections: string[];
  /** true where the incapable agent was chosen, per round */
  incapableChosen: boolean[];
  /** cumulative tokens wasted on delegations to the incapable agent, per round */
  wastedCum: number[];
  totalTokens: number;
  /** did the round-16 (post-reset) choice hit the incapable agent */
  postResetIncapable: boolean;
  /** transfer probe: brand-new root's single choice avoided the incapable agent */
  transferAvoided: boolean;
  /** whether the store/transcript actually held an observation about the incapable agent at transfer time */
  transferHadEvidence: boolean;
  /** engram arm only: reconcile() outcome counts, proving the real module ran */
  reconcileOutcomes?: Record<string, number>;
  /** capable workers permanently excluded on a transient failure (honesty stat) */
  capableExcluded: number;
}
