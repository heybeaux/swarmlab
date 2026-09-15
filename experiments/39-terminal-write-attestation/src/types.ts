export type Arm = 'return-trusting-control' | 'readback-attestation-fixture' | 'aegis-wrapped';
export type ScenarioId =
  | 'success-committed-exact' | 'success-already-exact' | 'success-committed-no-write'
  | 'success-already-different-receipt' | 'success-committed-nonterminal' | 'success-committed-read-unavailable'
  | 'success-conflict' | 'success-not-started'
  | 'failure-failed-exact' | 'failure-already-exact' | 'failure-failed-no-write'
  | 'failure-already-different-receipt' | 'failure-failed-nonterminal' | 'failure-failed-read-unavailable'
  | 'failure-conflict' | 'failure-not-started';
export interface ExpectedResult { status: string; reason: string }
export interface ScenarioResult extends ExpectedResult {
  scenarioId: ScenarioId; expectedStatus: string; expectedReason: string;
  falsePositiveTerminal: boolean; wrongReceiptAcceptance: boolean; unverifiedPositive: boolean;
  correct: boolean; apiAvailable: boolean; askCovered: boolean; consumeCovered: boolean;
}
