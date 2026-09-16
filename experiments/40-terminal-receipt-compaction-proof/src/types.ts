export type Arm = 'record-only-control' | 'compaction-proof-fixture' | 'aegis-wrapped';
export type ScenarioId =
  | 'unpruned-success' | 'unpruned-failure'
  | 'pruned-success-valid-proof' | 'pruned-failure-valid-proof'
  | 'pruned-proof-missing' | 'pruned-proof-unverified' | 'pruned-proof-malformed'
  | 'pruned-proof-wrong-operation' | 'pruned-proof-wrong-permit' | 'pruned-proof-wrong-approval'
  | 'pruned-proof-wrong-outcome' | 'pruned-proof-wrong-receipt-digest'
  | 'pruned-proof-stale-revision' | 'pruned-proof-future-revision'
  | 'pruned-proof-read-unavailable' | 'stale-authorized-plus-valid-terminal-proof'
  | 'pruned-nonterminal-high-water';
export interface ExpectedResult { status: string; reason: string; retryable: boolean }
export interface ScenarioResult extends ExpectedResult {
  scenarioId: ScenarioId;
  expectedStatus: string;
  expectedReason: string;
  expectedRetryable: boolean;
  correct: boolean;
  acceptedInvalidProof: boolean;
  staleRetryAuthority: boolean;
  recoveredTerminalProof: boolean;
  apiAvailable: boolean;
  askCovered: boolean;
  consumeCovered: boolean;
}
