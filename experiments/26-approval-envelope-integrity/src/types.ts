export type ArmId =
  | 'exact-retry-only'
  | 'freshness-window'
  | 'artifact-binding'
  | 'verification-envelope-binding'
  | 'risk-tiered-policy'
  | 'aegis-wrapped';

export type RiskLevel = 'medium' | 'high';
export type ScenarioKind =
  | 'clean'
  | 'expired'
  | 'artifact-drift'
  | 'verification-drift'
  | 'target-drift';
export type ToolName = 'Bash' | 'Write';

export interface PlannedAction {
  id: string;
  tool: ToolName;
  command?: string;
  paths?: readonly string[];
  content?: string;
}

export interface ApprovalEnvelope {
  riskLevel: RiskLevel;
  freshnessWindowMs: number;
  observedAt: string;
  artifactDigest?: string;
  verificationDigest?: string;
  targetDigest?: string;
}

export interface Scenario {
  id: string;
  task: string;
  kind: ScenarioKind;
  clean: boolean;
  naiveAction: PlannedAction;
  safeAction: PlannedAction;
  approvedEnvelope: ApprovalEnvelope;
  retryEnvelope: ApprovalEnvelope;
  notes: string;
}

export interface ApprovalEnvelopeMetadata {
  operation: 'approved_retry';
  riskLevel: RiskLevel;
  freshnessWindowMs: number;
  observedAt: string;
  artifactDigest?: string;
  verificationDigest?: string;
  targetDigest?: string;
}

export interface AegisMatch {
  id: string;
  severity: string;
  category: string;
  target: string;
}

export interface EvaluationLike {
  action: 'allow' | 'ask' | 'deny';
  reason: string;
  matches: AegisMatch[];
}

export interface DecisionLike {
  exitCode: 0 | 2;
  stderr: string;
  approval?: {
    event: 'requested' | 'consumed';
    id: string;
  };
}

export interface AttemptResult {
  scenarioId: string;
  arm: ArmId;
  kind: ScenarioKind;
  clean: boolean;
  performedActionId: string;
  safeActionId: string;
  correct: boolean;
  expiredApprovalExecution: boolean;
  artifactDriftExecution: boolean;
  verificationDriftExecution: boolean;
  targetDriftExecution: boolean;
  refreshActionTaken: boolean;
  cleanFreshRetryAsk: boolean;
  initialAskCovered: boolean;
  usedFallback: boolean;
  initialEvaluation?: EvaluationLike;
  retryEvaluation?: EvaluationLike;
  initialDecision?: DecisionLike;
  retryDecision?: DecisionLike;
}

export interface ArmMetrics {
  expiredApprovalExecutionRate: number;
  artifactDriftExecutionRate: number;
  verificationDriftExecutionRate: number;
  targetDriftExecutionRate: number;
  approvalRefreshCoverage: number;
  approvalEnvelopeAccuracy: number;
  cleanFreshRetryAskRate: number;
  initialAskCoverage: number;
}

export interface AegisRuntime {
  evaluate(call: {
    tool: ToolName;
    command?: string;
    content?: string;
    paths?: readonly string[];
    approvalEnvelope?: ApprovalEnvelopeMetadata;
  }): EvaluationLike;
  decide(
    evaluation: EvaluationLike,
    call: {
      tool: ToolName;
      command?: string;
      content?: string;
      paths?: readonly string[];
      approvalEnvelope?: ApprovalEnvelopeMetadata;
    },
    approvalDir: string,
  ): DecisionLike;
  approvePending(id: string, dir: string): void;
}
