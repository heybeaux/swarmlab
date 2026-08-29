export type ArmId =
  | 'self-report'
  | 'process-receipt'
  | 'tool-output'
  | 'desired-state'
  | 'desired-state+idempotency'
  | 'aegis-wrapped';

export type ActionCategory =
  | 'file_write'
  | 'artifact_build'
  | 'test_run'
  | 'external_write'
  | 'job_schedule'
  | 'issue_update'
  | 'message_send';

export type SignalKind =
  | 'success'
  | 'failure'
  | 'timeout'
  | 'duplicate'
  | 'partial_success'
  | 'accepted';

export type CompletionClaim = 'done' | 'failed' | 'retry';

export type ReceiptClass =
  | 'self_report'
  | 'process'
  | 'tool_output'
  | 'desired_state'
  | 'desired_state_with_idempotency';

export type RetryOutcome = 'none' | 'success' | 'duplicate_created' | 'already_exists' | 'still_failed';

export interface Scenario {
  id: string;
  category: ActionCategory;
  signal: SignalKind;
  exitCode: number;
  desiredStateNow: boolean;
  desiredStateAfterPoll: boolean;
  desiredStateAfterRetry: boolean;
  ambiguousSideEffect: boolean;
  idempotencyKey: boolean;
  retryOutcome: RetryOutcome;
  toolSuggestsSuccess: boolean;
  requiresRecovery: boolean;
  notes: string;
}

export interface ProposedAction {
  claim: CompletionClaim;
  receiptClass: ReceiptClass;
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
  finalStatus: 'done' | 'failed' | 'escalate';
  actualComplete: boolean;
  desiredStateVerified: boolean;
  receiptClass: ReceiptClass;
  usedIdempotency: boolean;
  retries: number;
  verificationOps: number;
  duplicateSideEffect: boolean;
  unnecessaryRetry: boolean;
  receiptSufficient: boolean;
  recovered: boolean;
  aegisDecisions: readonly AegisDecision[];
}

export interface ArmMetrics {
  falseDoneRate: number;
  falseFailureRate: number;
  receiptSufficiency: number;
  unnecessaryRetryRate: number;
  duplicateSideEffectRate: number;
  recoveryRate: number;
  verificationCost: number;
  safeSuccessAskRate: number;
}

export interface AegisEvaluator {
  decide(call: {
    tool: string;
    completion: {
      actionCategory: ActionCategory;
      claim: CompletionClaim;
      receiptClass: ReceiptClass;
      desiredStateVerified: boolean;
      ambiguousSideEffect: boolean;
      idempotencyKeyPresent: boolean;
    };
  }): AegisDecision;
}
