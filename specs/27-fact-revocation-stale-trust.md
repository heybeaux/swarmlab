# Spec 27 — Fact Revocation & Stale Trust (exp-21)

> New experiment. Scope: `experiments/21-fact-revocation-stale-trust/`. Tests how persistent memory
> changes its mind when the world changes.

## Question

Once a trusted fact becomes false, how quickly and safely does the agent swarm stop using it?

## Why

Engram-style memory solves forgetting, but persistent facts can become hazards when stale. Exp-15
showed forgiveness is not time-decay. This spec tests the complementary problem: revocation is not
mere forgetting either.

## Hypotheses

- **H-I1:** append-only supported facts create persistent stale-use failures after the world changes.
- **H-I2:** explicit revocation facts outperform TTL-only decay for high-confidence operational facts.
- **H-I3:** revalidation schedules reduce stale use but can cause oscillation or excessive cost.
- **H-I4:** trust-router capability facts need separate semantics for transient failure, regression,
  recovery, and revocation.

## Setup

Seed facts with known truth, then change the world mid-run:

- API endpoint works → endpoint breaks;
- worker is capable → worker regresses;
- dependency version is safe → advisory appears;
- user preference A → user changes to B;
- deployment target exists → target removed;
- pricing/quota limit changes.

Agents must act using the store before and after changes. Harness scores actual world state.

## Arms

1. Append-only latest-supported fact.
2. TTL / time-decay.
3. Versioned facts only.
4. Explicit revocation facts.
5. Revocation + scheduled revalidation.
6. Revocation + evidence-tier weighting.

## Metrics

| metric | definition |
|---|---|
| staleUseRate | agent acts on outdated fact |
| timeToCorrection | rounds until stale fact stops being used |
| falseRevocationRate | true fact incorrectly revoked |
| overForgetRate | useful facts dropped without contrary evidence |
| oscillationRate | fact flips repeatedly without real-world change |
| revalidationCost | token/tool cost of keeping facts fresh |
| recoveryRecognition | agent accepts a fact becoming true again |

## Required stack recommendation

Define Engram semantics for:

- supersession;
- revocation;
- expiry;
- revalidation;
- confidence/tier decay;
- capability regression vs transient failure.

## Deliverables

1. `experiments/21-fact-revocation-stale-trust/` harness and README.
2. Pinned traces.
3. SYNTHESIS RT-12.
4. JOURNAL entry.
5. Stack recommendation for Engram and trust routing.

## Honesty rules

- Do not reward forgetting true facts.
- Do not conflate revocation with low confidence.
- Include recovery after revocation so the policy can change its mind twice.
