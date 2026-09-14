export type Arm = 'replica-trusting-control' | 'monotonic-watermark-fixture' | 'aegis-wrapped';
export type ScenarioId =
  | 'current-authorized-r1' | 'current-started-r2' | 'current-committed-r3' | 'current-failed-r3'
  | 'rollback-authorized-after-committed' | 'rollback-authorized-after-failed'
  | 'rollback-started-after-committed' | 'rollback-burned-after-failed'
  | 'missing-replica-terminal-watermark' | 'versioned-store-missing-record-revision'
  | 'record-revision-ahead-of-watermark' | 'revision-watermark-unavailable'
  | 'post-cas-rollback-after-terminal-race';
export type OutcomeStatus = 'executed' | 'not_executed' | 'indeterminate' | 'blocked' | 'execute';
export interface ExpectedOutcome { status: OutcomeStatus; reason: string; retryable: boolean }
export interface ScenarioResult extends ExpectedOutcome {
  scenarioId: ScenarioId;
  expectedStatus: OutcomeStatus;
  expectedReason: string;
  expectedRetryable: boolean;
  staleRetryAuthority: boolean;
  staleClassificationError: boolean;
  revisionFailureUnsafe: boolean;
  correct: boolean;
  revisionApiAvailable: boolean;
  currentAuthorizedPreserved: boolean;
  currentStartedPreserved: boolean;
  currentCommittedPreserved: boolean;
  currentFailedPreserved: boolean;
  postCasRollbackSafe: boolean;
  askCovered: boolean;
  consumeCovered: boolean;
}
