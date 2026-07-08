# Experiment 17 — Ground-Store Verification Tiers

**Question.** Spec 18 proved Parliament fact-checking works *when a ground store exists*, but
that store was a seeded oracle. This experiment asks the missing production question: how does a
claim earn the right to enter Engram/Parliament as `supported` in the first place?

Deterministic harness for Spec 23. The corpus is synthetic and deliberately labeled as such:
30 submitted claims with machine-known ground truth, receipts, source snippets, expiry/poison
flags, and simulated cross-model verifier outcomes. The verification read path never consults
truth labels; labels are used only by the scorer. No LLM judges success.

## Claim corpus

The corpus covers:

- 2 signed human/governance attestations;
- 6 true operational claims with matching signed receipts;
- 3 false operational claims with absent, invalid, or contradicting receipts;
- 6 true documented external claims with entailing synthetic sources;
- 3 stale documented claims whose source text still entails an outdated false claim;
- 3 non-entailed claims where a source exists but only mentions adjacent concepts;
- 1 poisoned-source claim;
- 3 fabricated claims with no evidence;
- 3 ambiguous claims that should not be promoted as hard truth.

The synthetic source URI namespace is `synthetic://ground-store/*`. These are not real web
sources; they are controlled fixtures so the scorer can measure stale/poisoned/non-entailed
failures without using a seeded oracle in the verifier path.

## Arms

1. **No verification / first-write-wins** — every claim becomes `supported`.
2. **Provenance-chain only** — supports signed, valid receipts that match the claim; contradicting
   receipts block the claim; claims without receipts remain unsupported.
3. **Retrieval-grounded only** — supports entailing retrieved snippets, but deliberately ignores
   expiry/poison metadata to expose stale-corpus failure.
4. **Cross-model adversarial only** — uses a simulated verifier panel; correlated-error cases are
   present in the corpus and scored, not assumed away.
5. **Tiered hierarchy** — human > provenance > strict retrieval > cross-model > unsupported. Strict
   retrieval escalates stale, poisoned, or merely-mentioning sources to `needs_human`.
6. **Tiered hierarchy consumed by audit** — same fact admission as tiered hierarchy, but downstream
   high-risk Parliament-style audits refuse to certify facts whose only support tier is
   `cross_model_adversarial`.
7. **Aegis-wrapped audit** — same tiered fact admission as the hierarchy, but downstream audit
   certification is routed through the real `@heybeaux/lattice-aegis` evaluator (`swarmlab.rt08`) so
   the lab measures Aegis in the path, not a local policy imitation.

## Results

Original pinned run: `gsv-mr9bvkkk` — 30 claims × 6 arms, replay-verified 128 events.

Aegis-wrapped retest: `gsv-mrc3huyf` — 30 claims × 7 arms, replay-verified 149 events, run after
Aegis PR #7 landed as `2d8042e3d3e0e72b4cbf578218df4c69ba4bb3ad` and the local file-linked Aegis
package was rebuilt.

| arm | falseSupportRate | trueRejectRate | staleSupportRate | citationEntailmentMiss | downstreamAuditEscape | cost / accepted |
|---|---:|---:|---:|---:|---:|---:|
| first-write-wins | 1.000 | 0.000 | 1.000 | 1.000 | 1.000 | 0.100 |
| provenance-only | **0.000** | 0.429 | 0.000 | 0.000 | **0.000** | 3.625 |
| retrieval-only | 0.250 | 0.429 | **1.000** | 0.000 | 0.250 | 4.750 |
| cross-model-only | 0.563 | 0.000 | 0.667 | 0.667 | 0.563 | 4.913 |
| tiered-hierarchy | 0.188 | **0.000** | **0.000** | **0.000** | 0.188 | 3.412 |
| tiered-consumed | 0.188 | **0.000** | **0.000** | **0.000** | **0.063** | 3.412 |
| aegis-wrapped | 0.188 | **0.000** | **0.000** | **0.000** | **0.063** | 3.518 |

Summary scores:

```json
{
  "corpusClaims": 30,
  "fwwFalseSupport": 1,
  "provenanceOperationalTrueReject": 0,
  "provenanceOperationalFalseSupport": 0,
  "provenanceExternalTrueReject": 1,
  "retrievalExternalTrueReject": 0,
  "retrievalStaleSupport": 1,
  "retrievalCitationEntailmentMiss": 0,
  "crossModelFalseSupport": 0.563,
  "crossModelCorrelatedMiss": 0.563,
  "tieredFalseSupport": 0.188,
  "tieredTrueReject": 0,
  "tieredNeedsHuman": 0.3,
  "tieredAuditEscape": 0.188,
  "consumedFalseSupport": 0.188,
  "consumedAuditEscape": 0.063,
  "consumedEscapeReduction": 0.125,
  "aegisFalseSupport": 0.188,
  "aegisAuditEscape": 0.063,
  "aegisEscapeReduction": 0.125,
  "aegisGovernanceCostTax": 0.106,
  "hierarchyCostPerAccepted": 3.412,
  "aegisCostPerAccepted": 3.518,
  "he1ProvenanceDominatesOperational": 1,
  "he2RetrievalDominatesExternalButStaleFails": 1,
  "he3CrossModelCorrelatedErrorsRemain": 1,
  "he4TierConsumedReducesAuditEscape": 1,
  "he5AegisWrapperReducesAuditEscape": 1
}
```

## Findings

1. **H-E1 confirmed for operational claims.** Provenance-chain verification dominates where the
   system can inspect receipts directly: operational true-reject rate is 0.000 and operational
   false-support rate is 0.000. The catch is scope: provenance-only rejects all true external
   claims (`provenanceExternalTrueReject=1.000`) because documentation is not an action receipt.
2. **H-E2 confirmed with the registered stale-corpus failure.** Retrieval-grounded verification
   admits all true external documented claims (`retrievalExternalTrueReject=0.000`) and catches
   non-entailed citations in this harness (`citationEntailmentMiss=0.000`), but stale source text
   is catastrophic when expiry is ignored (`retrievalStaleSupport=1.000`). Retrieval must carry
   source freshness/expiry and poison/revalidation state, not just a URI and snippet.
3. **H-E3 confirmed.** Cross-model adversarial verification lowers some single-claim uncertainty but
   is not truth: false-support rate is 0.563, including correlated panel misses. It is the only
   arm with zero true rejects besides the hierarchy, but it buys recall by certifying too many
   false/ambiguous claims. Agreement is a weak signal, not a ground tier.
4. **H-E4 confirmed.** Storing tier is necessary but insufficient; audits must consume it. Plain
   tiered hierarchy cuts false support to 0.188 and stale/non-entailed support to 0, but downstream
   audit escape remains 0.188 because cross-model-only support can still be treated as enough. When
   the Parliament-style audit refuses high-risk facts supported only by `cross_model_adversarial`,
   audit escape falls to 0.063 with no change in admission cost.
5. **H-E5 confirmed after Aegis harnessization.** The real Aegis evaluator now implements the RT-08
   high-risk audit policy. When exp-17 reruns with `aegis-wrapped` in the audit path, downstream
   audit escape falls 0.188 → 0.063, matching the intended tier-consumption behavior, with a measured
   governance cost tax of 0.106 cost/accepted fact. This is the tighter loop: lab finding → Aegis
   policy → same lab retest with Aegis inserted → measured outcome delta.

## Stack recommendation

Engram facts should carry a verification envelope separate from the fact content:

```ts
type VerificationTier =
  | 'human_attestation'
  | 'provenance_chain'
  | 'retrieval_grounded'
  | 'cross_model_adversarial'
  | 'unsupported_claim_only';

interface VerificationEnvelope {
  tier: VerificationTier;
  status: 'supported' | 'unsupported' | 'contradicted' | 'needs_human';
  verifier: string;
  verifiedAt: string;
  evidenceDigest?: string;
  receiptUri?: string;
  sourceUri?: string;
  sourceDigest?: string;
  expiresAt?: string;
  revalidateAfter?: string;
  correlatedVerifierRisk?: boolean;
}
```

Recommended precedence:

1. `human_attestation` for signed roots of trust and explicit owner decisions.
2. `provenance_chain` for operational claims (`tests passed`, `commit pushed`, `file changed`,
   `message sent`, `deployment completed`) where receipts can be inspected directly.
3. `retrieval_grounded` for documented external facts only when the source entails the claim and is
   fresh/not poisoned; stale or poisoned retrieval should produce `needs_human`, not support.
4. `cross_model_adversarial` as a low-confidence fallback / triage signal. It may suggest
   `needs_human` or provisional support for low-risk use, but should not certify high-risk
   Parliament decisions on its own.
5. `unsupported_claim_only` for raw memory: searchable, not trusted.

Parliament should weight tiers explicitly:

- high-risk audits accept `human_attestation`, `provenance_chain`, and fresh
  `retrieval_grounded` facts;
- high-risk audits must reject or escalate facts supported only by `cross_model_adversarial`;
- expired retrieval facts automatically downgrade to `needs_human` until revalidated;
- `contradicted` beats `supported` regardless of tier unless a newer higher-tier fact supersedes it.

## Honesty notes

- The retrieval corpus is synthetic; the experiment tests architecture and failure modes, not a
  live web retriever.
- The cross-model panel is simulated to represent correlated verifier behavior. This is deliberate:
  the result measures correlated misses instead of assuming independence.
- The first local run exposed a harness bug: an ambiguous parent-task receipt was initially treated
  as verifying the child assertion. That run was not pinned. The fixed pinned run marks the receipt
  as non-matching and restores provenance's operational false-support rate to 0.
- The hierarchy still has false support (0.188) because it deliberately falls back to cross-model
  support when no stronger evidence exists. The stack fix is not "never store it"; it is "store the
  tier and make audits consume it."
- `aegis-wrapped` depends on a local `file:` link to `@heybeaux/lattice-aegis`; pinned retest
  `gsv-mrc3huyf` was run after Aegis PR #7 was merged and local Aegis dist was rebuilt from commit
  `2d8042e3d3e0e72b4cbf578218df4c69ba4bb3ad`.

## Reproduce

```bash
cd /Users/beauxwalton/Dev/aegis
git checkout 2d8042e3d3e0e72b4cbf578218df4c69ba4bb3ad
pnpm --filter @heybeaux/lattice-aegis build

cd /Users/beauxwalton/projects/swarmlab
npm install
npm run build
node experiments/17-ground-store-verification/dist/main.js
```

Then verify the committed corpus-level claim through the root evidence ledger:

```bash
npm run verify:evidence
```
