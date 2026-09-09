# Spec 36 — Distributed execution-permit store

**Status:** pre-registered  
**Experiment:** `experiments/30-distributed-execution-permit-store/`  
**Seed:** `distributed-execution-permit-store-v1`

## Question and hypothesis

Can two Aegis hosts on independent filesystems enforce one globally one-shot approval execution permit, or can each host independently finalize the same exact-looking permit? This matters because RT-20's atomic rename is only atomic inside one shared filesystem namespace. **H-DP1:** the current local-directory API admits cross-host replay and duplicate concurrent execution. **H-DP2:** a host-supplied shared store with atomic create-if-absent and destructive take makes the same permit globally one-shot without blocking legitimate execution. **H-DP3:** invalid finalization burns the shared permit, duplicate creation is rejected, and unavailable storage fails closed.

This is distinct from exp-22 task leases (merge coordination), exp-28 delegated authority (who may consume), and exp-29 effect-boundary freshness/local replay (when one local permit may execute). No existing experiment tests one execution permit across independent storage namespaces.

## Expected current-harness shortfall

Aegis `origin/main` only persists `${permitId}.ready.json` and claims it with a local `renameSync`. Two hosts with separate approval directories can each create/finalize the same deterministic permit. There is no public transactional store adapter for shared global claim/burn semantics.

## Arms and controls

1. `host-local` — independent local Aegis approval directories; expected unsafe distributed baseline.
2. `shared-store-control` — deterministic fixture store with atomic create-if-absent and destructive take; validates the fixture/policy envelope.
3. `aegis-wrapped` — real built Aegis. Uses its public shared-store API when available; otherwise its current public local permit API across independent directories.

## Ground truth and scenarios

Success is computed only from deterministic booleans, exact counts, and thrown/rejected operations; no LLM judges output. Frozen scenarios:

1. unchanged authority finalizes once on host A (execute);
2. unchanged authority finalizes once on host B (execute);
3. host A executes, then host B replays the same permit (second blocks);
4. hosts A/B finalize concurrently (exactly one executes);
5. host A supplies an invalid rotated snapshot, then host B retries validly (both block because invalid use burns);
6. hosts A/B attempt duplicate creation for the same approval (exactly one creation admitted);
7. shared store is unavailable during finalization (block/fail closed).

`distributed-execution-permit-store-holdout-v1` is reserved and unused. Scenario roster, order, seed, and thresholds are frozen before baseline observation.

## Metrics and locked thresholds

Primary: cross-host replay execution rate, concurrent duplicate execution rate, invalid-burn replay execution rate, duplicate creation admission rate (unsafe second admission), storage-failure execution rate, legitimate execution block rate, distributed accuracy, and shared-store API availability. Secondary: real-Aegis ask/consume coverage.

Fixture validity requires every unsafe rate `= 0`, legitimate block `= 0`, accuracy `= 1`. Baseline is red if any Aegis-wrapped unsafe rate is `> 0`, legitimate block is `> 0`, accuracy is `< 1`, or shared-store API availability is `< 1`. Post-fix green requires all unsafe rates `= 0`, legitimate block `= 0`, accuracy and API availability `= 1`, with ask/consume coverage `= 1`. Thresholds will not move.

## Aegis ownership boundary

Aegis owns a public async execution-permit store contract, canonical immutable permit records, atomic create-if-absent and destructive one-shot take semantics, APIs that create/finalize through that store, ID and snapshot validation, burn-on-invalid-use, fail-closed storage error behavior at the host boundary, compatibility of existing local APIs, focused tests, and the RT-21 release gate. The host owns provisioning a durable/available shared transactional implementation and truthful fresh authority snapshots; Aegis does not claim distributed safety when a host chooses local storage or a non-atomic adapter.

## Exact commands

Baseline builds Aegis `108e49261d94d396a536e44196fd88d695d53610` in `/Users/beauxwalton/projects/worktrees/aegis-2026-09-08-exp30-baseline`, builds this SwarmLab worktree, then runs:

```bash
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-08-exp30-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-08-exp30-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-08-exp30-baseline/packages/aegis-hook/dist/index.js \
node experiments/30-distributed-execution-permit-store/dist/main.js
```

Post-fix repeats the exact command, seed, scenarios, order, and thresholds, replacing only the three baseline Aegis paths with `/Users/beauxwalton/projects/worktrees/aegis-2026-09-08-exp30`. Regression checks run only afterward.
