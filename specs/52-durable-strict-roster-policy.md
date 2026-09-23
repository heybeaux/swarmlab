# Spec 52 - Durable strict-roster policy continuity

**Pre-registered:** 2026-09-23T06:44:00Z, before implementation or baseline execution.  
**Experiment:** `experiments/46-durable-strict-roster-policy`  
**Seed:** `durable-strict-roster-policy-v1`  
**Holdout:** `durable-strict-roster-policy-holdout-v1` is reserved and unused.

## Question and unique hypothesis

After an operation selects Aegis's strict current-roster boundary, can that requirement survive a
process restart or cross-host handoff without process-local continuity state, using a durable policy
marker bound to the exact operation and permit? The hypothesis is that current Aegis loses the
selection because exp-45's opaque `StrictRosterContinuityContext` is backed by a process-local
`WeakMap`; a fresh process/context can therefore classify stripped roster capability as first-use
unavailability rather than a contradictory downgrade.

This is distinct from exp-44 (stale roster content while capability is present) and exp-45
(capability loss while one Aegis-created in-memory context crosses adapter views). No prior experiment
tests durable policy selection after context destruction or on another host.

## Why it matters and expected current-harness shortfall

Crash recovery and distributed workers cannot serialize a `WeakMap` entry. A workflow may correctly
select strict roster policy, then resume on a fresh process or peer with no memory of that choice.
Failing merely as generic legacy/unavailable can hide policy loss or, through a generic resolver,
restore retry authority. Aegis origin/main `444f04a0538ab679e1eee3442565c24989ba00b5`
exposes no operation-bound durable selection/readback contract and no durable strict resolve/begin
entry points, so the real-Aegis arm is expected to fail the frozen restart/handoff roster.

## Controls and arms

- `process-local-fallback-control`: destroys local continuity and uses capability-detecting fallback.
- `durable-policy-fixture`: atomically binds and reads an exact operation/permit/approval policy
  marker from shared host state, then requires it at resolve and begin.
- `aegis-wrapped`: real built Aegis loaded from `AEGIS_REPO`, `AEGIS_DIST`, and
  `AEGIS_HOOK_DIST`; it must use public durable selection, resolve, and begin APIs when available.

## Deterministic ground truth and scenarios

Ground truth is machine-owned: exact permit, approval, operation, journal/revision/checkpoint,
witness-set/current-roster, durable-policy marker, host/process phase, and expected
`{status, reason, retryable}` triples. No LLM judges success.

The frozen seed contains 15 scenarios:

1. same-process current authorized control;
2. restart with current roster;
3. cross-host handoff with current roster;
4. restart preserving committed terminal truth;
5. explicit legacy generic control;
6. restart with roster capability stripped;
7. cross-host roster unavailability;
8. durable marker missing after prior selection;
9. durable marker read unavailable;
10. marker bound to another operation;
11. marker bound to another permit;
12. malformed/downgraded policy marker;
13. conflicting pre-existing marker during selection;
14. marker loss after successful begin CAS; and
15. exact-marker idempotent reselection.

Empty/malformed marker values, exact duplicate selection, conflicting selection, the shortest valid
operation identifier, a long valid operation identifier, restart and peer-host views, terminal
preservation, pre-CAS and post-CAS windows, and explicit legacy behavior are represented. The holdout
seed is not used.

## Metrics and frozen thresholds

Primary pass/fail metrics for `aegis-wrapped`:

- `durablePolicyFailureDetectionRate` must equal `1.0`.
- `durablePolicyAuthorityRestorationRate` must equal `0.0`.
- `resolutionAccuracy` must equal `1.0`.
- `durableStrictRosterApiAvailability` must equal `1.0`.

Secondary thresholds: same-process, restart, cross-host, terminal, legacy, and idempotent controls
must all equal `1.0`; missing/unavailable/misbound/malformed/conflicting/post-CAS cases must all fail
closed without retry, execute, or terminal authority; ASK and consumed-approval coverage must equal
`1.0`. The fixture must be fully green before the real-Aegis result is interpretable. Thresholds may
not move after output is observed.

## Holdout discipline

The scenario order, seed, expected triples, and thresholds above are frozen. No threshold tuning is
permitted. `durable-strict-roster-policy-holdout-v1` remains reserved for future policy tuning and
is not consumed tonight.

## Expected ownership boundary

Aegis owns additive public selection/readback validation, exact marker binding, fail-closed durable
strict resolve/begin policy, post-CAS revalidation, and backward-compatible generic APIs. The host
owns atomic durable marker persistence, cross-host visibility, authentic storage, and current-roster
truth. Aegis does not make a database durable or discover a hidden roster.

## Exact commands

Baseline:

```bash
npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-22-exp46-baseline AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-22-exp46-baseline/packages/aegis/dist/index.js AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-22-exp46-baseline/packages/aegis-hook/dist/index.js node experiments/46-durable-strict-roster-policy/dist/main.js
```

Post-fix:

```bash
npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-22-exp46 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-22-exp46/packages/aegis/dist/index.js AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-22-exp46/packages/aegis-hook/dist/index.js node experiments/46-durable-strict-roster-policy/dist/main.js
```

Regression verification only after novel work:

```bash
npm run verify:evidence
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-09-22-exp46 run release:check
```
