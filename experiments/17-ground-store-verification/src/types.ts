export type ClaimTruth = 'true' | 'false' | 'ambiguous';

export type ClaimKind =
  | 'human-attested'
  | 'operational'
  | 'documented'
  | 'stale'
  | 'fabricated'
  | 'ambiguous'
  | 'non-entailed'
  | 'poisoned';

export type VerificationArmId =
  | 'first-write-wins'
  | 'provenance-only'
  | 'retrieval-only'
  | 'cross-model-only'
  | 'tiered-hierarchy'
  | 'tiered-consumed';

export type VerificationStatus = 'supported' | 'unsupported' | 'contradicted' | 'needs_human';

export type VerificationTier =
  | 'human_attestation'
  | 'provenance_chain'
  | 'retrieval_grounded'
  | 'cross_model_adversarial'
  | 'unsupported_claim_only';

export type SourceRelation = 'entails' | 'contradicts' | 'mentions_only' | 'stale_entails' | 'poisoned_entails';

export interface ReceiptEvidence {
  readonly id: string;
  readonly signed: boolean;
  readonly chainValid: boolean;
  readonly observationMatchesClaim: boolean;
  readonly actor: string;
}

export interface RetrievalEvidence {
  readonly uri: string;
  readonly relation: SourceRelation;
  readonly retrievedAt: string;
  readonly expiresAt?: string;
  readonly digest: string;
}

export interface CrossModelEvidence {
  readonly supportVotes: number;
  readonly contradictVotes: number;
  readonly abstainVotes: number;
  readonly correlatedError: boolean;
}

export interface ClaimCase {
  readonly id: string;
  readonly kind: ClaimKind;
  readonly domain: 'operational' | 'external' | 'governance';
  readonly statement: string;
  readonly truth: ClaimTruth;
  readonly submittedBy: string;
  readonly humanAttested?: boolean;
  readonly receipt?: ReceiptEvidence;
  readonly source?: RetrievalEvidence;
  readonly crossModel: CrossModelEvidence;
  readonly downstreamAudit: boolean;
  readonly highRiskAudit: boolean;
}

export interface VerificationResult {
  readonly claimId: string;
  readonly arm: VerificationArmId;
  readonly status: VerificationStatus;
  readonly tier: VerificationTier;
  readonly verifier: string;
  readonly reason: string;
  readonly evidenceDigest?: string;
  readonly sourceUri?: string;
  readonly expiry?: string;
  readonly cost: number;
}

export interface ArmMetrics {
  readonly armIndex: number;
  readonly claims: number;
  readonly supported: number;
  readonly falseSupportRate: number;
  readonly trueRejectRate: number;
  readonly needsHumanRate: number;
  readonly staleSupportRate: number;
  readonly citationEntailmentMiss: number;
  readonly operationalTrueRejectRate: number;
  readonly operationalFalseSupportRate: number;
  readonly externalTrueRejectRate: number;
  readonly crossModelFalseSupportRate: number;
  readonly downstreamAuditEscape: number;
  readonly verificationCost: number;
}
