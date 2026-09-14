# Experiment 38 — Monotonic journal revision

**Pre-registered:** 2026-09-14T06:38:00Z, before implementation or baseline execution.  
**Spec:** [`specs/44-monotonic-journal-revision.md`](../../specs/44-monotonic-journal-revision.md)  
**Seed:** `monotonic-journal-revision-v1`

Tests causal rollback rather than exp-37's field-level split brain: a replica may return an older but internally coherent journal record after newer terminal truth exists. The frozen design compares a replica-trusting control, deterministic authoritative-watermark fixture, and real built Aegis public resolution/start APIs across thirteen fixed scenarios. Ground truth is machine-owned revision order; no LLM judges success.

Green requires zero stale retry authority, stale classification error, and unsafe revision-failure behavior; accuracy/API availability/current-state preservation/post-CAS safety/ask/consume coverage must all equal 1. Exact scenarios, commands, thresholds, holdout discipline, and ownership are frozen in Spec 44. `monotonic-journal-revision-holdout-v1` is reserved and unused.

Result pending pre-registered baseline.
