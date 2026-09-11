# Spec 38 — Execution-effect commitment journal

**Status:** pre-registered  
**Experiment:** `experiments/32-execution-effect-commitment-journal/`  
**Seed:** `execution-effect-commitment-journal-v1`

## Question and hypothesis

Once Aegis returns `execute`, every trace of the authorization is destroyed: `claimPreparedTake()` atomically returns *and deletes* the operation record. If the caller then crashes between receiving `execute` and completing the destructive side effect, can it determine on resume whether the effect actually ran — without either re-executing it (duplicate) or abandoning a legitimate authorization forever (orphan)?

This is the gap RT-22 explicitly declined to close: "The contract does not claim to solve acknowledgement loss after the host has acted on an `execute` result."

**H-EC1:** current Aegis leaves no durable authorization→effect state, so a resuming caller sees a missing permit and a missing operation record; `finalizeExecutionPermitWithReconciliation()` answers `blocked/not_taken/retryable:true`, which is a false definitive answer whenever the effect already committed. **H-EC2:** an additive effect-journal contract plus an explicit `executed | not_executed | indeterminate` resolution result can reconcile a crashed authorization to exactly one execution, while a genuinely unstarted effect stays legitimately retryable. **H-EC3:** repeated resolution, duplicate operation IDs, and cross-host resume are idempotent and never mint a second execution.

## Novelty and expected shortfall

Exp-30 / RT-21 tested cross-host atomic create/take. Exp-31 / RT-22 tested the interval where the *store* committed but its acknowledgement was lost, and stops at the moment Aegis returns `execute`. Neither injects a failure *after* authorization is handed to the caller, and neither exposes any post-authorization state to reconcile against. `claimPreparedTake()` is destructive by design, so after a successful finalization the operation journal is provably empty — there is nothing for a resuming caller to read.

## Frozen arms

1. `destructive-control` — the current RT-22 reconciliation protocol; demonstrates post-authorization amnesia.
2. `journaling-fixture` — deterministic effect journal with durable `authorized`/`committed` states; validates fixture ground truth.
3. `aegis-wrapped` — real built Aegis public API. Uses an effect-journal API if present, otherwise current `finalizeExecutionPermitWithReconciliation()`.

## Deterministic ground truth and frozen scenarios

No LLM judges success. The fixture records effect state server-side before deterministically injecting caller crashes; execution counts are exact.

1. `normal-effect-commit` — authorize, effect commits, outcome recorded; resume resolves `executed` and does not re-execute.
2. `crash-after-authorize-before-effect` — authorize, crash before the effect starts; resume resolves `not_executed` and the effect runs exactly once.
3. `crash-after-effect-before-outcome` — effect commits, crash before the outcome is recorded; resume must resolve `indeterminate`, never `not_executed`, and must not re-execute.
4. `duplicate-resolve` — replaying the same resolution never yields a second execution.
5. `effect-journal-unavailable` — the journal read fails; resolution is `indeterminate` and nothing executes.
6. `invalid-snapshot-at-resume` — authority is invalid at resume; nothing executes and the authorization is burned.
7. `cross-host-resume` — a second host resuming the same operation ID cannot produce a second execution.

Scenario order is frozen as listed. `execution-effect-commitment-journal-holdout-v1` is reserved and unused.

## Locked metrics and thresholds

Primary metrics: `unsafeDuplicateEffectRate`, `orphanedAuthorizationRate`, `effectMisclassificationRate`, `indeterminateEffectExecutionRate`, `legitimateResumeBlockRate`, `effectResolutionAccuracy`, and `effectJournalApiAvailability`. Secondary: `askCoverage`, `consumeCoverage`, and `idempotentResolveSafety`.

Fixture validity and post-fix green require every unsafe/misclassification/orphan/indeterminate-execution/legitimate-block rate `= 0`, and accuracy, API availability, ask coverage, consume coverage and idempotent resolve safety all `= 1`. Baseline is reproducible red if Aegis has API availability `< 1`, accuracy `< 1`, or any orphaned authorization, misclassification, or unsafe duplicate effect `> 0`. Thresholds and scenarios will not move after observation.

## Aegis ownership boundary

Aegis owns an additive public effect-journalling permit-store contract, a non-destructive authorization claim that leaves a durable effect record, an explicit `executed | not_executed | indeterminate` resolution taxonomy, idempotent repeated resolution, snapshot re-validation at resume, focused tests, and the RT-23 evidence gate. The host owns durable transactional storage whose permit take and effect-record write commit atomically, truthful effect-outcome reporting, and retention. Aegis must fail closed when the journal is unavailable and must never claim an effect occurred that the host did not confirm. Aegis does not make a non-idempotent side effect itself transactional; it makes the *authorization* recoverable.

## Exact commands

Baseline:

```bash
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp32-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp32-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp32-baseline/packages/aegis-hook/dist/index.js \
node experiments/32-execution-effect-commitment-journal/dist/main.js
```

Post-fix repeats the exact command, seed, scenarios, order, and thresholds, replacing only the three Aegis paths with `/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp32-34`.
