export type ArmId =
  | 'no-coordination'
  | 'file-locks'
  | 'task-leases'
  | 'merge-queue'
  | 'merge-queue+reviewer'
  | 'shared-intent-ledger'
  | 'aegis-wrapped';

export type OverlapClass =
  | 'none'
  | 'text_conflict'
  | 'api_drift'
  | 'duplicate_intent'
  | 'shared_invariant';

export type BranchFreshness = 'current' | 'stale';
export type VerificationCoverage = 'none' | 'visible' | 'semantic';
export type PlanKind = 'naive' | 'refreshed' | 'reviewed';

export interface FilePatch {
  path: string;
  before?: string;
  after: string;
}

export interface TaskPlan {
  mode: 'apply' | 'skip';
  summary: string;
  patches: readonly FilePatch[];
}

export interface TaskSpec {
  id: string;
  intentId: string;
  label: string;
  invariantTags: readonly string[];
  naive: TaskPlan;
  refreshed?: TaskPlan;
  reviewed?: TaskPlan;
}

export interface RepoState {
  files: Record<string, string>;
  landedTasks: string[];
  landedIntents: string[];
  unresolvedConflict: boolean;
}

export interface ValidationResult {
  visibleBuildPass: boolean;
  hiddenInvariantPass: boolean;
  duplicateIntent: boolean;
  summary: string;
}

export interface Scenario {
  id: string;
  task: string;
  overlapClass: OverlapClass;
  branchFreshness: BranchFreshness;
  verificationCoverageAtRisk: VerificationCoverage;
  clean: boolean;
  baseFiles: Record<string, string>;
  first: TaskSpec;
  second: TaskSpec;
  notes: string;
  validate(state: RepoState): ValidationResult;
}

export interface CoordinationMetadata {
  operation: 'merge';
  branchFreshness: BranchFreshness;
  overlapClass: OverlapClass;
  fileLockPresent: boolean;
  taskLeasePresent: boolean;
  intentLedgerPresent: boolean;
  mergeQueuePresent: boolean;
  semanticReviewPresent: boolean;
  verificationCoverage: VerificationCoverage;
}

export interface AegisMatch {
  id: string;
  severity: string;
  category: string;
  target: string;
}

export interface AegisDecision {
  action: 'allow' | 'ask' | 'deny';
  reason: string;
  matches: AegisMatch[];
}

export interface AttemptResult {
  scenarioId: string;
  arm: ArmId;
  buildBroken: boolean;
  semanticRegression: boolean;
  duplicateWork: boolean;
  staleAssumption: boolean;
  textConflict: boolean;
  coordinationRecovered: boolean;
  cleanSafeAsk: boolean;
  idleCost: number;
  recoverySteps: number;
  firstPlanKind: PlanKind;
  secondPlanKind: PlanKind;
  usedFallback: boolean;
  landedTasks: readonly string[];
  landedIntents: readonly string[];
  finalFiles: Record<string, string>;
  aegisDecisions: readonly AegisDecision[];
  validatorSummary: string;
}

export interface ArmMetrics {
  buildBreakRate: number;
  semanticRegressionRate: number;
  duplicateWorkRate: number;
  staleAssumptionRate: number;
  cleanSafeAskRate: number;
  textConflictRate: number;
  coordinationRecoveryRate: number;
  idleCost: number;
  recoverySteps: number;
}

export interface AegisEvaluator {
  decide(call: {
    tool: string;
    coordination: CoordinationMetadata;
  }): AegisDecision;
}
