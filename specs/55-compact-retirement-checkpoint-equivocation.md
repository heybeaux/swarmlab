# Spec 55 - Compact retirement checkpoint equivocation

**Pre-registered:** 2026-09-29T06:47:00Z, before harness implementation or baseline execution.  
**Experiment:** `experiments/49-compact-retirement-checkpoint-equivocation`  
**Seed:** `compact-retirement-checkpoint-equivocation-v1`  
**Holdout:** `compact-retirement-checkpoint-equivocation-holdout-v1` is reserved and unused.

## Question and unique hypothesis

After a full durable strict-roster retirement tombstone has been replaced by compact lifecycle proof,
can Aegis detect rollback or equivocation between independently authenticated lifecycle-checkpoint
authorities before it reports a terminal outcome, or can one valid-looking checkpoint remain a
single-authority restore point?

The hypothesis is that current Aegis trusts one self-binding `retirement_compacted` record. It has no
plural lifecycle-checkpoint evidence contract, no authority identity validation, and no consistency
check between the compact record and independently visible lifecycle authorities. It will therefore
report false committed/failed certainty when another authenticated authority exposes conflicting
outcome, receipt, revision, or checkpoint history.

This is not exp-42 replay. Exp-42 governs the execution journal's monotonic revision lower bound before
an effect may retry or execute. Exp-49 governs the separate **strict-roster policy lifecycle** after the
full retirement tombstone and permit/approval fields have been physically removed. Its truth object,
public entry point, primary failure metric, and policy consequence are different: false terminal
classification from compact lifecycle proof rather than execution-journal retry authority.

## Why it matters and expected current-harness shortfall

RT-39 makes one compact lifecycle proof self-binding and host-authenticated, but a self-consistent old
proof can survive restoration while an independent authority retains newer or incompatible retirement
truth. A false `effect_committed` classification can make an agent claim success that did not occur;
a false `effect_failed` classification can trigger compensating work against a completed effect.
Current Aegis `40b6a033194438393608075cb7516aeab4a12e44` exposes no plural compact-retirement checkpoint
contract or resolver and ordinary compact resolution reads only one lifecycle record.

## Controls and arms

- `single-checkpoint-control`: trusts the locally selected compact record and models the current
  single-authority failure.
- `multi-authority-fixture`: deterministically validates every visible lifecycle authority, rejects
  duplicate/malformed/unverified/wrong-operation records, and requires every authority to agree with
  the local compact record exactly.
- `aegis-wrapped`: invokes the built real `@heybeaux/aegis-hook` public API. Missing APIs are measured
  red; Aegis policy is never copied into this arm.

## Deterministic ground truth and frozen scenarios

Machine-owned permit/approval/operation identity, local compact record, authority identities,
independently authenticated compact checkpoint fields, and exact expected status/reason/retryable
triples own truth. No LLM judges success. The frozen seed has 19 scenarios:

1. exact single checkpoint committed preservation;
2. exact plural committed agreement;
3. exact plural failed agreement;
4. authority order independence;
5. committed/failed outcome equivocation;
6. receipt-digest equivocation;
7. terminal-revision equivocation;
8. checkpoint-digest equivocation;
9. local compact record versus plural-authority conflict;
10. restored old local checkpoint hidden behind a newer authority;
11. authority source unavailable;
12. authority set absent;
13. empty authority set;
14. unverified authority;
15. duplicate authority identity;
16. wrong operation binding;
17. malformed authority checkpoint;
18. compact begin remains blocked under consistent plural proof; and
19. unrelated full retirement remains correctly classified.

The fixture must prove exact terminal preservation, authority-order independence, all four conflict
classes, local-versus-authority rollback detection, unavailable/absent/empty/invalid fail-closed
behavior, duplicate and operation binding, begin safety, and operation isolation.

## Metrics and frozen thresholds

Primary `aegis-wrapped` thresholds:

- `lifecycleCheckpointEquivocationDetectionRate === 1.0`
- `equivocationFalseTerminalCertaintyRate === 0.0`
- `resolutionAccuracy === 1.0`
- `multiAuthorityLifecycleCheckpointApiAvailability === 1.0`

Secondary thresholds: single/plural committed preservation, failed preservation, order independence,
outcome/digest/revision/checkpoint conflicts, local rollback conflict, unavailable/absent/empty,
unverified/duplicate/wrong-operation/malformed safety, begin safety, and operation isolation must each
equal `1.0`. The fixture must be fully green first. Thresholds and scenarios may not change after any
experiment output is observed.

## Holdout discipline

No quorum size, cadence, or numeric cutoff is tuned. Scenario order, evidence fields, expected triples,
and thresholds are frozen. The named holdout remains unused unless later work introduces roster or
quorum tuning.

## Expected Aegis ownership boundary

Aegis owns an additive plural compact-retirement authority shape and store capability, strict shape,
authority identity, verification, exact proof-binding and duplicate/conflict validation, an explicit
resolver, ordinary-resolver capability detection so older entry points cannot bypass the check, and
focused regression/release-gate coverage. Hosts own authority independence and authentication,
complete authority enumeration, linearizable reads, retention, and physical GC. Aegis cannot detect
hidden or colluding authorities and must not claim that this deterministic adapter certifies a
production transparency service.

## Exact commands

Baseline:

```bash
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-09-28-exp49 run build
npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-28-exp49 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-28-exp49/packages/aegis/dist/index.js AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-28-exp49/packages/aegis-hook/dist/index.js node experiments/49-compact-retirement-checkpoint-equivocation/dist/main.js
```

Post-fix (same commands, seed, and scenarios after the Aegis candidate is committed):

```bash
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-09-28-exp49 run build
npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-28-exp49 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-28-exp49/packages/aegis/dist/index.js AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-28-exp49/packages/aegis-hook/dist/index.js node experiments/49-compact-retirement-checkpoint-equivocation/dist/main.js
```

Regression verification only after novel work:

```bash
npm run verify:evidence
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-09-28-exp49 --filter @heybeaux/aegis-hook test
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-09-28-exp49 run release:check
```
