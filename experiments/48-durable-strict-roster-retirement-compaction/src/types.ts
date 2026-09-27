export type Arm = 'delete-retirement-control' | 'authenticated-checkpoint-fixture' | 'aegis-wrapped';

export type ScenarioId =
  | 'compact-committed-exact'
  | 'compact-failed-exact'
  | 'compact-idempotent-exact'
  | 'late-resolve-committed-compacted'
  | 'late-resolve-failed-compacted'
  | 'late-begin-after-compaction'
  | 'reselection-after-compaction'
  | 'compact-before-retirement'
  | 'compact-wrong-operation'
  | 'compact-wrong-permit'
  | 'compact-wrong-outcome'
  | 'compact-wrong-receipt-digest'
  | 'compact-wrong-terminal-revision'
  | 'compaction-unverified'
  | 'compaction-malformed'
  | 'compaction-store-unavailable'
  | 'compaction-checkpoint-lost'
  | 'unrelated-retirement-still-classified';

export type LifecycleStatus = 'active' | 'retired' | 'retirement_compacted';
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
  compactionFailureDetected: boolean;
  compactedAuthorityRestored: boolean;
  apiAvailable: boolean;
}
