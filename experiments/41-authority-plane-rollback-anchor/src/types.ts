export type Arm = 'host-authority-control' | 'transparency-anchor-fixture' | 'aegis-wrapped';
export type ScenarioId =
  | 'legacy-current-authorized' | 'anchored-current-authorized' | 'anchored-current-success'
  | 'anchored-current-compacted-success' | 'anchor-lags-current-success'
  | 'restore-authorized-below-anchor' | 'restore-started-below-anchor'
  | 'restore-missing-below-anchor' | 'restore-stale-proof-below-anchor'
  | 'checkpoint-unavailable' | 'checkpoint-absent' | 'checkpoint-unverified'
  | 'checkpoint-malformed-revision' | 'checkpoint-wrong-operation' | 'checkpoint-extra-property'
  | 'host-revision-unavailable-with-anchor' | 'post-cas-authority-rollback';
export type OutcomeStatus = 'executed' | 'not_executed' | 'indeterminate' | 'blocked' | 'execute';
export interface ExpectedOutcome { status: OutcomeStatus; reason: string; retryable: boolean }
export interface ScenarioResult extends ExpectedOutcome {
  scenarioId: ScenarioId; expectedStatus: OutcomeStatus; expectedReason: string; expectedRetryable: boolean;
  correct: boolean; authorityRollbackDetected: boolean; rollbackRetryAuthority: boolean; apiAvailable: boolean;
  askCovered: boolean; consumeCovered: boolean;
}
