export type ScenarioId = 'normal-commit'|'precommit-failure-retry'|'postcommit-timeout-reconcile'|'postcommit-timeout-cross-host-retry'|'status-unavailable'|'invalid-snapshot-postcommit'|'duplicate-reconcile';
export type Arm = 'boolean-control'|'reconciling-fixture'|'aegis-wrapped';
export type Outcome = 'execute'|'blocked'|'indeterminate';
export interface ScenarioResult { scenarioId: ScenarioId; executions: number; expectedExecutions: number; outcome: Outcome; expectedOutcome: Outcome; committedTake: boolean; committedOrphan: boolean; ambiguityMisclassified: boolean; unsafeDuplicate: boolean; indeterminateExecution: boolean; legitimateBlock: boolean; correct: boolean; apiAvailable: boolean; askCovered: boolean; consumeCovered: boolean; idempotentReplaySafe: boolean }
