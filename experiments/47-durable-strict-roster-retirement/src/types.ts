export type Arm = 'delete-on-terminal-control' | 'retirement-tombstone-fixture' | 'aegis-wrapped';

export type ScenarioId =
  | 'retire-committed-exact'
  | 'retire-failed-exact'
  | 'retire-idempotent-exact'
  | 'late-resolve-committed-retired'
  | 'late-resolve-failed-retired'
  | 'late-begin-after-retirement'
  | 'reselection-after-retirement'
  | 'retire-before-terminal'
  | 'retire-wrong-outcome'
  | 'retire-wrong-receipt-digest'
  | 'retire-other-operation'
  | 'retire-other-permit'
  | 'retirement-malformed'
  | 'retirement-store-unavailable'
  | 'retirement-tombstone-lost'
  | 'unrelated-active-operation';

export type LifecycleStatus = 'active' | 'retired';
export type ActionStatus = 'retired' | 'active' | 'blocked' | 'indeterminate';

export interface ScenarioResult {
  scenarioId: ScenarioId;
  status: ActionStatus;
  reason: string;
  retryable: boolean;
  expectedStatus: ActionStatus;
  expectedReason: string;
  expectedRetryable: boolean;
  correct: boolean;
  retirementFailureDetected: boolean;
  retiredAuthorityRestored: boolean;
  apiAvailable: boolean;
}
