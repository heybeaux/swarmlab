# Experiment 36 — Terminal receipt acknowledgement reconciliation

**Pre-registered:** 2026-09-12T06:35:00Z, before implementation or baseline execution.  
**Spec:** [`specs/42-terminal-receipt-acknowledgement-reconciliation.md`](../../specs/42-terminal-receipt-acknowledgement-reconciliation.md)  
**Seed:** `terminal-receipt-acknowledgement-reconciliation-v1`

Tests a transaction boundary not covered by RT-22 through RT-26: a success/failure terminal receipt may have committed durably even though the store response was lost. Current Aegis maps any exception from `completeEffect()` or `failEffect()` to `indeterminate`; the pre-registered hypothesis is that exact durable receipt readback can recover committed truth without confusing a different concurrent terminal receipt for acknowledgement of this call.

The frozen design has three arms (`exception-only-control`, `receipt-readback-fixture`, `aegis-wrapped`) and ten deterministic scenarios: post-commit acknowledgement loss for success and failure, pre-commit failures, unavailable readback for both terminal kinds, opposite-terminal conflicts for both calls, and exact idempotent retry after each reconciled outcome. Fixture-owned transaction timing, durable state, and exact receipt bytes are the oracle; no LLM judges success.

Green requires zero committed receipt orphan, terminal misclassification, conflicting receipt acceptance, or pre-commit false-terminal rates; reconciliation accuracy/API availability/ask/consume/idempotent safety/terminal monotonicity/unavailable-read fail-closed safety must all equal 1. The holdout seed is reserved and unused. Exact commands and the ownership boundary are frozen in Spec 42.

## Result — current Aegis red, patched Aegis green

Baseline Aegis `6684917ee604b6902d2fc28685f1d036f79449c8` returned `indeterminate` after both exact terminal writes lost their acknowledgements. Pinned run `tra-mty0gffk` orphaned `2/10` committed receipts, misclassified `4/10` scenarios, and scored reconciliation accuracy `0.600`; the exact-readback fixture was fully green.

Aegis `2238094466192389f7e9c075daf65369dbb1f974` adds one durable journal read after success/failure terminal-store exceptions and accepts only the exact bound receipt. The same roster reran as `tra-mty0hgii`: every unsafe/error rate `0`, and all accuracy/API/coverage/idempotent/monotonic/unavailable-read safety metrics `1`. Readback failure still returns `indeterminate`; a different terminal winner returns `blocked/receipt_conflict`.
