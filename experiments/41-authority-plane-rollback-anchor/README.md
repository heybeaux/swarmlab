# Experiment 41 — Authority-plane rollback anchor

**Pre-registered:** 2026-09-17T06:33:26Z, before implementation or baseline execution.  
**Spec:** [`specs/47-authority-plane-rollback-anchor.md`](../../specs/47-authority-plane-rollback-anchor.md)  
**Seed:** `authority-plane-rollback-anchor-v1`

Tests a new restore boundary: an old execution record, host high-water, and compact proof can be restored together as a coherent snapshot after newer terminal truth existed. The frozen design compares host-authority-only behavior, a strict independent-checkpoint fixture, and real built Aegis across seventeen scenarios. Machine-owned records, host revisions/proofs, authenticated external checkpoints, and exact expected classifications are ground truth; no LLM judges success.

Green requires detection of every pre-checkpoint restore, zero restored retry authority, exact classifications, no false rollback when the checkpoint legitimately lags, full public API availability, legacy/current-state preservation, failed-CAS coverage, and ask/consume coverage. Exact scenarios, commands, thresholds, envelope, holdout discipline, and ownership are frozen in Spec 47. `authority-plane-rollback-anchor-holdout-v1` is reserved and unused.

## Results — current Aegis red, patched Aegis green

Baseline real Aegis `b50b46d2d4c965ce7db12cbf0f8f6ec2c187398d`, run `ara-mu55rn5j`, detected only `1/5` rollback scenarios, restored retry authority in `1/5`, reached exact resolution accuracy `7/17`, exposed no checkpoint API, and failed absent/unavailable/invalid checkpoint and post-CAS safety. The strict fixture was fully green.

Patched real Aegis `f5d7d7e663ec3de931e6689862859d27dd7b0d7b`, run `ara-mu55rftq`, detected `5/5`, restored no retry authority, reached `17/17` exact accuracy, and made every frozen API/preservation/safety/coverage metric green. Aegis now feature-detects an additive `AnchoredApprovalExecutionPermitStore`, validates an exact authenticated checkpoint as a lower bound on host high-water revision, and rechecks it after failed begin CAS. Stores without the capability preserve legacy behavior.
