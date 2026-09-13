export type Arm = 'state-only-control' | 'coherence-fixture' | 'aegis-wrapped';
export type ScenarioId =
  | 'coherent-committed-success' | 'coherent-failed-negative'
  | 'clean-authorized' | 'clean-started'
  | 'committed-missing-success-receipt' | 'failed-missing-failure-receipt'
  | 'committed-opposite-failure-receipt' | 'failed-opposite-success-receipt'
  | 'committed-both-receipts' | 'failed-both-receipts'
  | 'committed-malformed-success-receipt' | 'failed-misbound-failure-receipt'
  | 'authorized-with-success-receipt' | 'started-with-failure-receipt';
export type ResolutionStatus = 'executed' | 'not_executed' | 'indeterminate';
export interface ExpectedResolution { status: ResolutionStatus; reason: string; retryable: boolean }
export interface ScenarioResult extends ExpectedResolution {
  scenarioId: ScenarioId;
  expectedStatus: ResolutionStatus;
  expectedReason: string;
  expectedRetryable: boolean;
  falseTerminalCertainty: boolean;
  unsafeRetry: boolean;
  classificationError: boolean;
  correct: boolean;
  apiAvailable: boolean;
  coherentSuccessPreserved: boolean;
  coherentFailurePreserved: boolean;
  cleanRetryPreserved: boolean;
  startedFailClosedSafe: boolean;
  askCovered: boolean;
  consumeCovered: boolean;
}
