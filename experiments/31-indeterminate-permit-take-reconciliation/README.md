# Experiment 31 — Indeterminate permit-take reconciliation

**Pre-registered:** 2026-09-10T06:45:00Z, before baseline execution.  
**Spec:** [`specs/37-indeterminate-permit-take-reconciliation.md`](../../specs/37-indeterminate-permit-take-reconciliation.md)  
**Seed:** `indeterminate-permit-take-reconciliation-v1`

Tests whether real Aegis can preserve honest execution ownership when a remote transactional permit take commits server-side but its response is lost. The frozen design has three arms (`boolean-control`, `reconciling-fixture`, `aegis-wrapped`) and seven deterministic scenarios: normal commit, definite pre-commit failure plus retry, post-commit timeout plus reconciliation, cross-host retry after an ambiguous committed take, unavailable reconciliation, invalid fresh authority after reconciliation, and duplicate reconciliation replay.

Machine-owned truth comes from the fixture's atomic operation journal and exact execution counts. Green requires zero unsafe duplicate/indeterminate execution, zero committed-take orphaning, zero ambiguity misclassification, zero legitimate blocks, accuracy 1, reconciliation API availability 1, idempotent replay safety 1, and real-Aegis ask/consume coverage 1. `indeterminate-permit-take-reconciliation-holdout-v1` is reserved and unused. Exact baseline/post-fix commands and the owner boundary are frozen in Spec 37.

This is not exp-30 reseeded: RT-21 tested cross-host atomicity and only a pre-take unavailable store. This experiment tests the distributed-systems interval where mutation committed but acknowledgement did not, and requires a status-reconciliation protocol rather than merely another atomic take.
