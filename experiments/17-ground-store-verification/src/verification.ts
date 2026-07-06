import type {
  ArmMetrics,
  ClaimCase,
  VerificationArmId,
  VerificationResult,
  VerificationStatus,
  VerificationTier,
} from './types.js';

export const ARMS: readonly VerificationArmId[] = [
  'first-write-wins',
  'provenance-only',
  'retrieval-only',
  'cross-model-only',
  'tiered-hierarchy',
  'tiered-consumed',
];

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function result(
  claim: ClaimCase,
  arm: VerificationArmId,
  status: VerificationStatus,
  tier: VerificationTier,
  verifier: string,
  reason: string,
  cost: number,
): VerificationResult {
  const base: VerificationResult = { claimId: claim.id, arm, status, tier, verifier, reason, cost };
  if (claim.receipt && (tier === 'provenance_chain' || tier === 'human_attestation')) return { ...base, evidenceDigest: claim.receipt.id };
  if (claim.source && tier === 'retrieval_grounded') {
    const withSource: VerificationResult = { ...base, evidenceDigest: claim.source.digest, sourceUri: claim.source.uri };
    if (claim.source.expiresAt) return { ...withSource, expiry: claim.source.expiresAt };
    return withSource;
  }
  return base;
}

function humanAttestation(claim: ClaimCase, arm: VerificationArmId): VerificationResult | undefined {
  if (!claim.humanAttested) return undefined;
  return result(claim, arm, 'supported', 'human_attestation', 'signed-human-root', 'signed human attestation', 0.5);
}

function provenance(claim: ClaimCase, arm: VerificationArmId): VerificationResult | undefined {
  if (!claim.receipt) return undefined;
  const r = claim.receipt;
  if (r.signed && r.chainValid && r.observationMatchesClaim) return result(claim, arm, 'supported', 'provenance_chain', 'receipt-verifier', 'receipt chain is signed, valid, and matches claim', 1);
  if ((r.signed || r.chainValid) && !r.observationMatchesClaim) return result(claim, arm, 'contradicted', 'provenance_chain', 'receipt-verifier', 'receipt exists but contradicts the submitted claim', 1);
  return result(claim, arm, 'unsupported', 'provenance_chain', 'receipt-verifier', 'receipt is missing signature or chain validity', 1);
}

function retrieval(claim: ClaimCase, arm: VerificationArmId, strict: boolean): VerificationResult | undefined {
  if (!claim.source) return undefined;
  const s = claim.source;
  if (s.relation === 'entails') return result(claim, arm, 'supported', 'retrieval_grounded', 'synthetic-retrieval-entailment', 'retrieved source entails claim', 2);
  if (s.relation === 'contradicts') return result(claim, arm, 'contradicted', 'retrieval_grounded', 'synthetic-retrieval-entailment', 'retrieved source contradicts claim', 2);
  if (s.relation === 'mentions_only') return result(claim, arm, strict ? 'needs_human' : 'unsupported', 'retrieval_grounded', 'synthetic-retrieval-entailment', 'source exists but does not entail claim', 2);
  if (s.relation === 'stale_entails') return result(claim, arm, strict ? 'needs_human' : 'supported', 'retrieval_grounded', 'synthetic-retrieval-entailment', strict ? 'source is expired and needs revalidation' : 'stale source text entails claim but expiry was ignored', 2);
  return result(claim, arm, strict ? 'needs_human' : 'supported', 'retrieval_grounded', 'synthetic-retrieval-entailment', strict ? 'source is from a poisoned corpus and needs human review' : 'poisoned source was treated as retrievable support', 2);
}

function crossModel(claim: ClaimCase, arm: VerificationArmId): VerificationResult {
  const panel = claim.crossModel;
  if (panel.supportVotes > panel.contradictVotes && panel.supportVotes >= 2) return result(claim, arm, 'supported', 'cross_model_adversarial', panel.correlatedError ? 'correlated-verifier-panel' : 'diverse-verifier-panel', panel.correlatedError ? 'panel supported claim with correlated error risk' : 'panel majority supported claim', 4);
  if (panel.contradictVotes > panel.supportVotes && panel.contradictVotes >= 2) return result(claim, arm, 'contradicted', 'cross_model_adversarial', 'diverse-verifier-panel', 'panel majority contradicted claim', 4);
  return result(claim, arm, 'needs_human', 'cross_model_adversarial', 'diverse-verifier-panel', 'panel could not resolve claim', 4);
}

export function verifyClaim(claim: ClaimCase, arm: VerificationArmId): VerificationResult {
  if (arm === 'first-write-wins') return result(claim, arm, 'supported', 'unsupported_claim_only', 'none', 'first write wins; no verification performed', 0.1);
  const human = humanAttestation(claim, arm);
  if (human) return human;
  if (arm === 'provenance-only') return provenance(claim, arm) ?? result(claim, arm, 'unsupported', 'unsupported_claim_only', 'receipt-verifier', 'no receipt evidence supplied', 1);
  if (arm === 'retrieval-only') return retrieval(claim, arm, false) ?? result(claim, arm, 'unsupported', 'unsupported_claim_only', 'synthetic-retrieval-entailment', 'no retrievable source supplied', 2);
  if (arm === 'cross-model-only') return crossModel(claim, arm);
  const prov = provenance(claim, arm);
  if (prov && prov.status !== 'unsupported') return prov;
  const ret = retrieval(claim, arm, true);
  if (ret && ret.status !== 'unsupported') return ret;
  return crossModel(claim, arm);
}

function auditAccepts(claim: ClaimCase, verification: VerificationResult, arm: VerificationArmId): boolean {
  if (!claim.downstreamAudit || verification.status !== 'supported') return false;
  if (arm !== 'tiered-consumed') return true;
  if (!claim.highRiskAudit) return true;
  return verification.tier === 'human_attestation' || verification.tier === 'provenance_chain' || verification.tier === 'retrieval_grounded';
}

const isFalseLike = (claim: ClaimCase): boolean => claim.truth !== 'true';
const isTrue = (claim: ClaimCase): boolean => claim.truth === 'true';

export function scoreArm(armIndex: number, arm: VerificationArmId, claims: readonly ClaimCase[]): ArmMetrics {
  const results = claims.map((claim) => verifyClaim(claim, arm));
  const byClaim = new Map(results.map((r) => [r.claimId, r]));
  const falseClaims = claims.filter(isFalseLike);
  const trueClaims = claims.filter(isTrue);
  const operational = claims.filter((claim) => claim.domain === 'operational');
  const external = claims.filter((claim) => claim.domain === 'external');
  const supported = results.filter((r) => r.status === 'supported');
  const stale = claims.filter((claim) => claim.kind === 'stale');
  const nonEntailed = claims.filter((claim) => claim.kind === 'non-entailed');
  const downstreamFalse = claims.filter((claim) => isFalseLike(claim) && claim.downstreamAudit);
  const crossFalse = falseClaims.filter((claim) => verifyClaim(claim, 'cross-model-only').status === 'supported');
  const auditEscapes = downstreamFalse.filter((claim) => {
    const verification = byClaim.get(claim.id);
    return verification ? auditAccepts(claim, verification, arm) : false;
  });
  const operationalTrue = operational.filter(isTrue);
  const operationalFalse = operational.filter(isFalseLike);
  const externalTrue = external.filter(isTrue);
  const totalCost = results.reduce((sum, r) => sum + r.cost, 0);

  return {
    armIndex,
    claims: claims.length,
    supported: supported.length,
    falseSupportRate: round3(falseClaims.filter((claim) => byClaim.get(claim.id)?.status === 'supported').length / falseClaims.length),
    trueRejectRate: round3(trueClaims.filter((claim) => byClaim.get(claim.id)?.status !== 'supported').length / trueClaims.length),
    needsHumanRate: round3(results.filter((r) => r.status === 'needs_human').length / claims.length),
    staleSupportRate: round3(stale.filter((claim) => byClaim.get(claim.id)?.status === 'supported').length / stale.length),
    citationEntailmentMiss: round3(nonEntailed.filter((claim) => byClaim.get(claim.id)?.status === 'supported').length / nonEntailed.length),
    operationalTrueRejectRate: round3(operationalTrue.filter((claim) => byClaim.get(claim.id)?.status !== 'supported').length / operationalTrue.length),
    operationalFalseSupportRate: round3(operationalFalse.filter((claim) => byClaim.get(claim.id)?.status === 'supported').length / operationalFalse.length),
    externalTrueRejectRate: round3(externalTrue.filter((claim) => byClaim.get(claim.id)?.status !== 'supported').length / externalTrue.length),
    crossModelFalseSupportRate: round3(crossFalse.length / falseClaims.length),
    downstreamAuditEscape: round3(auditEscapes.length / downstreamFalse.length),
    verificationCost: round3(totalCost / Math.max(1, supported.length)),
  };
}
