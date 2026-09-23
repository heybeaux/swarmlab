export type Arm = 'process-local-fallback-control' | 'durable-policy-fixture' | 'aegis-wrapped';

export type ScenarioId =
  | 'same-process-current-authorized'
  | 'restart-current-roster'
  | 'cross-host-current-roster'
  | 'restart-committed-terminal'
  | 'legacy-generic-control'
  | 'restart-capability-stripped'
  | 'cross-host-roster-unavailable'
  | 'marker-missing-after-prior-selection'
  | 'marker-read-unavailable'
  | 'marker-bound-other-operation'
  | 'marker-bound-other-permit'
  | 'marker-malformed'
  | 'marker-conflicting-preexisting'
  | 'marker-loss-after-begin-cas'
  | 'marker-exact-idempotent-reselection';

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
  durablePolicyFailureDetected: boolean;
  durablePolicyAuthorityRestored: boolean;
  apiAvailable: boolean;
  askCovered: boolean;
  consumeCovered: boolean;
}
