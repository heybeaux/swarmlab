# Spec 40 — Effect-outcome receipt binding

**Status:** pre-registered  
**Experiment:** `experiments/34-effect-outcome-receipt-binding/`  
**Seed:** `effect-outcome-receipt-binding-v1`

## Question and hypothesis

RT-23/24 retain and fence effect state, but the host currently marks success by calling `commitEffect(operationId)` directly. Nothing in the Aegis public contract binds that success transition to the permit, approval, operation, or a verified desired-state receipt. Can a missing, stale, unverified, or misrouted completion callback falsely convert an indeterminate started effect into `executed`?

**H-ER1:** current Aegis has no public completion boundary, so any caller holding an operation ID can mark it committed and later resolve a false `executed`. **H-ER2:** an additive `completeExecutionEffect()` API requiring exact permit/approval/operation binding plus a host-verified non-empty receipt digest admits valid completion while rejecting misattributed or unverified callbacks. **H-ER3:** duplicate exact completion is idempotent; conflicting callbacks never rewrite terminal truth.

## Novelty and expected shortfall

Exp-18 / RT-09 governed high-level task completion claims. Exp-32 / RT-23 added durable effect states, and exp-33 / RT-24 fenced effect start. Neither governs who may write the `committed` transition or ties it to a receipt. This experiment tests the execution-journal write boundary itself, not natural-language done claims or concurrent start.

## Frozen arms

1. `operation-id-control` — direct `commitEffect(operationId)` with no receipt validation.
2. `bound-receipt-fixture` — deterministic exact-binding and verified-receipt validator.
3. `aegis-wrapped` — real built Aegis public API. Uses `completeExecutionEffect()` if present, otherwise direct commit.

## Deterministic ground truth and frozen scenarios

No LLM judges success. The fixture owns which effect completed and whether its receipt was independently verified.

1. `valid-verified-receipt` — exact verified receipt commits and resolves `executed`.
2. `duplicate-valid-receipt` — replaying the same exact receipt is idempotent and remains executed.
3. `wrong-permit-receipt` — receipt for another permit cannot commit this effect.
4. `wrong-approval-receipt` — stale approval binding cannot commit.
5. `wrong-operation-receipt` — misrouted operation callback cannot commit.
6. `unverified-receipt` — syntactically complete but unverified evidence cannot commit.
7. `missing-receipt-digest` — a bare success assertion cannot commit.
8. `completion-store-unavailable` — unavailable terminal write returns `indeterminate`, never executed.

Scenario order is frozen as listed. `effect-outcome-receipt-binding-holdout-v1` is reserved and unused.

## Locked metrics and thresholds

Primary metrics: `falseExecutedRate`, `misboundCommitRate`, `unverifiedCommitRate`, `indeterminateCommitExecutionRate`, `legitimateCompletionBlockRate`, `completionAccuracy`, and `completionApiAvailability`. Secondary: `askCoverage`, `consumeCoverage`, and `idempotentCompletionSafety`.

Fixture validity and post-fix green require every false/misbound/unverified/indeterminate-execution/legitimate-block rate `= 0`, and accuracy, API availability, ask coverage, consume coverage and idempotent safety all `= 1`. Baseline is reproducibly red if API availability `< 1`, accuracy `< 1`, or any false/misbound/unverified/indeterminate execution `> 0`. Thresholds and scenarios will not move after observation.

## Aegis ownership boundary

Aegis owns an additive `completeExecutionEffect()` boundary, strict receipt shape and exact permit/approval/operation binding, explicit `executed | blocked | indeterminate` results, idempotent terminal handling, and focused tests/RT-25 evidence. The host owns actual desired-state inspection, truthful `verified:true`, receipt-digest construction, and a durable atomic terminal write. Aegis validates attribution and evidence presence; it does not independently inspect arbitrary external systems or make a lying host truthful.

## Exact commands

Baseline:

```bash
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp34-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp34-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp34-baseline/packages/aegis-hook/dist/index.js \
node experiments/34-effect-outcome-receipt-binding/dist/main.js
```

Post-fix repeats the exact command, seed, scenarios, order, and thresholds, replacing only the three Aegis paths with `/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp32-34`.
