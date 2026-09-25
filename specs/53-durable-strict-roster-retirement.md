# Spec 53 - Durable strict-roster policy retirement

**Pre-registered:** 2026-09-25T06:36:00Z, before implementation or baseline execution.  
**Experiment:** `experiments/47-durable-strict-roster-retirement`  
**Seed:** `durable-strict-roster-retirement-v1`  
**Holdout:** `durable-strict-roster-retirement-holdout-v1` is reserved and unused.

## Question and unique hypothesis

Can a durable strict-roster marker be safely retired after exact terminal effect truth, without
allowing late retries to confuse legitimate retirement with policy loss or allowing the retired
marker to resurrect authority? The hypothesis is that Aegis origin/main cannot represent the marker
lifecycle: RT-37 exposes only create-if-absent bind and read. Consequently hosts must either retain
markers forever, delete them (indistinguishable from corruption), or reuse the key unsafely.

This is distinct from exp-46, which tests marker selection, loss, misbinding and restart/handoff while
the operation is live. No existing question, mechanism, metric or policy tests exact terminal-bound
retirement, retained tombstones, late retries, ABA/reselection, or retention-store outages.

## Why it matters and expected current-harness shortfall

Unbounded marker retention is an operational leak. Blind deletion discards evidence that strict
policy was intentionally retired, so a late retry sees the same absence as accidental marker loss.
Worse, create-if-absent selection can recreate a deleted key and resurrect retry authority. Current
Aegis `942e7be0c34d28c56d4833c64279bcc20d263d68` has no retirement/tombstone API and no resolver
that distinguishes active, retired, missing and unavailable lifecycle truth.

## Controls and arms

- `delete-on-terminal-control`: deletes the active marker after terminal truth, modeling naive GC.
- `retirement-tombstone-fixture`: atomically transitions an exact active marker to a retained,
  terminal-bound retirement tombstone and validates it on late reads.
- `aegis-wrapped`: invokes the real built Aegis hook public API from `AEGIS_HOOK_DIST`; absence of
  the retirement lifecycle surface is measured as red, never replaced with local Aegis policy.

## Deterministic ground truth and frozen scenarios

Machine-owned journal state, exact permit/approval/operation identity, terminal outcome/digest,
active marker or retirement tombstone, and exact expected lifecycle/result values own truth. No LLM
judges success. The frozen seed has 16 scenarios:

1. exact committed retirement;
2. exact failed retirement;
3. idempotent exact retirement;
4. late resolve after committed retirement;
5. late resolve after failed retirement;
6. late begin after retirement;
7. reselection after retirement (ABA attempt);
8. retirement before terminal truth;
9. retirement with wrong terminal outcome;
10. retirement with wrong receipt digest;
11. retirement bound to another operation;
12. retirement bound to another permit;
13. malformed retirement tombstone;
14. retirement-store unavailable;
15. tombstone lost after retirement; and
16. an unrelated active operation remains usable.

The fixture must prove exact terminal controls, late-read classification, no retry/execute authority,
atomic idempotence, misbinding rejection, and operation isolation.

## Metrics and frozen thresholds

Primary `aegis-wrapped` thresholds:

- `retirementFailureDetectionRate === 1.0`
- `retiredAuthorityRestorationRate === 0.0`
- `resolutionAccuracy === 1.0`
- `durableRetirementApiAvailability === 1.0`

Secondary thresholds: committed/failed/idempotent controls, late resolve/begin safety, ABA prevention,
pre-terminal rejection, outcome/digest/operation/permit/malformed/outage/loss safety and operation
isolation must each equal `1.0`. Fixture metrics must be fully green first. Thresholds and scenarios
may not change after output is observed.

## Holdout discipline

No cadence or numeric cutoff is tuned. Scenario order, expected outcomes and thresholds are frozen.
The named holdout remains unused unless future lifecycle policy tuning occurs.

## Expected ownership boundary

Aegis owns additive strict validation, lifecycle classification, atomic retirement transition/readback
contracts, terminal-proof binding, fail-closed late resolve/begin behavior, ABA prevention, focused
regression tests and a release-gate case. Hosts own linearizable active-to-retired transition,
authentic terminal records, cross-host visibility, tombstone retention and physical deletion after
the externally chosen retention horizon. Aegis does not choose production TTLs or make storage
durable.

## Exact commands

Baseline:

```bash
npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-24-exp47-baseline AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-24-exp47-baseline/packages/aegis/dist/index.js AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-24-exp47-baseline/packages/aegis-hook/dist/index.js node experiments/47-durable-strict-roster-retirement/dist/main.js
```

Post-fix:

```bash
npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-24-exp47 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-24-exp47/packages/aegis/dist/index.js AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-24-exp47/packages/aegis-hook/dist/index.js node experiments/47-durable-strict-roster-retirement/dist/main.js
```

Regression verification only after novel work:

```bash
npm run verify:evidence
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-09-24-exp47 run release:check
```
