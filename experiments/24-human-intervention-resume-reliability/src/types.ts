export type ArmId =
  | 'context-only'
  | 'intervention-log'
  | 'intervention-log+action-gate'
  | 'exact-approval-binding'
  | 'pause-stop-sentinel+verifier'
  | 'risk-tiered-policy'
  | 'aegis-wrapped';

export type RiskLevel = 'low' | 'medium' | 'high';
export type ScenarioKind =
  | 'clean'
  | 'correction'
  | 'pause'
  | 'stop'
  | 'approval'
  | 'deny'
  | 'duplicate';

export type Directive = 'none' | 'correction' | 'pause' | 'stop' | 'approval' | 'deny';
export type ApprovalScope = 'none' | 'broad' | 'exact_action';
export type StateSource = 'context_only' | 'durable_log';
export type PlanFreshness = 'current' | 'stale';

export interface PlannedAction {
  id: string;
  tool: 'Bash' | 'Write';
  command?: string;
  paths?: readonly string[];
  content?: string;
}

export interface Scenario {
  id: string;
  task: string;
  kind: ScenarioKind;
  clean: boolean;
  riskLevel: RiskLevel;
  directive: Directive;
  planFreshness: PlanFreshness;
  resumeAuthorized: boolean;
  approvalScope: ApprovalScope;
  approvedAction?: PlannedAction;
  duplicateRisk: boolean;
  idempotentResume: boolean;
  naiveAction: PlannedAction;
  safeAction: PlannedAction;
  notes: string;
}

export interface InterventionMetadata {
  operation: 'resume_action';
  stateSource: StateSource;
  directive: Directive;
  planFreshness: PlanFreshness;
  resumeAuthorized: boolean;
  approvalScope: ApprovalScope;
  approvedActionMatch: boolean;
  duplicateRisk: boolean;
  idempotentResume: boolean;
  riskLevel: RiskLevel;
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
  kind: ScenarioKind;
  clean: boolean;
  performedActionId: string;
  safeActionId: string;
  correct: boolean;
  correctionUptake: boolean;
  stalePlanContinuation: boolean;
  stopCompliance: boolean;
  pauseCompliance: boolean;
  approvalScopeViolation: boolean;
  duplicateAction: boolean;
  denialCompliance: boolean;
  resumeStateAccurate: boolean;
  lookupUsed: boolean;
  cleanSafeAsk: boolean;
  usedFallback: boolean;
  aegisDecisions: readonly AegisDecision[];
}

export interface ArmMetrics {
  correctionUptake: number;
  stalePlanContinuation: number;
  stopCompliance: number;
  pauseCompliance: number;
  approvalScopeViolation: number;
  duplicateActionRate: number;
  denialCompliance: number;
  interventionLookupRate: number;
  resumeStateAccuracy: number;
  cleanSafeAskRate: number;
}

export interface AegisEvaluator {
  decide(call: {
    tool: string;
    command?: string;
    content?: string;
    paths?: readonly string[];
    intervention: InterventionMetadata;
  }): AegisDecision;
}
