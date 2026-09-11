export type Arm = 'destructive-control' | 'journaling-fixture' | 'aegis-wrapped';
export type Resolution = 'executed' | 'not_executed' | 'indeterminate';
export type ScenarioId =
  | 'normal-effect-commit'
  | 'crash-after-authorize-before-effect'
  | 'crash-after-effect-before-outcome'
  | 'duplicate-resolve'
  | 'effect-journal-unavailable'
  | 'invalid-snapshot-at-resume'
  | 'cross-host-resume';

export interface ScenarioResult {
  scenarioId: ScenarioId;
  executions: number;
  expectedExecutions: number;
  resolution: Resolution;
  expectedResolution: Resolution;
  authorized: boolean;
  orphanedAuthorization: boolean;
  effectMisclassified: boolean;
  unsafeDuplicateEffect: boolean;
  indeterminateEffectExecution: boolean;
  legitimateResumeBlock: boolean;
  correct: boolean;
  apiAvailable: boolean;
  askCovered: boolean;
  consumeCovered: boolean;
  idempotentResolveSafe: boolean;
}
