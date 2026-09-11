export type Arm = 'started-only-control' | 'bound-failure-fixture' | 'aegis-wrapped';
export type ScenarioId =
  | 'valid-verified-failure'
  | 'duplicate-valid-failure'
  | 'wrong-permit-failure'
  | 'wrong-approval-failure'
  | 'wrong-operation-failure'
  | 'unverified-failure'
  | 'missing-failure-digest'
  | 'failure-after-committed-success'
  | 'conflicting-failure-receipt'
  | 'failure-store-unavailable';
export type FailureStatus = 'failed' | 'blocked' | 'indeterminate';
export interface ScenarioResult {
  scenarioId: ScenarioId;
  status: FailureStatus;
  expectedStatus: FailureStatus;
  missedKnownFailure: boolean;
  falseFailure: boolean;
  misboundFailure: boolean;
  unverifiedFailure: boolean;
  committedDowngrade: boolean;
  indeterminateFailureExecution: boolean;
  correct: boolean;
  apiAvailable: boolean;
  askCovered: boolean;
  consumeCovered: boolean;
  idempotentFailureSafe: boolean;
  terminalMonotonicitySafe: boolean;
}
