# Spec 39 — Concurrent effect-start fencing

**Status:** pre-registered  
**Experiment:** `experiments/33-concurrent-effect-start-fencing/`  
**Seed:** `concurrent-effect-start-fencing-v1`

## Question and hypothesis

RT-23 makes an untouched durable authorization resolvable as `not_executed/retryable:true`, but that answer is observational: it does not itself grant one resuming host exclusive authority to cross the effect boundary. If the original caller wakes while a second host resumes, or two hosts resume concurrently, can both act on the same retryable answer and execute the effect twice?

**H-EF1:** current Aegis exposes durable effect state but no public atomic effect-start finalizer; two callers can observe the same `authorized` state and both execute if they treat the resolution result as permission. **H-EF2:** an additive start-fencing API that revalidates current authority and atomically transitions `authorized → started` authorizes exactly one caller. **H-EF3:** duplicate callers, stale original callers, invalid authority, already-started/committed effects, and unavailable start storage never produce a second execution.

## Novelty and expected shortfall

Exp-32 / RT-23 tests sequential crash recovery and proves the durable effect taxonomy. Its host fixture calls `beginEffect()` before an effect, but the Aegis public API only finalizes authorization and resolves state; it does not govern the retry-to-start transition or test concurrent resumers. This experiment attacks that untested boundary. It does not re-test permit creation/take, effect outcome classification, or acknowledgement loss before authorization.

## Frozen arms

1. `resolution-only-control` — both callers act directly on the same retryable resolution result.
2. `atomic-start-fixture` — deterministic store with an atomic compare-and-set `authorized → started` transition.
3. `aegis-wrapped` — real built Aegis public API. Uses `beginExecutionEffect()` if present, otherwise the resolution-only behavior.

## Deterministic ground truth and frozen scenarios

No LLM judges success. Every contender sees the same durable state; exact execution counts are fixture-owned.

1. `single-resume-start` — one resumed host starts and executes exactly once.
2. `two-host-concurrent-resume` — two hosts race from the same authorized state; exactly one executes.
3. `stale-original-after-resume` — the resumed host starts first; the original caller wakes later and is blocked.
4. `duplicate-start-same-host` — one host repeats start; only the first starts.
5. `invalid-snapshot-before-start` — fresh authority is invalid; authorization burns and nobody executes.
6. `start-store-unavailable` — the atomic start fails; result is `indeterminate` and nobody executes.
7. `already-committed-at-resume` — committed effect resolution never reopens the start boundary.

Scenario order is frozen as listed. `concurrent-effect-start-fencing-holdout-v1` is reserved and unused.

## Locked metrics and thresholds

Primary metrics: `duplicateEffectRate`, `unauthorizedStartRate`, `indeterminateStartExecutionRate`, `legitimateStartBlockRate`, `startDecisionAccuracy`, and `startFenceApiAvailability`. Secondary: `askCoverage`, `consumeCoverage`, and `idempotentStartSafety`.

Fixture validity and post-fix green require every duplicate/unauthorized/indeterminate-execution/legitimate-block rate `= 0`, and accuracy, API availability, ask coverage, consume coverage and idempotent safety all `= 1`. Baseline is reproducible red if API availability `< 1`, accuracy `< 1`, or any duplicate/unauthorized/indeterminate execution `> 0`. Thresholds and scenarios will not move after observation.

## Aegis ownership boundary

Aegis owns an additive `beginExecutionEffect()` boundary, operation/permit binding validation, fresh snapshot validation and burn, explicit `execute | blocked | indeterminate` results, and focused tests/RT-24 evidence. The host owns a durable linearizable compare-and-set for the effect state and must invoke this boundary immediately before the side effect. Aegis cannot save a host that treats `not_executed` as execution permission or ignores a failed start transition.

## Exact commands

Baseline:

```bash
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp33-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp33-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp33-baseline/packages/aegis-hook/dist/index.js \
node experiments/33-concurrent-effect-start-fencing/dist/main.js
```

Post-fix repeats the exact command, seed, scenarios, order, and thresholds, replacing only the three Aegis paths with `/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp32-34`.
