# Experiment 38 — Monotonic journal revision

**Pre-registered:** 2026-09-14T06:38:00Z, before implementation or baseline execution.  
**Spec:** [`specs/44-monotonic-journal-revision.md`](../../specs/44-monotonic-journal-revision.md)  
**Seed:** `monotonic-journal-revision-v1`

Tests causal rollback rather than exp-37's field-level split brain: a replica may return an older but internally coherent journal record after newer terminal truth exists. The frozen design compares a replica-trusting control, deterministic authoritative-watermark fixture, and real built Aegis public resolution/start APIs across thirteen fixed scenarios. Ground truth is machine-owned revision order; no LLM judges success.

Green requires zero stale retry authority, stale classification error, and unsafe revision-failure behavior; accuracy/API availability/current-state preservation/post-CAS safety/ask/consume coverage must all equal 1. Exact scenarios, commands, thresholds, holdout discipline, and ownership are frozen in Spec 44. `monotonic-journal-revision-holdout-v1` is reserved and unused.

## Result — current Aegis red, patched Aegis green

Baseline Aegis `648cad14f7e409f52b73dc5660cd9d37f2ff3c33` treated internally coherent replica rollback as current truth. Pinned run `mjr-mu0vdd5j` matched the replica-trusting control: stale retry authority `0.333`, stale classification error `1.000`, revision-failure unsafe rate `1.000`, resolution accuracy `0.308`, revision API availability `0`, and post-CAS rollback safety `0`. The monotonic-watermark fixture was fully green.

Aegis `c47432215f86a17cb110546270024c324c236687` adds an optional `RevisionedApprovalExecutionPermitStore`, compares record revision with authoritative high-water truth at every resolve/begin read including failed-CAS readback, and classifies causal rollback as non-retryable `journal_stale`. The unchanged roster reran as `mjr-mu0vempr`: every unsafe/error rate `0` and every accuracy/API/coverage/current-state/post-CAS metric `1`. Legacy stores without the revision API remain backward compatible.
