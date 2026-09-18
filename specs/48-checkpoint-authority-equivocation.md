# Spec 48 - Checkpoint authority equivocation

> New experiment. Scope: `experiments/42-checkpoint-authority-equivocation/`.
> Pre-registered 2026-09-18T06:44:00Z before implementation, baseline execution, or threshold tuning.

## Question

Can Aegis detect equivocation when two independently authenticated checkpoint authorities present conflicting same-operation histories, or does authority-plane rollback protection need an explicit multi-authority consistency contract?

## Why this matters

Spec 47 / exp-41 proved that a single independent checkpoint can detect a coherent restore that rolls back the host journal, high-water mark, and compact terminal proof. That fix still assumes one authenticated checkpoint authority. A production transparency plane may have multiple retained authorities, replicas, witnesses, or roots. If one authority reports a valid-looking old history while another reports a valid-looking incompatible history, accepting whichever checkpoint the host returns first can restore retry authority or terminal certainty from an equivocated history.

This is not a replay of exp-41. Exp-41 asks whether one independent lower bound exists. This spec asks whether multiple independently valid checkpoint authorities agree on the same operation history before Aegis treats any single lower bound as sufficient.

## Hypothesis

Current Aegis will pass single-checkpoint rollback cases but will fail to detect multi-authority equivocation because `AnchoredApprovalExecutionPermitStore.readEffectRevisionCheckpoint()` returns one checkpoint and carries no authority identity or history digest. A strict multi-authority fixture will fail closed on conflicting checkpoint histories. Aegis should gain an additive evidence adapter or policy hook that validates all host-exposed checkpoint authorities before returning terminal certainty, retry authority, or execute permission.

## Current-harness shortfall expected

The current harness validates:

- one authenticated checkpoint object;
- exact operation binding;
- positive integer revision lower bound;
- verified bit;
- absence/unavailability/malformed single-checkpoint failures.

It does not validate:

- multiple checkpoint authorities for the same operation;
- duplicate authority identities;
- conflicting same-revision history digests;
- conflicting old/new histories hidden behind the first returned checkpoint;
- post-CAS equivocation after an apparently clean pre-start check.

## Arms and controls

1. `host-single-checkpoint-control` - host behavior that trusts the single checkpoint selected by the replica.
2. `multi-authority-fixture` - deterministic strict policy that reads every authority record and fails closed on conflict.
3. `aegis-wrapped` - real built Aegis and real `@heybeaux/aegis-hook` public APIs loaded from `AEGIS_REPO`.

## Ground truth

Ground truth is machine-owned scenario data:

- host effect state;
- host high-water revision;
- host single-checkpoint view;
- independent multi-authority checkpoint records;
- exact expected resolution/finalization status, reason, and retryability.

No LLM judges success. A scenario is correct only when the actual status, reason, and retryability exactly match the predeclared expected triple.

## Frozen scenarios

Seed: `checkpoint-authority-equivocation-v1`.

Scenarios:

1. `legacy-current-authorized`
2. `single-anchor-current-authorized`
3. `multi-consistent-current-authorized`
4. `multi-lagging-current-success`
5. `multi-consistent-compacted-success`
6. `equivocated-authorized-same-revision`
7. `equivocated-started-same-revision`
8. `equivocated-terminal-same-revision`
9. `equivocated-rollback-hidden-by-first`
10. `quorum-unavailable`
11. `quorum-absent`
12. `quorum-unverified`
13. `quorum-duplicate-authority`
14. `quorum-wrong-operation`
15. `quorum-malformed-digest`
16. `post-cas-equivocation`

Expected safety cases:

- equivocation scenarios must return `indeterminate/journal_inconsistent/retryable=false`, except `post-cas-equivocation`, which must return `blocked/journal_inconsistent/retryable=false`;
- absence or unavailability of multi-authority truth must return unavailable status, not retry authority;
- non-equivocated current, lagging, compacted, and legacy scenarios must preserve exp-41 behavior.

## Metrics and thresholds

Primary metrics:

- `checkpointEquivocationDetectionRate` must be `1.0`;
- `equivocationRetryAuthorityRate` must be `0.0`;
- `resolutionAccuracy` must be `1.0`;
- `multiAuthorityCheckpointApiAvailability` must be `1.0`.

Secondary preservation/safety metrics must all be `1.0`:

- `legacyPreservation`;
- `singleAnchorPreservation`;
- `multiConsistentPreservation`;
- `terminalPreservation`;
- `compactedTerminalPreservation`;
- `unavailableQuorumSafety`;
- `absentQuorumSafety`;
- `invalidQuorumSafety`;
- `postCasEquivocationSafety`;
- `askCoverage`;
- `consumeCoverage`.

Baseline is `reproducible-red` if the strict fixture is green and real current Aegis misses at least one equivocation safety metric. If Aegis passes all metrics, record an honest null result and do not patch.

## Holdout discipline

The admitted run uses only `checkpoint-authority-equivocation-v1`. `checkpoint-authority-equivocation-holdout-v1` is reserved and unused unless a future policy is tuned on this scenario roster. Thresholds above are frozen before observing output and must not be moved.

## Expected Aegis ownership boundary

Aegis owns:

- the optional public adapter contract for multi-authority checkpoint evidence;
- strict shape, authority identity, digest, operation, verification, duplicate, and conflict validation;
- fail-closed policy at resolution, begin, and terminal attestation boundaries.

The host owns:

- authenticating checkpoint authorities;
- retaining them outside the rollback domain;
- supplying truthful complete authority records.

Aegis cannot detect equivocation if the host exposes only one authority or if all authorities collude and return the same rolled-back history.

## Commands

Baseline:

```bash
npm run build
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-17-exp42 \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-17-exp42/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-17-exp42/packages/aegis-hook/dist/index.js \
node experiments/42-checkpoint-authority-equivocation/dist/main.js
```

Post-fix:

```bash
npm run build
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-17-exp42 \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-17-exp42/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-17-exp42/packages/aegis-hook/dist/index.js \
node experiments/42-checkpoint-authority-equivocation/dist/main.js
```

Regression verification after novel work:

```bash
npm run verify:evidence
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-09-17-exp42 run release:check
```
