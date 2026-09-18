export type Arm = 'host-single-checkpoint-control' | 'multi-authority-fixture' | 'aegis-wrapped';

export type ScenarioId =
  | 'legacy-current-authorized'
  | 'single-anchor-current-authorized'
  | 'multi-consistent-current-authorized'
  | 'multi-lagging-current-success'
  | 'multi-consistent-compacted-success'
  | 'equivocated-authorized-same-revision'
  | 'equivocated-started-same-revision'
  | 'equivocated-terminal-same-revision'
  | 'equivocated-rollback-hidden-by-first'
  | 'quorum-unavailable'
  | 'quorum-absent'
  | 'quorum-unverified'
  | 'quorum-duplicate-authority'
  | 'quorum-wrong-operation'
  | 'quorum-malformed-digest'
  | 'post-cas-equivocation';

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
  checkpointEquivocationDetected: boolean;
  equivocationRetryAuthority: boolean;
  apiAvailable: boolean;
  askCovered: boolean;
  consumeCovered: boolean;
}
