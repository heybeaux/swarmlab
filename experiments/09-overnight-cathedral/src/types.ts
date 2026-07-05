/** Shared contracts for the overnight-cathedral (long-horizon iterative build) experiment. */

export interface TrialConfig {
  /** Number of required features in the fixed spec (target = all met). */
  specSize: number;
  /** How many builder agents rotate around the ring (agent i mod builders owns step i). */
  builders: number;
  /** Horizon: number of build+review steps in the chain. */
  iterations: number;
  /** Per-step probability a build lays a new stone (flips an unmet requirement to met). */
  pProgress: number;
  /** Base per-step probability a build silently breaks an already-met requirement. */
  pRegress: number;
  /** Base per-step probability a build adds an out-of-spec feature nobody asked for. */
  pDrift: number;
  /** How much the regress/drift hazards grow with horizon depth (0 = flat). */
  fatigue: number;
  /** Reviewer competence: probability the next agent reverts a regression (0 = no review). */
  reviewSkill: number;
  /** Multiplier on reviewSkill for spotting drift (drift is stealthier than regression). */
  driftVisibility: number;
  /** Size of the out-of-spec tail region where drift bits can land. */
  driftCapacity: number;
  /** How often (in steps) to emit a snapshot on the exhibition trial. */
  snapshotEvery: number;
}

/** One build step on the exhibition trial. */
export interface CommitStep {
  step: number;
  builder: string;
  /** True if this commit newly met a requirement. */
  built: boolean;
  /** True if this commit silently regressed an already-met requirement. */
  regressed: boolean;
  /** True if this commit added an out-of-spec drift bit. */
  drifted: boolean;
  /** Fraction of the spec met after the commit (pre-review). */
  quality: number;
  /** Count of out-of-spec bits set after the commit (pre-review). */
  drift: number;
}

/** The next agent's review of a commit (exhibition trial). */
export interface ReviewStep {
  step: number;
  reviewer: string;
  /** True if the reviewer caught & reverted this step's regression. */
  caughtRegression: boolean;
  /** True if the reviewer caught & reverted this step's drift bit. */
  caughtDrift: boolean;
  /** Fraction of the spec met after review. */
  quality: number;
  /** Count of out-of-spec bits set after review. */
  drift: number;
}

/** Periodic quality/drift checkpoint on the exhibition trial. */
export interface Snapshot {
  step: number;
  quality: number;
  drift: number;
}

export interface TrialResult {
  /** Fraction of the spec met at the end of the horizon. */
  finalQuality: number;
  /** Count of out-of-spec bits at the end of the horizon. */
  finalDrift: number;
  /** Best quality ever reached during the build. */
  peakQuality: number;
  /** peakQuality − finalQuality: built work that rotted after its peak. */
  qualityDecay: number;
  /** Regressions attempted per step (before review). */
  regressionRate: number;
  /** Fraction of attempted regressions the review link reverted. */
  reviewCatchRate: number;
  /** Per-snapshot quality trace. */
  qualityByStep: number[];
}

/** Optional hooks so the harness can trace each commit/review through the core bus. */
export type EmitCommit = (step: CommitStep) => void;
export type EmitReview = (step: ReviewStep) => void;
export type EmitSnapshot = (snap: Snapshot) => void;
