# Spec 50 - Checkpoint witness roster epoch

**Pre-registered:** 2026-09-20T06:32:39Z, before implementation or baseline execution.  
**Experiment:** `experiments/44-checkpoint-witness-roster-epoch`  
**Seed:** `checkpoint-witness-roster-epoch-v1`  
**Holdout:** `checkpoint-witness-roster-epoch-holdout-v1` is reserved and unused.

## Question

Can Aegis detect when a host presents a complete and mutually consistent checkpoint witness set
from an obsolete roster epoch, while the independently retained current roster requires a different
authority set, or does the witness-set contract need a roster epoch/digest boundary before restoring
terminal certainty, retry authority, or execute permission?

## Why this matters

Exp-43 proved that Aegis needs the complete required witness set, not only the visible authorities.
It did not prove that the witness-set policy itself is fresh. A compromised host can present a
complete old roster, for example `witness-a` and `witness-b`, while hiding the current roster epoch
that added `witness-c`. All visible authorities agree and the old witness set is complete, so the
current harness can turn green while the real authority membership has rolled back.

## Expected current-harness shortfall

Current Aegis `c2fc0f1f1fb41e4c0e8ac59db8f1705530878b0e` validates visible checkpoint authority
records and an optional `readEffectRevisionWitnessSet()` result for membership completeness. It
does not expose or consume a separate current-roster epoch/digest contract, so a complete obsolete
witness set can look authoritative even when deterministic ground truth says the roster epoch has
advanced or split.

## Arms

- `host-old-roster-control`: a legacy host view that accepts a complete obsolete visible roster.
- `strict-roster-epoch-fixture`: deterministic fixture that compares visible witness policy with
  independently retained current roster truth.
- `aegis-wrapped`: real built Aegis loaded from `AEGIS_REPO`, `AEGIS_DIST`, and `AEGIS_HOOK_DIST`.

## Ground Truth

Ground truth is deterministic scenario data: operation id, effect journal state, host high-water
revision, single checkpoint lower bound, visible authority checkpoints, visible witness-set policy,
independent current witness roster, and exact expected `{status, reason, retryable}` triples. An
LLM never judges success.

## Scenarios

The frozen seed set contains 16 scenarios:

- preservation controls: legacy current authorized, complete current roster authorized, complete
  current roster committed, complete current roster compacted terminal proof
- roster split failures: old-roster authorized, old-roster started, old-roster terminal,
  current-roster-hidden rollback, roster-digest mismatch, roster-epoch rollback, and post-CAS
  roster split
- policy failures: roster truth unavailable, absent, unverified, duplicate id, and missing minimum
  quorum

## Metrics and Thresholds

Primary pass/fail metrics for `aegis-wrapped`:

- `rosterSplitDetectionRate` must equal `1.0`.
- `rosterSplitRetryAuthorityRate` must equal `0.0`.
- `resolutionAccuracy` must equal `1.0`.
- `witnessRosterApiAvailability` must equal `1.0`.

Secondary thresholds:

- Every preservation control must remain correct.
- Every unavailable, absent, unverified, duplicate, and minimum-quorum roster policy scenario must
  fail closed without retry authority.
- Post-CAS roster split must block execute permission.
- ASK and consumed approval coverage must both equal `1.0`.

## Ownership Boundary

Aegis owns additive roster-epoch evidence adapters, strict validation, explicit public resolver
surface, and fail-closed policy before certainty or retry authority. Hosts own authenticating,
retaining, and completely exposing current roster truth outside the rollback domain.

## Commands

Baseline and post-fix commands are intentionally identical except for the Aegis SHA checked out at
`AEGIS_REPO`:

```bash
npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-19-exp44 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-19-exp44/packages/aegis/dist/index.js AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-19-exp44/packages/aegis-hook/dist/index.js node experiments/44-checkpoint-witness-roster-epoch/dist/main.js
```

Regression verification after novel work:

```bash
npm run verify:evidence
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-09-19-exp44 run release:check
```
