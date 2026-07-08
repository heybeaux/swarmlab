/**
 * exp-17 — ground-store verification tiers (Spec 23).
 *
 * Deterministic harness: synthetic claim corpus with machine-known ground truth,
 * receipts, source relations, expiry, and correlated verifier-panel outcomes.
 * The read path never consults ground truth; labels are only used by the scorer.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MessageBus,
  TraceWriter,
  readRunRecord,
  runScorer,
  spawnAgent,
  StubRuntime,
  type Scorer,
  type TraceEvent,
} from '@swarmlab/core';
import { CLAIMS } from './corpus.js';
import type { ArmMetrics, VerificationArmId } from './types.js';
import { ARMS, scoreArm, verifyClaim } from './verification.js';

const SEED = process.env.GROUND_SEED ?? 'ground-store-verification-v1';

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `gsv-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '17-ground-store-verification' });
const bus = new MessageBus({ trace });
const runtime = new StubRuntime();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    evidenceVersion: 1,
    experiment: '17-ground-store-verification',
    spec: '23-ground-store-verification-tiers',
    runId,
    timestamp: new Date().toISOString(),
    seed: SEED,
    evidenceKind: 'deterministic_sim',
    corpus: { claims: CLAIMS.length, syntheticSources: true, groundTruthReadPath: false },
    arms: [...ARMS],
  },
});

console.log(`run ${runId} | claims=${CLAIMS.length} arms=${ARMS.length} seed=${SEED}`);

const metricsByArm = new Map<VerificationArmId, ArmMetrics>();

for (let a = 0; a < ARMS.length; a += 1) {
  const arm = ARMS[a];
  if (!arm) continue;
  const handle = await spawnAgent(
    {
      id: `verifier:${arm}`,
      systemPrompt: `Deterministic verifier arm ${arm}. Apply only this arm's evidence policy; do not use ground-truth labels.`,
    },
    { runtime, trace },
  );

  bus.publish({ from: 'moderator', to: handle.id, topic: 'arm-start', body: { arm, claims: CLAIMS.length } });

  for (let i = 0; i < CLAIMS.length; i += 1) {
    const claim = CLAIMS[i];
    if (!claim) continue;
    const verdict = verifyClaim(claim, arm);
    if (i < 8 || claim.kind === 'fabricated' || claim.kind === 'stale' || claim.kind === 'non-entailed') {
      bus.publish({
        from: handle.id,
        to: 'moderator',
        topic: 'claim-verdict',
        body: {
          arm,
          claimId: claim.id,
          kind: claim.kind,
          domain: claim.domain,
          status: verdict.status,
          tier: verdict.tier,
          reason: verdict.reason,
          aegisAction: verdict.aegisAction,
          aegisMatches: verdict.aegisMatches,
        },
      });
    }
  }

  const metrics = scoreArm(a, arm, CLAIMS);
  metricsByArm.set(arm, metrics);
  trace.append({ t: 'score', ts: Date.now(), scores: { ...metrics } });
  console.log(
    `${arm.padEnd(18)} | falseSupport=${metrics.falseSupportRate.toFixed(3)} trueReject=${metrics.trueRejectRate.toFixed(3)} ` +
      `stale=${metrics.staleSupportRate.toFixed(3)} nonEntail=${metrics.citationEntailmentMiss.toFixed(3)} ` +
      `auditEscape=${metrics.downstreamAuditEscape.toFixed(3)} cost=${metrics.verificationCost.toFixed(3)}`,
  );

  await handle.kill();
  bus.removeAgent(handle.id);
}

function metric(arm: VerificationArmId): ArmMetrics {
  const m = metricsByArm.get(arm);
  if (!m) throw new Error(`missing metrics for ${arm}`);
  return m;
}

const summaryScorer: Scorer = {
  score() {
    const fww = metric('first-write-wins');
    const prov = metric('provenance-only');
    const ret = metric('retrieval-only');
    const xmod = metric('cross-model-only');
    const tier = metric('tiered-hierarchy');
    const consumed = metric('tiered-consumed');
    const aegis = metric('aegis-wrapped');
    return {
      corpusClaims: CLAIMS.length,
      fwwFalseSupport: fww.falseSupportRate,
      provenanceOperationalTrueReject: prov.operationalTrueRejectRate,
      provenanceOperationalFalseSupport: prov.operationalFalseSupportRate,
      provenanceExternalTrueReject: prov.externalTrueRejectRate,
      retrievalExternalTrueReject: ret.externalTrueRejectRate,
      retrievalStaleSupport: ret.staleSupportRate,
      retrievalCitationEntailmentMiss: ret.citationEntailmentMiss,
      crossModelFalseSupport: xmod.falseSupportRate,
      crossModelCorrelatedMiss: xmod.crossModelFalseSupportRate,
      tieredFalseSupport: tier.falseSupportRate,
      tieredTrueReject: tier.trueRejectRate,
      tieredNeedsHuman: tier.needsHumanRate,
      tieredAuditEscape: tier.downstreamAuditEscape,
      consumedFalseSupport: consumed.falseSupportRate,
      consumedAuditEscape: consumed.downstreamAuditEscape,
      consumedEscapeReduction: Math.round((tier.downstreamAuditEscape - consumed.downstreamAuditEscape) * 1000) / 1000,
      aegisFalseSupport: aegis.falseSupportRate,
      aegisAuditEscape: aegis.downstreamAuditEscape,
      aegisEscapeReduction: Math.round((tier.downstreamAuditEscape - aegis.downstreamAuditEscape) * 1000) / 1000,
      aegisGovernanceCostTax: Math.round((aegis.verificationCost - tier.verificationCost) * 1000) / 1000,
      hierarchyCostPerAccepted: tier.verificationCost,
      aegisCostPerAccepted: aegis.verificationCost,
      he1ProvenanceDominatesOperational: prov.operationalTrueRejectRate === 0 && prov.operationalFalseSupportRate === 0 ? 1 : 0,
      he2RetrievalDominatesExternalButStaleFails: ret.externalTrueRejectRate === 0 && ret.staleSupportRate > 0 ? 1 : 0,
      he3CrossModelCorrelatedErrorsRemain: xmod.falseSupportRate > tier.falseSupportRate ? 1 : 0,
      he4TierConsumedReducesAuditEscape: consumed.downstreamAuditEscape < tier.downstreamAuditEscape ? 1 : 0,
      he5AegisWrapperReducesAuditEscape: aegis.downstreamAuditEscape < tier.downstreamAuditEscape ? 1 : 0,
    };
  },
};

const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

const written = trace.toRunRecord();
const replayed = await readRunRecord(traceFile);
const count = (events: readonly TraceEvent[], t: TraceEvent['t']): number => events.filter((e) => e.t === t).length;
const kinds: readonly TraceEvent['t'][] = ['spawn', 'message', 'score', 'kill'];
for (const kind of kinds) {
  const a = count(written.events, kind);
  const b = count(replayed.events, kind);
  if (a !== b) throw new Error(`replay mismatch for ${kind}: wrote ${a}, replayed ${b}`);
}
console.log(`replay verified: ${replayed.events.length} events (${kinds.map((k) => `${k}=${count(replayed.events, k)}`).join(' ')})`);
console.log(`trace: ${traceFile}`);
