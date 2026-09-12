export type Arm = 'exception-only-control' | 'receipt-readback-fixture' | 'aegis-wrapped';
export type ScenarioId =
  | 'success-postcommit-ack-loss' | 'failure-postcommit-ack-loss'
  | 'success-precommit-failure' | 'failure-precommit-failure'
  | 'success-postcommit-status-unavailable' | 'failure-postcommit-status-unavailable'
  | 'success-conflicting-terminal-readback' | 'failure-conflicting-terminal-readback'
  | 'success-exact-retry-after-ack-loss' | 'failure-exact-retry-after-ack-loss';
export type TerminalStatus = 'executed' | 'failed' | 'blocked' | 'indeterminate';
export interface ScenarioResult {
  scenarioId: ScenarioId;
  status: TerminalStatus;
  expectedStatus: TerminalStatus;
  reason?: string;
  committedReceiptOrphan: boolean;
  terminalMisclassification: boolean;
  conflictingReceiptAcceptance: boolean;
  precommitFalseTerminal: boolean;
  correct: boolean;
  apiAvailable: boolean;
  askCovered: boolean;
  consumeCovered: boolean;
  idempotentSafe: boolean;
  terminalMonotonicitySafe: boolean;
  unavailableReadFailClosedSafe: boolean;
}
