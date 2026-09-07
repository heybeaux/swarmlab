# Experiment 28 — Delegated Approval Authority and Transitive Attenuation

**Pre-registered at:** 2026-09-06T06:34:32Z  
**Local scheduling date:** 2026-09-05 America/Vancouver  
**Spec:** [Spec 34](../../specs/34-delegated-approval-authority.md)

This README pre-registers the experiment before implementation or observation. The authoritative
hypotheses, novelty analysis, ten fixed scenarios, arms, deterministic ground truth, metrics,
locked thresholds, holdout discipline, Aegis ownership boundary, and exact baseline/post-fix
commands are in Spec 34. Implementation and results are appended below without changing those terms.

## Admitted result

The real-Aegis baseline run `daa-mtqw5r7i` at
`4fcabe20a08c789f78f8b32fe7380ce9cf3639cc` reproduced the pre-registered failure:

- laundering execution rate: `1.000`
- legitimate delegation block rate: `0.667`
- delegation refresh coverage: `0.857`
- delegation accuracy: `0.700`

The failure was not a broken fixture: the bounded-chain control scored `1.000`, principal-only
laundering remained deliberately red, effective-consumer-only binding overblocked legitimate
delegates, and the real Aegis initial ask path covered all ten scenarios.

Aegis commit `74ab607b039e4256c7db2dd8c11964a558561a78` added the smallest general contract:
public delegation metadata, trusted Claude Code/OpenClaw normalization, and approval consumption
validation for effective consumer, declared portability, verified ordered chain, maximum depth,
authority attenuation, revocation check, and structural validity. Legacy non-delegated approvals
retain RT-18 behavior.

The exact ten scenarios and seed reran against that committed implementation as `daa-mtqwgbcv`:
all seven unsafe execution classes were `0.000`, legitimate block rate was `0.000`, refresh
coverage and accuracy were `1.000`, root re-ask was `0.000`, and initial ask coverage remained
`1.000`. Both admitted traces replay-verify.

Intermediate development traces were not admitted. Thresholds, scenarios, and seed were not
changed after baseline observation. The reserved holdout family remains unused.
