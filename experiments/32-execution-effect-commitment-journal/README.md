# Experiment 32 — Execution-effect commitment journal

**Pre-registered:** 2026-09-11T03:16:10Z, before baseline execution.  
**Spec:** [`specs/38-execution-effect-commitment-journal.md`](../../specs/38-execution-effect-commitment-journal.md)  
**Seed:** `execution-effect-commitment-journal-v1`

Tests the post-authorization crash interval that RT-22 explicitly left open. The current reconciliation protocol atomically returns and deletes its operation record before the caller runs the effect. If that caller crashes after receiving `execute`, a resumed host has no durable fact telling it whether the effect was untouched, started, or committed.

The frozen design has three arms (`destructive-control`, `journaling-fixture`, `aegis-wrapped`) and seven deterministic scenarios: normal commit, crash before effect start, crash after effect start before outcome, duplicate resolution, unavailable journal, invalid fresh authority, and cross-host resolution. Exact execution counts and fixture-owned durable states provide ground truth; no LLM judges success.

## Result — current Aegis red, patched Aegis green

Baseline Aegis `0a62fec1384692cca95cc2487a739b24a97ea772` exposed RT-22 but no effect-journal API. Pinned baseline run `eecj-mtwe2v9f` was red: unsafe duplicate-effect rate `6/7`, effect misclassification `5/7`, resolution accuracy `1/7`, API availability `0`, and idempotent resolution safety `0`. Ask/consume coverage stayed `1`, while the journaling fixture was fully green.

Aegis `72d800a` adds `JournaledApprovalExecutionPermitStore`, `finalizeExecutionPermitWithEffectJournal()`, and `resolveExecutionEffect()`. Permit removal plus durable `authorized` record creation is host-atomic; the initial authorization claim is one-shot but non-destructive; hosts report `started` immediately before the effect and `committed` after success. Resume resolves durable states as `executed | not_executed | indeterminate`, revalidates current authority before an untouched authorization can retry, and burns invalid authorization. Exact same roster reran as `eecj-mtweb62a`: every unsafe/orphan/misclassification/indeterminate-execution/legitimate-block rate `0`; accuracy, API availability, ask/consume coverage, and repeated-resolution safety `1`.

The crucial honesty boundary remains: a `started` effect is explicitly `indeterminate`. Aegis cannot prove whether an arbitrary non-transactional external system committed during a crash. It prevents guessing and duplicate replay; the host still owns durable transactional storage, truthful outcome reporting, and retention.
