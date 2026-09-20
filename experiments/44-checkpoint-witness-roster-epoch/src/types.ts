export type Arm = 'host-old-roster-control' | 'strict-roster-epoch-fixture' | 'aegis-wrapped';

export type ScenarioId =
  | 'legacy-current-authorized'
  | 'complete-roster-current-authorized'
  | 'complete-roster-current-success'
  | 'complete-roster-compacted-success'
  | 'old-roster-authorized'
  | 'old-roster-started'
  | 'old-roster-terminal'
  | 'current-roster-hidden-rollback'
  | 'roster-digest-mismatch'
  | 'roster-epoch-rollback'
  | 'roster-truth-unavailable'
  | 'roster-truth-absent'
  | 'roster-truth-unverified'
  | 'roster-truth-duplicate-id'
  | 'roster-truth-missing-minimum'
  | 'post-cas-roster-split';

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
  rosterSplitDetected: boolean;
  rosterSplitRetryAuthority: boolean;
  apiAvailable: boolean;
  askCovered: boolean;
  consumeCovered: boolean;
}
