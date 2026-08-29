export type ArmId =
  | 'raw-context'
  | 'summary-only'
  | 'retrieval-no-citation'
  | 'structured-ledger'
  | 'aegis-wrapped';

export type ClaimKind =
  | 'exact_path'
  | 'exact_command'
  | 'exact_identifier'
  | 'negative_constraint'
  | 'private_fact'
  | 'exact_date'
  | 'high_level_summary'
  | 'rejected_option';

export type EvidenceSource = 'raw_context' | 'summary_only' | 'retrieved_evidence' | 'fact_ledger';
export type MemoryScope = 'public' | 'shared' | 'private';
export type ResponseMode = 'answer' | 'refuse';

export interface Proposal {
  mode: ResponseMode;
  answer: string;
  citation?: string;
  source: EvidenceSource;
  sourceScope: MemoryScope;
  latestEvidence: boolean;
  searchPerformed: boolean;
  citationsPresent: boolean;
}

export interface RetrievalCandidate {
  answer: string;
  citation: string;
  scope: MemoryScope;
  freshness: 'latest' | 'stale';
}

export interface LedgerEntry {
  answer: string;
  citation: string;
  scope: MemoryScope;
}

export interface Scenario {
  id: string;
  query: string;
  claimKind: ClaimKind;
  targetScope: MemoryScope;
  exactClaim: boolean;
  safeSummary: boolean;
  expected: Proposal;
  rawContextProposal: Proposal;
  summaryProposal: Proposal;
  retrievalCandidates: readonly RetrievalCandidate[];
  ledgerEntry?: LedgerEntry;
  staleAnswers: readonly string[];
  notes: string;
}

export interface AegisMatch {
  id: string;
  severity: string;
  category: string;
  target: string;
}

export interface AegisDecision {
  action: 'allow' | 'ask' | 'deny';
  reason: string;
  matches: AegisMatch[];
}

export interface AttemptResult {
  scenarioId: string;
  arm: ArmId;
  mode: ResponseMode;
  answer: string;
  correct: boolean;
  staleFactUsed: boolean;
  privacyLeak: boolean;
  searchPerformed: boolean;
  citationsPresent: boolean;
  latestEvidence: boolean;
  source: EvidenceSource;
  sourceScope: MemoryScope;
  citation?: string;
  hallucinatedMemory: boolean;
  citationSufficient: boolean;
  resumeTaskSuccess: boolean;
  aegisDecisions: readonly AegisDecision[];
}

export interface ArmMetrics {
  exactRecallRate: number;
  negativeConstraintRecall: number;
  staleFactUseRate: number;
  privacyLeakRate: number;
  searchBeforeExactClaimRate: number;
  hallucinatedMemoryRate: number;
  citationSufficiency: number;
  resumeTaskSuccessRate: number;
  safeSummaryAskRate: number;
}

export interface AegisEvaluator {
  decide(call: {
    tool: string;
    recall: {
      claimKind: ClaimKind;
      source: EvidenceSource;
      exactClaim: boolean;
      citationsPresent: boolean;
      latestEvidence: boolean;
      sourceScope: MemoryScope;
      targetScope: MemoryScope;
      responseMode: ResponseMode;
    };
  }): AegisDecision;
}
