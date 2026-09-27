# Spec 54 - Durable strict-roster retirement compaction

**Pre-registered:** 2026-09-26T06:42:00Z, before implementation or baseline execution.  
**Experiment:** `experiments/48-durable-strict-roster-retirement-compaction`  
**Seed:** `durable-strict-roster-retirement-compaction-v1`  
**Holdout:** `durable-strict-roster-retirement-compaction-holdout-v1` is reserved and unused.

## Question and unique hypothesis

Can a retired strict-roster tombstone be atomically compacted into independently authenticated,
self-binding lifecycle proof without allowing late retries to confuse intentional compaction with
lost retirement truth or to regain authority? The hypothesis is that Aegis origin/main cannot
represent this transition: RT-38 validates only a full retirement tombstone in the primary lifecycle
store, so physical deletion after checkpointing is indistinguishable from tombstone loss.

This is distinct from exp-40, which compacts the effect journal's terminal receipt, and exp-47, which
retires an active strict-roster marker into a retained full tombstone. The mechanism under test is
atomic compaction of the **strict-roster lifecycle tombstone**, independent authentication/readback
of that lifecycle checkpoint, and late-retry classification after the full tombstone is gone.

## Why it matters and expected current-harness shortfall

RT-38 requires retaining full tombstones through an externally selected late-retry horizon but does
not let hosts reduce that retained state afterward without losing Aegis-verifiable lifecycle truth.
Current Aegis `403727ca4bab8435cfff47865ad666ce14099cd7` exposes no lifecycle-checkpoint contract,
compaction transition, or resolver that distinguishes an authenticated compacted retirement from
accidental deletion.

## Controls and arms

- `delete-retirement-control`: deletes the full retirement tombstone, modeling unauthenticated GC.
- `authenticated-checkpoint-fixture`: atomically replaces an exact full tombstone with a verified,
  self-binding compact lifecycle checkpoint and validates late reads deterministically.
- `aegis-wrapped`: invokes the real built Aegis hook public API from `AEGIS_HOOK_DIST`; absent APIs
  are measured red and are never reimplemented inside the Aegis arm.

## Deterministic ground truth and frozen scenarios

Machine-owned permit/approval/operation identity, terminal outcome/digest/revision, full tombstone or
compact checkpoint, verification bit, self-binding digest, and exact expected status/reason/retryable
triple own truth. No LLM judges success. The frozen seed has 18 scenarios:

1. exact committed checkpoint compaction;
2. exact failed checkpoint compaction;
3. idempotent exact checkpoint compaction;
4. late resolve after committed checkpoint;
5. late resolve after failed checkpoint;
6. late begin after checkpoint;
7. reselection after checkpoint (ABA attempt);
8. compaction while marker is still active;
9. compaction with wrong operation;
10. compaction with wrong permit;
11. compact checkpoint with wrong terminal outcome;
12. compact checkpoint with wrong receipt digest;
13. compact checkpoint with wrong terminal revision;
14. unverified checkpoint;
15. malformed/self-digest-mismatched checkpoint;
16. checkpoint-store unavailable;
17. checkpoint lost after compaction; and
18. an unrelated full retirement remains correctly classified.

The fixture must prove exact transition controls, idempotence, late classification, no retry/execute
authority, ABA prevention, strict authentication/binding, outage/loss safety, and operation isolation.

## Metrics and frozen thresholds

Primary `aegis-wrapped` thresholds:

- `compactionFailureDetectionRate === 1.0`
- `compactedAuthorityRestorationRate === 0.0`
- `resolutionAccuracy === 1.0`
- `retirementCompactionApiAvailability === 1.0`

Secondary thresholds: committed/failed/idempotent compaction, late committed/failed resolve, late
begin, ABA, active-marker rejection, operation/permit/outcome/digest/revision binding, verification,
self-digest, outage, checkpoint-loss safety and isolation must each equal `1.0`. Fixture metrics must
be fully green first. Thresholds and scenarios may not change after output is observed.

## Holdout discipline

No cadence or numeric cutoff is tuned. Scenario order, proof fields, expected outcomes and thresholds
are frozen. The named holdout remains unused unless future compaction/retention policy tuning occurs.

## Expected ownership boundary

Aegis owns additive strict checkpoint shape/digest validation, atomic exact tombstone-to-checkpoint
transition/readback contracts, late resolve/begin/reselection fail-closed policy, focused tests and a
release-gate case. Hosts own independent checkpoint authentication, linearizable transition,
cross-host visibility, retention horizon and physical deletion. Aegis does not choose production
TTLs or manufacture independence/authenticity.

## Exact commands

Baseline:

```bash
npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-25-exp48-baseline AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-25-exp48-baseline/packages/aegis/dist/index.js AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-25-exp48-baseline/packages/aegis-hook/dist/index.js node experiments/48-durable-strict-roster-retirement-compaction/dist/main.js
```

Post-fix:

```bash
npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-25-exp48 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-25-exp48/packages/aegis/dist/index.js AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-25-exp48/packages/aegis-hook/dist/index.js node experiments/48-durable-strict-roster-retirement-compaction/dist/main.js
```

Regression verification only after novel work:

```bash
npm run verify:evidence
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-09-25-exp48 run release:check
```
