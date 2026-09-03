export type ArmId =
  | 'context-only'
  | 'durable-progress-log'
  | 'completed-revoked-gate'
  | 'exact-step-binding'
  | 'exact-step-instance-binding'
  | 'risk-tiered-policy'
  | 'aegis-wrapped';

export type RiskLevel = 'low' | 'medium' | 'high';
export type ScenarioKind =
  | 'clean'
  | 'completed-replay'
  | 'revoked'
  | 'wrong-instance'
  | 'wrong-step';

export type WorkflowState = 'clean' | 'partial_success';
export type StepStatus = 'remaining' | 'completed' | 'revoked' | 'unknown';
export type ApprovalBinding = 'task' | 'step' | 'step_instance';

export interface PlannedAction {
  id: string;
  tool: 'Bash' | 'Write';
  stepName: string;
  stepInstance: string;
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
  workflowState: WorkflowState;
  proposedStepStatus: StepStatus;
  approvalBinding: ApprovalBinding;
  bindingMatch: boolean;
  remainingStepVerified: boolean;
  naiveAction: PlannedAction;
  safeAction: PlannedAction;
  notes: string;
}

export interface WorkflowResumeMetadata {
  operation: 'resume_workflow_step';
  workflowState: WorkflowState;
  stepStatus: StepStatus;
  approvalBinding: ApprovalBinding;
  bindingMatch: boolean;
  remainingStepVerified: boolean;
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
  completedStepReplay: boolean;
  revokedStepExecution: boolean;
  wrongStepInstance: boolean;
  remainingStepCovered: boolean;
  workflowStateAccurate: boolean;
  lookupUsed: boolean;
  cleanSafeAsk: boolean;
  usedFallback: boolean;
  aegisDecisions: readonly AegisDecision[];
}

export interface ArmMetrics {
  completedStepReplayRate: number;
  revokedStepExecutionRate: number;
  wrongStepInstanceRate: number;
  remainingStepCoverage: number;
  workflowStateAccuracy: number;
  stepLookupRate: number;
  cleanSafeAskRate: number;
}

export interface AegisEvaluator {
  decide(call: {
    tool: string;
    command?: string;
    content?: string;
    paths?: readonly string[];
    workflowResume: WorkflowResumeMetadata;
  }): AegisDecision;
}
