export type Arm = 'resolution-only-control' | 'atomic-start-fixture' | 'aegis-wrapped';
export type StartStatus = 'execute' | 'blocked' | 'indeterminate';
export type ScenarioId =
  | 'single-resume-start'
  | 'two-host-concurrent-resume'
  | 'stale-original-after-resume'
  | 'duplicate-start-same-host'
  | 'invalid-snapshot-before-start'
  | 'start-store-unavailable'
  | 'already-committed-at-resume';

export interface ScenarioResult {
  scenarioId: ScenarioId;
  executions: number;
  expectedExecutions: number;
  finalStatus: StartStatus;
  expectedStatus: StartStatus;
  duplicateEffect: boolean;
  unauthorizedStart: boolean;
  indeterminateStartExecution: boolean;
  legitimateStartBlock: boolean;
  correct: boolean;
  apiAvailable: boolean;
  askCovered: boolean;
  consumeCovered: boolean;
  idempotentStartSafe: boolean;
}
