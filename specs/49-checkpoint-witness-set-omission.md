# Spec 49 - Checkpoint witness-set omission

**Pre-registered:** 2026-09-19T06:35:00Z, before implementation or baseline execution.  
**Experiment:** `experiments/43-checkpoint-witness-set-omission`  
**Seed:** `checkpoint-witness-set-omission-v1`  
**Holdout:** `checkpoint-witness-set-omission-holdout-v1` is reserved and unused.

## Question

Can Aegis detect when a host exposes only a safe-looking subset of independently
authenticated checkpoint authorities, or does the multi-authority checkpoint contract need an
explicit witness-set completeness policy before restoring terminal certainty, retry authority, or
execute permission?

## Why this matters

Exp-41 proved that a single independently retained checkpoint can reveal a coherent rollback of
the host authority plane. Exp-42 proved that two visible checkpoint authorities must not
equivocate on the same operation history. Neither experiment proves that the set of visible
authorities is complete. A compromised host can hide the authority that saw the later terminal
history and present only mutually consistent older witnesses. Without a signed or authenticated
witness-set contract, visible-authority consistency can become another green signal hiding an
omission.

## Expected current-harness shortfall

Current Aegis `8eb1c32dadf2a73e8e382a6657f8ca2096341ada` validates visible
`readEffectRevisionCheckpoints()` records for identity, operation binding, digest shape, duplicate
authorities, and same-revision equivocation. It does not expose or consume a machine-readable
expected witness-set contract, so a store that returns only `witness-a` and `witness-b` can look
consistent even when the deterministic ground truth requires `witness-c`.

## Arms

- `host-visible-subset-control`: a legacy host view that validates only the authorities it can see.
- `strict-witness-set-fixture`: deterministic fixture that knows the complete required witness set.
- `aegis-wrapped`: real built Aegis loaded from `AEGIS_REPO`, `AEGIS_DIST`, and `AEGIS_HOOK_DIST`.

## Ground Truth

Ground truth is deterministic scenario data: operation id, effect journal state, host high-water
revision, single checkpoint lower bound, visible authority checkpoints, required witness-set policy,
and exact expected `{status, reason, retryable}` triples. An LLM never judges success.

## Scenarios

The frozen seed set contains 14 scenarios:

- preservation controls: legacy current authorized, complete witness current authorized, complete
  witness committed, complete witness compacted terminal proof
- omission failures: authorized visible-subset omission, started visible-subset omission, terminal
  visible-subset omission, rollback hidden by omitted witness, post-CAS witness omission
- policy failures: witness-set unavailable, absent, unverified, duplicate id, missing minimum quorum

## Metrics and Thresholds

Primary pass/fail metrics for `aegis-wrapped`:

- `witnessOmissionDetectionRate` must equal `1.0`.
- `omissionRetryAuthorityRate` must equal `0.0`.
- `resolutionAccuracy` must equal `1.0`.
- `witnessSetApiAvailability` must equal `1.0`.

Secondary thresholds:

- Every preservation control must remain correct.
- Every unavailable, absent, unverified, duplicate, and minimum-quorum policy scenario must fail
  closed without retry authority.
- Post-CAS witness omission must block execute permission.
- ASK and consumed approval coverage must both equal `1.0`.

## Ownership Boundary

Aegis owns additive witness-set evidence adapters, strict validation, explicit public resolver
surface, and fail-closed policy before certainty or retry authority. Hosts own authenticating,
retaining, and completely exposing the witness-set policy and authority records outside the
rollback domain.

## Commands

Baseline and post-fix commands are intentionally identical except for the Aegis SHA checked out at
`AEGIS_REPO`:

```bash
npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-18-exp43 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-18-exp43/packages/aegis/dist/index.js AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-18-exp43/packages/aegis-hook/dist/index.js node experiments/43-checkpoint-witness-set-omission/dist/main.js
```

Regression verification after novel work:

```bash
npm run verify:evidence
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-09-18-exp43 run release:check
```

