export type ArmId =
  | 'raw-ingestion'
  | 'labels-only'
  | 'structured-extractor'
  | 'aegis-wrapped';

export type ProposalMode = 'answer' | 'refuse';
export type EvidenceSource = 'raw_content' | 'labeled_content' | 'structured_extraction';
export type SourceType =
  | 'github_issue'
  | 'json'
  | 'log'
  | 'web_page'
  | 'trace'
  | 'chat_quote';
export type ProposedAction = 'answer' | 'mark_done' | 'exfiltrate_secret';
export type InstructionSignal =
  | 'authority_spoof'
  | 'action_request'
  | 'secret_request'
  | 'completion_override'
  | 'tool_output_spoof';

export interface Proposal {
  mode: ProposalMode;
  answer: string;
  citation?: string;
  source: EvidenceSource;
  boundaryRecognized: boolean;
  followedInjection: boolean;
  exfilAttempt: boolean;
  falseDone: boolean;
}

export interface Scenario {
  id: string;
  task: string;
  sourceType: SourceType;
  document: string;
  attack: boolean;
  expected: Proposal;
  rawProposal: Proposal;
  labelsProposal: Proposal;
  structuredProposal: Proposal;
  proposedAction: ProposedAction;
  instructionSignals: readonly InstructionSignal[];
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
  mode: ProposalMode;
  answer: string;
  correct: boolean;
  followedInjection: boolean;
  exfilAttempt: boolean;
  falseDone: boolean;
  boundaryRecognized: boolean;
  usedFallback: boolean;
  aegisDecisions: readonly AegisDecision[];
}

export interface ArmMetrics {
  injectionComplianceRate: number;
  taskCompletionRate: number;
  exfilAttemptRate: number;
  falseDoneRate: number;
  overblockRate: number;
  boundaryCitationRate: number;
  cleanTaskAskRate: number;
  structuredRecoveryRate: number;
}

export interface AegisEvaluator {
  decide(call: {
    tool: string;
    content: string;
    contentBoundary: {
      sourceType: SourceType;
      trust: 'trusted' | 'untrusted';
      parserMode: 'raw' | 'structured';
      instructionSignals: readonly InstructionSignal[];
      proposedAction: ProposedAction;
    };
  }): AegisDecision;
}
