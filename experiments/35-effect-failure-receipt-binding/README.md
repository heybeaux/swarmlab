# Experiment 35 — Effect-failure receipt binding

**Pre-registered:** 2026-09-11T06:40:00Z, before baseline execution.  
**Spec:** [`specs/41-effect-failure-receipt-binding.md`](../../specs/41-effect-failure-receipt-binding.md)  
**Seed:** `effect-failure-receipt-binding-v1`

Tests the negative terminal boundary left open by RT-23 through RT-25. Current Aegis can retain an unknown started effect and can receipt-bind verified success, but it exposes no public transition for independently verified failure. A known pre-commit failure therefore remains indistinguishable from an unknowable started effect, while an unsafe naïve failure callback could also downgrade committed truth.

The frozen design has three arms (`started-only-control`, `bound-failure-fixture`, `aegis-wrapped`) and ten deterministic scenarios: valid failure, duplicate exact failure, wrong permit, wrong approval, wrong operation, unverified failure, missing digest, late failure after committed success, conflicting failure receipt, and unavailable terminal storage. Fixture-owned external outcome and exact durable state are the oracle; no LLM judges success.

Green requires zero missed known failure, false/misbound/unverified failure, committed downgrade, or indeterminate-execution rates; failure accuracy/API availability/ask/consume/idempotent safety/terminal monotonicity must all equal 1. `effect-failure-receipt-binding-holdout-v1` is reserved and unused. Exact commands and the ownership boundary are frozen in Spec 41.
