# Spec 37 — Indeterminate permit-take reconciliation

**Status:** pre-registered  
**Experiment:** `experiments/31-indeterminate-permit-take-reconciliation/`  
**Seed:** `indeterminate-permit-take-reconciliation-v1`

## Question and hypothesis

When a remote execution-permit store times out after atomically taking a permit server-side, can Aegis distinguish "definitely not taken" from an indeterminate outcome and reconcile it without either authorizing an unsafe retry or permanently orphaning a legitimate side effect? This matters because RT-21 converted transport errors to `false`, even though a timeout can arrive after the destructive operation committed.

**H-IP1:** current Aegis collapses all `take()` rejection into a final `false`; the original caller cannot safely know whether it owns execution, and a retry sees the permit missing. **H-IP2:** a host-provided operation-id/status protocol plus an Aegis finalization result taxonomy can reconcile a committed take to one executable owner, while definite pre-commit failure remains blocked and retryable. **H-IP3:** repeated reconciliation and duplicate operation IDs are idempotent and never mint a second execution.

## Novelty and expected shortfall

Exp-29 / RT-20 tests authority drift and local one-shot finalization. Exp-30 / RT-21 tests cross-host atomic create/take, duplicate consumption, invalid burn, and a store that fails before taking. Neither injects an acknowledgement loss after the shared store has committed a destructive take, exposes operation status, or measures ambiguity/orphaning. Aegis `finalizeExecutionPermitWithStore()` currently returns only `boolean` and catches every `store.take()` rejection as `false`.

## Frozen arms

1. `boolean-control` — the current two-method `create/take` protocol and boolean finalizer; demonstrates ambiguity.
2. `reconciling-fixture` — deterministic operation journal with atomic take keyed by operation ID and status lookup; validates fixture/ground truth.
3. `aegis-wrapped` — real built Aegis public API. Uses a reconciliation API if present, otherwise current `finalizeExecutionPermitWithStore()`.

## Deterministic ground truth and frozen scenarios

No LLM judges success. The store records server-side commit state before deterministically injecting transport outcomes.

1. `normal-commit` — take returns normally; exactly one caller receives `execute`.
2. `precommit-failure-retry` — first attempt fails definitely before mutation; it reports `blocked/retryable`, then a new operation succeeds exactly once.
3. `postcommit-timeout-reconcile` — take commits, response is lost; status reconciliation returns the taken record and the original operation executes exactly once.
4. `postcommit-timeout-cross-host-retry` — original operation commits but times out; a different operation cannot execute; original reconciliation executes exactly once.
5. `status-unavailable` — commit outcome is indeterminate and status lookup is unavailable; no caller executes and the outcome remains explicitly `indeterminate`, never falsely `blocked` or `execute`.
6. `invalid-snapshot-postcommit` — committed record reconciles but fresh authority is invalid; permit burns and no retry executes.
7. `duplicate-reconcile` — replaying the same operation ID/status result never yields a second `execute` decision.

Scenario order is frozen as listed. `indeterminate-permit-take-reconciliation-holdout-v1` is reserved and unused.

## Locked metrics and thresholds

Primary metrics: `unsafeDuplicateExecutionRate`, `committedTakeOrphanRate`, `ambiguityMisclassificationRate`, `indeterminateExecutionRate`, `legitimateExecutionBlockRate`, `reconciliationAccuracy`, and `reconciliationApiAvailability`. Secondary: ask/consume coverage and idempotent replay safety.

Fixture validity and post-fix green require every unsafe/misclassification/orphan/indeterminate-execution/legitimate-block rate `= 0`, accuracy/API availability/idempotent replay safety `= 1`, and ask/consume coverage `= 1`. Baseline is reproducible red if Aegis has API availability `< 1`, accuracy `< 1`, any committed-take orphan or ambiguity misclassification `> 0`, or any unsafe execution rate `> 0`. Thresholds and scenarios will not move after observation.

## Aegis ownership boundary

Aegis owns an additive public reconciliation-capable execution-permit store/finalization contract; stable operation IDs; a result taxonomy that distinguishes `execute`, definitive `blocked`, and `indeterminate`; validation/burn semantics after a reconciled take; idempotent local handling of repeated status results; focused tests; and the RT-22 evidence gate. The host owns a durable transactional store whose take mutation and operation-journal record commit atomically, truthful status lookup, retry transport policy, and retention. Aegis must fail closed when status is unavailable and must not claim the side effect occurred; it does not solve arbitrary non-idempotent effect acknowledgement after returning `execute`.

## Exact commands

Baseline:

```bash
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-09-exp31-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-09-exp31-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-09-exp31-baseline/packages/aegis-hook/dist/index.js \
node experiments/31-indeterminate-permit-take-reconciliation/dist/main.js
```

Post-fix repeats the exact command, seed, scenarios, order, and thresholds, replacing only the three Aegis paths with `/Users/beauxwalton/projects/worktrees/aegis-2026-09-09-exp31`.
