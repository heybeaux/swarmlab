# Experiment 31 — Indeterminate permit-take reconciliation

**Pre-registered:** 2026-09-10T06:45:00Z, before baseline execution.  
**Spec:** [`specs/37-indeterminate-permit-take-reconciliation.md`](../../specs/37-indeterminate-permit-take-reconciliation.md)  
**Seed:** `indeterminate-permit-take-reconciliation-v1`

Tests whether real Aegis can preserve honest execution ownership when a remote transactional permit take commits server-side but its response is lost. The frozen design has three arms (`boolean-control`, `reconciling-fixture`, `aegis-wrapped`) and seven deterministic scenarios: normal commit, definite pre-commit failure plus retry, post-commit timeout plus reconciliation, cross-host retry after an ambiguous committed take, unavailable reconciliation, invalid fresh authority after reconciliation, and duplicate reconciliation replay.

Machine-owned truth comes from the fixture's atomic operation journal and exact execution counts. Green requires zero unsafe duplicate/indeterminate execution, zero committed-take orphaning, zero ambiguity misclassification, zero legitimate blocks, accuracy 1, reconciliation API availability 1, idempotent replay safety 1, and real-Aegis ask/consume coverage 1. `indeterminate-permit-take-reconciliation-holdout-v1` is reserved and unused. Exact baseline/post-fix commands and the owner boundary are frozen in Spec 37.

This is not exp-30 reseeded: RT-21 tested cross-host atomicity and only a pre-take unavailable store. This experiment tests the distributed-systems interval where mutation committed but acknowledgement did not, and requires a status-reconciliation protocol rather than merely another atomic take.

## Result — current Aegis red, patched Aegis green

Baseline Aegis `ea4ed76b3b68f10f4a32b8e933a745ba5b02fd39` exposed only the RT-21 boolean API. Pinned run `ipr-mtv5qhsb` was reproducibly red: committed-take orphan rate `3/7`, ambiguity misclassification `1/7`, legitimate block `3/7`, reconciliation accuracy `3/7`, API availability `0`, and idempotent replay safety `0`. Ask/consume coverage remained `1`, and the reconciling fixture was fully green, attributing the result to the API/protocol gap rather than the approval fixture.

Aegis commit `08e9b5e` adds `ReconciledApprovalExecutionPermitStore`, `finalizeExecutionPermitWithReconciliation()`, stable validated operation IDs, atomic prepare/status-claim semantics, and an explicit `execute | blocked | indeterminate` result. Exact same experiment reran as `ipr-mtv5qhur`: every unsafe/orphan/misclassification/block rate `0`; accuracy, API availability, ask/consume coverage, and idempotent replay safety `1`.

The `status-unavailable` case is deliberately not called success or failure: it returns `indeterminate`, `retryable:false`, and does not execute. A host may reconcile later with the same operation ID. The contract does not claim to solve acknowledgement loss after the host has acted on an `execute` result.

**Harness honesty:** two non-admitted development traces are retained. `ipr-mtv5ob83` preceded the root build-graph fix; `ipr-mtv5pq2i` exposed that the first scenario operation IDs used hyphens while the proposed public API deliberately accepts a constrained identifier alphabet. The IDs were corrected without changing scenarios, outcomes, or thresholds, then both baseline and post-fix were rerun. Only `ipr-mtv5qhsb` and `ipr-mtv5qhur` are admitted by `CLAIMS.json`.
