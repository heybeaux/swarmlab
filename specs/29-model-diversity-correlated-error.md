# Spec 29 — Model Diversity & Correlated Error (exp-23)

> New experiment. Scope: `experiments/23-model-diversity-correlated-error/`. Tests whether diverse
> model panels actually provide independent evidence.

## Question

When Parliament-style panels use multiple models, how much error correlation remains, and when does
model diversity improve truth rather than merely increasing agreement theater?

## Why

SwarmLab repeatedly showed agreement is not truth. A natural fix is model diversity, but different
models may share the same blind spots, especially on false premises, popular misconceptions, or
ambiguous criteria.

## Hypotheses

- **H-K1:** same-model panels improve consistency but not independence; correlated wrong answers
  remain high.
- **H-K2:** cross-provider panels reduce some correlated errors but still fail on shared false
  premises unless the criterion is pinned and evidence-grounded.
- **H-K3:** a smaller specialist verifier can outperform a larger homogeneous panel on certain task
  classes.
- **H-K4:** diversity without adversarial role assignment is weaker than diversity plus explicit
  falsification roles.

## Setup

Use task classes with harness-known truth:

- factual QA with false premises;
- code review with seeded bug;
- spec interpretation with criterion drift bait;
- evidence selection with misleading source;
- arithmetic/logic traps;
- style-only decoys where consensus is easy but irrelevant.

## Arms

1. Single model.
2. Same model N times.
3. Same provider, different models.
4. Cross-provider models.
5. Cross-provider + pinned criterion.
6. Cross-provider + adversarial verifier role.
7. Specialist verifier + generalist panel.

## Metrics

| metric | definition |
|---|---|
| individualAccuracy | per-agent correctness |
| panelAccuracy | final decision correctness |
| correlatedWrongRate | multiple agents choose same wrong answer |
| minorityCorrectSuppression | correct minority overruled |
| criterionDriftRate | panel optimizes wrong criterion |
| evidenceUseRate | decision cites actual supporting evidence |
| costNormalizedAccuracy | accuracy per token/tool cost |

## Required stack recommendation

Recommend Parliament routing defaults:

- when to buy model diversity;
- when to buy specialist verification;
- when to require adversarial roles;
- when same-model redundancy is wasted.

## Deliverables

1. `experiments/23-model-diversity-correlated-error/` harness and README.
2. Pinned traces.
3. SYNTHESIS RT-14.
4. JOURNAL entry.
5. Parliament model-diversity recommendation.

## Honesty rules

- Do not treat provider diversity as independence unless measured.
- Report cost-normalized results, not just raw accuracy.
- Preserve minority-correct cases for qualitative analysis.
