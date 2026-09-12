# Experiment 36 — Terminal receipt acknowledgement reconciliation

**Pre-registered:** 2026-09-12T06:35:00Z, before implementation or baseline execution.  
**Spec:** [`specs/42-terminal-receipt-acknowledgement-reconciliation.md`](../../specs/42-terminal-receipt-acknowledgement-reconciliation.md)  
**Seed:** `terminal-receipt-acknowledgement-reconciliation-v1`

Tests a transaction boundary not covered by RT-22 through RT-26: a success/failure terminal receipt may have committed durably even though the store response was lost. Current Aegis maps any exception from `completeEffect()` or `failEffect()` to `indeterminate`; the pre-registered hypothesis is that exact durable receipt readback can recover committed truth without confusing a different concurrent terminal receipt for acknowledgement of this call.

The frozen design has three arms (`exception-only-control`, `receipt-readback-fixture`, `aegis-wrapped`) and ten deterministic scenarios: post-commit acknowledgement loss for success and failure, pre-commit failures, unavailable readback for both terminal kinds, opposite-terminal conflicts for both calls, and exact idempotent retry after each reconciled outcome. Fixture-owned transaction timing, durable state, and exact receipt bytes are the oracle; no LLM judges success.

Green requires zero committed receipt orphan, terminal misclassification, conflicting receipt acceptance, or pre-commit false-terminal rates; reconciliation accuracy/API availability/ask/consume/idempotent safety/terminal monotonicity/unavailable-read fail-closed safety must all equal 1. The holdout seed is reserved and unused. Exact commands and the ownership boundary are frozen in Spec 42.

## Results

Pending baseline execution.
