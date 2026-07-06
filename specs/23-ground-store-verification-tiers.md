# Spec 23 — Ground-Store Verification Tiers (exp-17)

> New experiment. Scope: `experiments/17-ground-store-verification/` plus any minimal Engram
> integration needed via `file:` dependency. This addresses the open question from the retest
> campaign: what verifies a claim into Engram as supported?

## Question

When agents submit claims to a shared ground store, which verification mechanism best prevents
unsupported or fabricated claims from becoming trusted facts, while still admitting useful true
claims at reasonable cost?

## Why

Spec 18 proved Parliament fact-checking works when a ground store exists, but the store was a
seeded oracle. Deployment needs a policy for how facts earn support in the first place.

Candidate verification tiers:

1. **Human attestation** — signed root-of-trust fact.
2. **Provenance-chain verification** — claim traces to a signed observation/action receipt.
3. **Retrieval-grounded verification** — claim cites a retrievable source and verifier checks
   entailment.
4. **Cross-model adversarial verification** — diverse verifier panel attempts to falsify/support.
5. **Unsupported claim-only** — recorded but not trusted.

## Hypotheses

- **H-E1:** provenance-chain verification dominates for operational claims where the system can
  inspect receipts directly (`tests passed`, `commit pushed`, `file changed`).
- **H-E2:** retrieval-grounded verification dominates for external/documented facts, but fails when
  the retrieval corpus is stale or poisoned.
- **H-E3:** cross-model adversarial verification reduces single-model fabrication but retains
  correlated-error failure modes; it should be a lower tier than provenance/retrieval.
- **H-E4:** verification tier should be stored on the fact and consumed by audits; treating all
  supported facts equally reopens spec-18-style fabrication risk.

## Setup

Create a controlled claim corpus with known ground truth:

- operational claims with receipts;
- documented claims with source snippets;
- stale documented claims;
- fabricated claims;
- ambiguous claims;
- adversarially worded claims;
- claims whose source exists but does not entail the conclusion.

Agents submit claims to a store. Verification arms decide whether to mark each claim:

- `supported`
- `unsupported`
- `contradicted`
- `needs_human`

Use harness ground truth for scoring. LLMs may generate/verbalize claims, but harness assertions
own correctness.

## Arms

1. No verification / first-write-wins.
2. Provenance-chain only.
3. Retrieval-grounded only.
4. Cross-model adversarial only.
5. Tiered hierarchy: human > provenance > retrieval > cross-model > unsupported.
6. Tiered hierarchy consumed by Parliament-style fact-checking.

## Metrics

| metric | definition |
|---|---|
| falseSupportRate | false/fabricated claims admitted as supported |
| trueRejectRate | true claims rejected or left unsupported |
| needsHumanRate | claims escalated to human |
| staleSupportRate | outdated facts admitted as current |
| citationEntailmentMiss | cited source exists but does not support claim |
| verificationCost | token/tool cost per accepted fact |
| downstreamAuditEscape | unsupported claim later passes an audit |

## Required stack recommendation

Recommend the `verification_tier` schema for Engram facts, including:

- tier enum;
- verifier identity;
- evidence digest / receipt pointer;
- source URI if retrieval-grounded;
- timestamp and expiry/revalidation hint;
- how Parliament should weight tiers during fact-checking.

## Deliverables

1. `experiments/17-ground-store-verification/` harness and README.
2. Pinned replay traces.
3. SYNTHESIS entry RT-08.
4. JOURNAL entry.
5. If an Engram extension is needed, implement on local branch only unless explicitly told to push.
6. Explicit verdicts on H-E1 through H-E4.

## Honesty rules

- Do not call cross-model agreement truth.
- Do not use seeded oracle labels in the read path except for harness scoring.
- If retrieval sources are synthetic, label them synthetic.
- If a verifier depends on a model's judgment, measure correlated misses rather than assuming
  independence.
