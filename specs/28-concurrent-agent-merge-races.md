# Spec 28 — Concurrent Agent Merge Races (exp-22)

> New experiment. Scope: `experiments/22-concurrent-merge-races/`. Tests what fails when multiple
> agents modify the same repo or artifact concurrently.

## Question

Which coordination policy best prevents semantic regressions, duplicate work, and broken builds
when multiple agents work on related tasks in the same codebase?

## Why

As the fleet scales, failures move from individual reasoning to coordination: stale branches,
overlapping edits, semantic conflicts that Git does not detect, review races, and duplicated
implementation.

## Hypotheses

- **H-J1:** no coordination produces low text-conflict rates but high semantic-regression rates.
- **H-J2:** file locks reduce merge conflicts but increase idle time and do not catch semantic conflicts.
- **H-J3:** task-level leases plus post-merge verification outperform raw file locks.
- **H-J4:** independent reviewer agents catch more semantic conflicts than merge conflict detection alone.

## Setup

Create a toy repo with known tests and hidden semantic invariants. Dispatch multiple agents/tasks:

- overlapping files;
- separate files with shared invariants;
- duplicate feature requests;
- dependency/API changes;
- test updates racing implementation;
- one stale branch merging after assumptions changed.

Harness scores final repo state.

## Arms

1. No coordination.
2. File locks.
3. Task leases.
4. Branch-per-agent + merge queue.
5. Merge queue + independent semantic reviewer.
6. Shared claims/intent ledger before edits.

## Metrics

| metric | definition |
|---|---|
| buildBreakRate | final build/test failure |
| semanticRegressionRate | hidden invariant broken |
| textConflictRate | Git conflict frequency |
| duplicateWorkRate | same change implemented twice |
| staleAssumptionRate | agent acts on outdated repo state |
| idleCost | time/tokens spent waiting |
| recoveryTime | steps to restore green state |

## Required stack recommendation

Recommend when OpenClaw should use:

- branch-per-task;
- file locks;
- task leases;
- merge queue;
- semantic reviewer;
- shared intent ledger.

## Deliverables

1. `experiments/22-concurrent-merge-races/` harness and README.
2. Pinned traces.
3. SYNTHESIS RT-13.
4. JOURNAL entry.
5. Fleet coordination policy recommendation.

## Honesty rules

- Include semantic conflicts that Git cannot see.
- Do not count idle safety as free; measure throughput cost.
- Keep hidden tests hidden from worker agents but visible to harness.
