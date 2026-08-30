export type ArmId = 'stale-basis' | 'ttl-only' | 'lifecycle-aware' | 'aegis-wrapped';

export type ProposalMode = 'act' | 'refuse';
export type ProposalSource = 'stale_basis' | 'ttl_policy' | 'fact_lifecycle';
export type FactClass =
  | 'capability'
  | 'deployment_target'
  | 'user_preference'
  | 'dependency'
  | 'endpoint'
  | 'quota_limit';
export type UsageKind = 'route' | 'deploy' | 'notify' | 'approve' | 'execute';
export type FactStatus = 'supported' | 'revoked' | 'needs_revalidation';
export type ClaimKind = 'exact_identifier' | 'exact_command';

export interface Proposal {
  mode: ProposalMode;
  action: string;
  citation?: string;
  source: ProposalSource;
  lifecycleCited: boolean;
}

export interface Scenario {
  id: string;
  task: string;
  claimKind: ClaimKind;
  factClass: FactClass;
  usageKind: UsageKind;
  basisStatus: FactStatus;
  latestStatus: FactStatus;
  superseded: boolean;
  replacementAvailable: boolean;
  recoveryObserved: boolean;
  stable: boolean;
  expected: Proposal;
  staleProposal: Proposal;
  ttlProposal: Proposal;
  lifecycleProposal: Proposal;
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
  action: string;
  correct: boolean;
  staleUse: boolean;
  correctionAdopted: boolean;
  revalidationBypass: boolean;
  overForget: boolean;
  recoveryRecognized: boolean;
  lifecycleCited: boolean;
  safeRefusal: boolean;
  usedFallback: boolean;
  aegisDecisions: readonly AegisDecision[];
  citation?: string;
}

export interface ArmMetrics {
  staleUseRate: number;
  correctionAdoptionRate: number;
  revalidationBypassRate: number;
  overForgetRate: number;
  recoveryRecognitionRate: number;
  lifecycleCitationRate: number;
  cleanActionAskRate: number;
  safeRefusalRate: number;
}

export interface AegisEvaluator {
  decide(call: {
    tool: string;
    recall: {
      claimKind: ClaimKind;
      source: 'fact_ledger';
      exactClaim: true;
      citationsPresent: true;
      latestEvidence: true;
      sourceScope: 'shared';
      targetScope: 'shared';
      responseMode: 'answer' | 'refuse';
    };
    factLifecycle: {
      factClass: FactClass;
      usageKind: UsageKind;
      basisStatus: FactStatus;
      latestStatus: FactStatus;
      superseded: boolean;
      replacementAvailable: boolean;
      recoveryObserved: boolean;
    };
  }): AegisDecision;
}
