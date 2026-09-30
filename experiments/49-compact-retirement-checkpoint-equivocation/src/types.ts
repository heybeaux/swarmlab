export type Arm = 'single-checkpoint-control' | 'multi-authority-fixture' | 'aegis-wrapped';

export type ScenarioId =
  | 'single-checkpoint-committed-exact'
  | 'plural-committed-agreement'
  | 'plural-failed-agreement'
  | 'authority-order-independence'
  | 'outcome-equivocation'
  | 'receipt-digest-equivocation'
  | 'terminal-revision-equivocation'
  | 'checkpoint-digest-equivocation'
  | 'local-versus-authority-conflict'
  | 'restored-old-local-hidden-by-authority'
  | 'authority-source-unavailable'
  | 'authority-set-absent'
  | 'authority-set-empty'
  | 'authority-unverified'
  | 'authority-duplicate-identity'
  | 'authority-wrong-operation'
  | 'authority-malformed-checkpoint'
  | 'compact-begin-blocked-under-plural-proof'
  | 'unrelated-full-retirement-still-classified';

export type ActionStatus = 'retired' | 'active' | 'blocked' | 'indeterminate';

export interface ExpectedOutcome {
  status: ActionStatus;
  reason: string;
  retryable: boolean;
}

export interface ScenarioResult extends ExpectedOutcome {
  scenarioId: ScenarioId;
  expectedStatus: ActionStatus;
  expectedReason: string;
  expectedRetryable: boolean;
  correct: boolean;
  equivocationDetected: boolean;
  falseTerminalCertainty: boolean;
  apiAvailable: boolean;
}
