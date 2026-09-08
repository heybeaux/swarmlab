export type ScenarioKind =
  | 'stable-root'
  | 'stable-direct'
  | 'stable-bounded'
  | 'authorization-rotation'
  | 'direct-revocation'
  | 'intermediate-revocation'
  | 'consumer-drift'
  | 'authority-expansion'
  | 'missing-checkpoint'
  | 'permit-replay';

export interface Provenance {
  actorId: string;
  sessionId: string;
  workspaceId: string;
  taskIntentId: string;
  authorizationDigest: string;
  grantScope: 'exact_session' | 'workspace';
}
export interface ChainLink { actorId: string; verified: boolean; authorityLevel: number; revoked?: boolean }
export interface Delegation {
  effectiveConsumerId: string;
  declaredScope: 'none' | 'direct' | 'bounded';
  maxDepth: number;
  links: ChainLink[];
  revoked: boolean;
  revocationChecked: boolean;
  structurallyValid: boolean;
}
export interface AuthoritySnapshot { provenance: Provenance; delegation: Delegation }
export interface Scenario {
  id: string;
  kind: ScenarioKind;
  consumed: AuthoritySnapshot;
  current?: AuthoritySnapshot;
  checkpointPresent: boolean;
  shouldExecute: boolean;
  replayAttempt: boolean;
}
export type ArmId = 'precheck-only' | 'snapshot-only' | 'execution-checkpoint' | 'aegis-wrapped';
export interface EvaluationLike { action: 'allow' | 'ask' | 'deny'; reason: string; matches: { id: string; severity: string; category: string; target: string }[] }
export interface DecisionLike { exitCode: 0 | 2; stderr: string; approval?: { event: 'requested' | 'consumed'; id: string } }
export interface PermitLike { id: string }
export interface AegisRuntime {
  evaluate(call: Record<string, unknown>): EvaluationLike;
  decide(evaluation: EvaluationLike, call: Record<string, unknown>, dir: string): DecisionLike;
  approvePending(id: string, dir: string): void;
  createExecutionPermit?: (call: Record<string, unknown>, evaluation: EvaluationLike, dir: string) => PermitLike;
  finalizeExecutionPermit?: (permit: PermitLike, current: Record<string, unknown>, dir: string) => boolean;
}
export interface AttemptResult {
  scenarioId: string; kind: ScenarioKind; arm: ArmId; shouldExecute: boolean;
  executed: boolean; replayExecuted: boolean; correct: boolean; unauthorizedExecution: boolean;
  refreshActionTaken: boolean; legitimateBlock: boolean; initialAskCovered: boolean;
  consumeCovered: boolean; checkpointAvailable: boolean;
}
export interface ArmMetrics {
  authorizationRotationExecutionRate: number;
  directRevocationExecutionRate: number;
  intermediateRevocationExecutionRate: number;
  consumerDriftExecutionRate: number;
  authorityExpansionExecutionRate: number;
  missingCheckpointExecutionRate: number;
  permitReplayExecutionRate: number;
  legitimateExecutionBlockRate: number;
  executionRefreshCoverage: number;
  executionAccuracy: number;
  initialAskCoverage: number;
  consumeCoverage: number;
  checkpointAvailability: number;
}
