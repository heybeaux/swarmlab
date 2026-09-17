# Experiment 41 — Authority-plane rollback anchor

**Pre-registered:** 2026-09-17T06:33:26Z, before implementation or baseline execution.  
**Spec:** [`specs/47-authority-plane-rollback-anchor.md`](../../specs/47-authority-plane-rollback-anchor.md)  
**Seed:** `authority-plane-rollback-anchor-v1`

Tests a new restore boundary: an old execution record, host high-water, and compact proof can be restored together as a coherent snapshot after newer terminal truth existed. The frozen design compares host-authority-only behavior, a strict independent-checkpoint fixture, and real built Aegis across seventeen scenarios. Machine-owned records, host revisions/proofs, authenticated external checkpoints, and exact expected classifications are ground truth; no LLM judges success.

Green requires detection of every pre-checkpoint restore, zero restored retry authority, exact classifications, no false rollback when the checkpoint legitimately lags, full public API availability, legacy/current-state preservation, failed-CAS coverage, and ask/consume coverage. Exact scenarios, commands, thresholds, envelope, holdout discipline, and ownership are frozen in Spec 47. `authority-plane-rollback-anchor-holdout-v1` is reserved and unused.

## Results

Pending pre-registered baseline execution.
