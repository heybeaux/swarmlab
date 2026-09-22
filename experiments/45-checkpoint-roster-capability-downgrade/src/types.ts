export type Arm = 'host-capability-fallback-control' | 'strict-roster-continuity-fixture' | 'aegis-wrapped';

export type ScenarioId =
  | 'strict-current-authorized'
  | 'strict-current-committed'
  | 'strict-current-compacted-terminal'
  | 'legacy-generic-witness-set-authorized'
  | 'roster-temporarily-unavailable'
  | 'roster-capability-absent'
  | 'capability-stripped-after-unavailable-read'
  | 'capability-stripped-after-prior-current-read'
  | 'malformed-roster-on-retry'
  | 'capability-stripped-before-begin'
  | 'capability-stripped-after-prior-current-read-before-begin'
  | 'roster-unavailable-before-begin'
  | 'post-cas-capability-loss'
  | 'unavailable-then-same-current-restored'
  | 'prior-current-then-same-current-retained';

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
  capabilityDowngradeDetected: boolean;
  downgradeAuthorityRestored: boolean;
  apiAvailable: boolean;
  askCovered: boolean;
  consumeCovered: boolean;
}
