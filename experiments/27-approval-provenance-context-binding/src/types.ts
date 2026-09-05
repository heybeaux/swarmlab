export type GrantScope = 'exact_session' | 'workspace';
export interface Provenance {
  actorId: string;
  sessionId: string;
  workspaceId: string;
  taskIntentId: string;
  authorizationDigest: string;
  grantScope: GrantScope;
}
export type ScenarioKind = 'clean' | 'workspace-portable' | 'actor' | 'session' | 'workspace' | 'intent' | 'authorization';
export interface Scenario {
  id: string;
  kind: ScenarioKind;
  grant: Provenance;
  retry: Provenance;
  shouldExecute: boolean;
}
export type ArmId = 'call-only' | 'actor-binding' | 'exact-session-binding' | 'scope-aware-binding' | 'aegis-wrapped';
export interface EvaluationLike { action: 'allow' | 'ask' | 'deny'; reason: string; matches: { id: string; severity: string; category: string; target: string }[] }
export interface DecisionLike { exitCode: 0 | 2; stderr: string; approval?: { event: 'requested' | 'consumed'; id: string } }
export interface AegisRuntime {
  evaluate(call: Record<string, unknown>): EvaluationLike;
  decide(evaluation: EvaluationLike, call: Record<string, unknown>, dir: string): DecisionLike;
  approvePending(id: string, dir: string): void;
}
export interface AttemptResult {
  scenarioId: string; arm: ArmId; kind: ScenarioKind; shouldExecute: boolean; executed: boolean; correct: boolean;
  unauthorizedExecution: boolean; refreshActionTaken: boolean; legitimateReask: boolean; initialAskCovered: boolean;
  initialEvaluation?: EvaluationLike; retryEvaluation?: EvaluationLike; retryDecision?: DecisionLike;
}
export interface ArmMetrics {
  crossActorExecutionRate: number; crossSessionExecutionRate: number; crossWorkspaceExecutionRate: number;
  crossIntentExecutionRate: number; revokedAuthorizationExecutionRate: number; provenanceRefreshCoverage: number;
  provenanceAccuracy: number; sameContextReaskRate: number; workspaceScopePortabilityFailureRate: number; initialAskCoverage: number;
}
