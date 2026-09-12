# Spec 42 — Terminal receipt acknowledgement reconciliation

**Status:** pre-registered  
**Experiment:** `experiments/36-terminal-receipt-acknowledgement-reconciliation/`  
**Seed:** `terminal-receipt-acknowledgement-reconciliation-v1`

## Question and hypothesis

After Aegis asks a durable store to commit an exactly bound verified success or failure receipt, can it distinguish a response lost **after** the terminal write committed from a failure that happened before commit, without accepting a different concurrent terminal receipt as acknowledgement of its own write? This matters because RT-25/26 make the first terminal receipt monotonic but both public boundaries currently collapse every store exception into `indeterminate`, even when the retained effect journal already contains machine-checkable terminal truth.

**H-TR1:** current Aegis leaves committed success and failure writes orphaned as `indeterminate` when their acknowledgement is lost. **H-TR2:** an additive read-after-exception reconciliation contract can recover an exact committed terminal receipt while keeping definite pre-commit failure and unavailable status indeterminate. **H-TR3:** reconciliation must compare the complete receipt and binding, not terminal state alone; a conflicting success/failure or different receipt remains blocked and never becomes proof that this caller's write committed.

## Novelty and expected shortfall

Exp-31 reconciles permit removal before execution. Exp-32 retains authorization and coarse effect state after execution begins. Exp-34 and exp-35 bind successful and failed terminal writes and test ordinary store unavailability, but neither distinguishes pre-commit failure from acknowledgement loss after a terminal write. This experiment tests a later transaction boundary and a different mechanism: exact terminal-receipt readback after an exception. It does not reseed or rename the earlier receipt experiments.

## Frozen arms

1. `exception-only-control` — current behavior: any terminal-store exception is `indeterminate`.
2. `receipt-readback-fixture` — deterministic store reads the retained terminal record after an exception and accepts only an exact receipt match.
3. `aegis-wrapped` — real built Aegis public `completeExecutionEffect()` and `failExecutionEffect()` APIs.

## Deterministic ground truth and frozen scenarios

No LLM judges success. The fixture controls whether a terminal transaction commits, whether its response is lost, the exact persisted receipt, and whether readback is available.

1. `success-postcommit-ack-loss` — exact success receipt commits, response is lost; result must reconcile to `executed`.
2. `failure-postcommit-ack-loss` — exact failure receipt commits, response is lost; result must reconcile to `failed`.
3. `success-precommit-failure` — write fails before mutation; result remains `indeterminate` and state remains started.
4. `failure-precommit-failure` — negative write fails before mutation; result remains `indeterminate` and state remains started.
5. `success-postcommit-status-unavailable` — exact success commits but acknowledgement and readback are unavailable; result remains `indeterminate`, never blocked or inferred.
6. `failure-postcommit-status-unavailable` — exact failure commits but acknowledgement and readback are unavailable; result remains `indeterminate`.
7. `success-conflicting-terminal-readback` — success call throws without committing while a different negative receipt wins; reconciliation must return `blocked/receipt_conflict`, not executed.
8. `failure-conflicting-terminal-readback` — failure call throws without committing while a different success receipt wins; reconciliation must return `blocked/receipt_conflict`, not failed.
9. `success-exact-retry-after-ack-loss` — after a reconciled success, the same exact call remains idempotently `executed`.
10. `failure-exact-retry-after-ack-loss` — after a reconciled failure, the same exact call remains idempotently `failed`.

Scenario order is frozen as listed. `terminal-receipt-acknowledgement-reconciliation-holdout-v1` is reserved and unused; no threshold, receipt, order, or scenario may change after baseline observation.

## Locked metrics and thresholds

Primary metrics: `committedReceiptOrphanRate`, `terminalMisclassificationRate`, `conflictingReceiptAcceptanceRate`, `precommitFalseTerminalRate`, `reconciliationAccuracy`, and `reconciliationApiAvailability`. Secondary: `askCoverage`, `consumeCoverage`, `idempotentReconciliationSafety`, `terminalMonotonicitySafety`, and `unavailableReadFailClosedSafety`.

Fixture validity and post-fix green require every orphan/misclassification/conflicting-acceptance/precommit-false-terminal rate `= 0`; accuracy, API availability, ask coverage, consume coverage, idempotent safety, terminal monotonicity, and unavailable-read fail-closed safety all `= 1`. Baseline is reproducibly red if either committed acknowledgement-loss scenario returns `indeterminate`, any conflicting receipt is accepted as this caller's terminal result, any pre-commit failure becomes terminal, API availability `< 1`, or accuracy `< 1`.

## Aegis ownership boundary

Aegis owns additive terminal-write reconciliation in both public receipt boundaries; read-after-exception through the existing durable journal; strict exact receipt/binding comparison; explicit conflict versus unavailable outcomes; focused success/failure, retry, conflict, and unavailable-read tests; and the RT-27 evidence gate. The host store owns an atomic first-terminal-write, durable retention and readback of the exact success or failure receipt, linearizable reads, and honest exception timing. Aegis cannot infer completion when readback is unavailable and must not authorize an effect retry.

## Exact commands

Baseline:

```bash
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-11-exp36-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-11-exp36-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-11-exp36-baseline/packages/aegis-hook/dist/index.js \
node experiments/36-terminal-receipt-acknowledgement-reconciliation/dist/main.js
```

Post-fix repeats the exact command, seed, scenarios, order, receipts, and thresholds, replacing only the three Aegis paths with `/Users/beauxwalton/projects/worktrees/aegis-2026-09-11-exp36`.
