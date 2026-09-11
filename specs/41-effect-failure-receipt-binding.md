# Spec 41 — Effect-failure receipt binding

**Status:** pre-registered  
**Experiment:** `experiments/35-effect-failure-receipt-binding/`  
**Seed:** `effect-failure-receipt-binding-v1`

## Question and hypothesis

After Aegis has atomically fenced an effect start, can a host durably record independently verified non-success without either leaving a known failure permanently `indeterminate` or allowing an untrusted callback to downgrade a genuinely committed success? This matters because RT-23 deliberately classifies every retained `started` record without a success outcome as unknowable, while RT-25 adds only a receipt-bound success transition.

**H-EF1:** current Aegis exposes no public failure-completion boundary, so a host that deterministically knows the external effect failed before commitment cannot make that negative fact durable; later resolution remains `indeterminate`. **H-EF2:** an additive receipt-bound failure transition can terminate a started effect as failed while preserving exact permit/approval/operation attribution, verified evidence, duplicate idempotency, and committed-success monotonicity. **H-EF3:** invalid, unverified, conflicting, late, or unavailable failure writes never become trusted failure truth and never reopen execution.

## Novelty and expected shortfall

Exp-32 / RT-23 tests crash recovery and honestly preserves unknown started effects as `indeterminate`. Exp-33 / RT-24 fences who may start. Exp-34 / RT-25 receipt-binds only successful completion. None tests the negative terminal path where the host can independently prove the effect did not commit, or whether a late failure callback can overwrite success. This is neither permit reconciliation nor success receipt replay.

## Frozen arms

1. `started-only-control` — current retained journal with no public failure transition; all started non-success outcomes remain indeterminate.
2. `bound-failure-fixture` — deterministic store enforcing exact binding, verified evidence, first-terminal-write monotonicity, and exact duplicate idempotency.
3. `aegis-wrapped` — real built Aegis public API. Uses `failExecutionEffect()` if present; otherwise retains current started-state behavior.

## Deterministic ground truth and frozen scenarios

No LLM judges success. The fixture owns whether the external system committed, definitely failed before commit, or is unknowable.

1. `valid-verified-failure` — exact verified negative receipt records failed; resolution is terminal `not_executed` and not retryable under the consumed authorization.
2. `duplicate-valid-failure` — replaying the same exact failure receipt is idempotent and remains failed.
3. `wrong-permit-failure` — receipt for another permit cannot mark this effect failed.
4. `wrong-approval-failure` — stale approval binding cannot mark failed.
5. `wrong-operation-failure` — misrouted callback cannot mark failed.
6. `unverified-failure` — syntactically complete but unverified evidence cannot mark failed.
7. `missing-failure-digest` — a bare failure assertion cannot mark failed.
8. `failure-after-committed-success` — a late failure callback cannot downgrade a receipt-committed success.
9. `conflicting-failure-receipt` — a different negative receipt cannot rewrite the first terminal failed fact.
10. `failure-store-unavailable` — unavailable terminal write returns `indeterminate`, never failed or retryable.

Scenario order is frozen as listed. `effect-failure-receipt-binding-holdout-v1` is reserved and unused.

## Locked metrics and thresholds

Primary metrics: `missedKnownFailureRate`, `falseFailureRate`, `misboundFailureRate`, `unverifiedFailureRate`, `committedDowngradeRate`, `indeterminateFailureExecutionRate`, `failureAccuracy`, and `failureApiAvailability`. Secondary: `askCoverage`, `consumeCoverage`, `idempotentFailureSafety`, and `terminalMonotonicitySafety`.

Fixture validity and post-fix green require every missed/false/misbound/unverified/downgrade/indeterminate-execution rate `= 0`, and accuracy, API availability, ask coverage, consume coverage, idempotent safety, and terminal monotonicity safety all `= 1`. Baseline is reproducibly red if API availability `< 1`, accuracy `< 1`, any known failure remains indeterminate, any false failure is trusted, or a committed success is downgraded. Thresholds and scenarios will not move after observation.

## Aegis ownership boundary

Aegis owns an additive `failExecutionEffect()` boundary; strict negative-receipt shape and exact permit/approval/operation binding; an explicit durable `failed` terminal state; idempotent exact replay and conflicting-receipt rejection; monotonic protection of `committed`; resolution of verified failed effects as terminal `not_executed/retryable:false`; focused tests; and the RT-26 evidence gate. The host owns independent desired-state inspection, truthful `verified:true`, receipt-digest construction, a durable atomic first-terminal-write implementation, and obtaining a fresh approval for any retry. Aegis cannot turn an unknown post-start timeout into proven failure and must leave such cases indeterminate.

## Exact commands

Baseline:

```bash
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp35-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp35-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp35-baseline/packages/aegis-hook/dist/index.js \
node experiments/35-effect-failure-receipt-binding/dist/main.js
```

Post-fix repeats the exact command, seed, scenarios, order, and thresholds, replacing only the three Aegis paths with `/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp35`.
