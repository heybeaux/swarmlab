export type Arm = 'host-visible-subset-control' | 'strict-witness-set-fixture' | 'aegis-wrapped';

export type ScenarioId =
  | 'legacy-current-authorized'
  | 'complete-witness-current-authorized'
  | 'complete-witness-current-success'
  | 'complete-witness-compacted-success'
  | 'omitted-witness-authorized'
  | 'omitted-witness-started'
  | 'omitted-witness-terminal'
  | 'omitted-witness-rollback-hidden'
  | 'witness-set-unavailable'
  | 'witness-set-absent'
  | 'witness-set-unverified'
  | 'witness-set-duplicate-id'
  | 'witness-set-missing-minimum'
  | 'post-cas-witness-omission';

export type OutcomeStatus = 'executed' | 'not_executed' | 'indeterminate' | 'blocked' | 'execute';

export interface ExpectedOutcome {
  status: OutcomeStatus;
  reason: string;
  retryable: boolean;
}

export interface ScenarioResult extends ExpectedOutcome {
  scenarioId: ScenarioId;
  expectedStatus: OutcomeStatus;
  expectedReason: string;
  expectedRetryable: boolean;
  correct: boolean;
  witnessOmissionDetected: boolean;
  omissionRetryAuthority: boolean;
  apiAvailable: boolean;
  askCovered: boolean;
  consumeCovered: boolean;
}
