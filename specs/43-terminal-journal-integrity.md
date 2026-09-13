# Spec 43 — Terminal journal integrity under split-brain readback

**Status:** pre-registered  
**Experiment:** `experiments/37-terminal-journal-integrity/`  
**Seed:** `terminal-journal-integrity-v1`

## Question and hypothesis

Can Aegis reconcile an effect only when terminal state and its exact retained verified receipt form one coherent record, or can a torn/split-brain journal read make it assert success/failure or authorize retry from contradictory fragments? This matters because RT-27 assumes the host atomically persists terminal state and receipt, but storage migrations, partial projections, corrupt replicas, and non-atomic adapters can violate that assumption at the read boundary.

**H-TJ1:** current Aegis `resolveExecutionEffect()` trusts `committed` and `failed` state alone, so terminal state without the corresponding receipt becomes false certainty. **H-TJ2:** current Aegis may mark an `authorized` record retryable even when a terminal receipt fragment is already present. **H-TJ3:** a general read-integrity validator can fail closed on every incoherent state/receipt combination while preserving coherent success, coherent failure, clean authorized retry, and clean started uncertainty.

## Novelty and expected shortfall

Exp-32 introduced a retained effect journal; exp-34/35 bound ordinary success/failure writes; exp-36 reconciled write exceptions by matching a caller-supplied receipt. None tests the generic read-side resolver against a record whose state and retained receipt fields disagree. This experiment changes the question, fault mechanism, metrics, and policy under test: durable record coherence, not acknowledgement recovery.

## Frozen arms

1. `state-only-control` — trusts terminal state and clean authorized state without checking receipt coherence.
2. `coherence-fixture` — deterministic validator requires exactly one valid receipt for its matching terminal state and no receipt for a nonterminal state.
3. `aegis-wrapped` — real built Aegis public `resolveExecutionEffect()` API.

## Deterministic ground truth and frozen scenarios

No LLM judges success. The fixture directly constructs the durable record returned by `readEffect()` and owns the expected resolution.

1. `coherent-committed-success` → `executed/effect_committed`.
2. `coherent-failed-negative` → `not_executed/effect_failed`.
3. `clean-authorized` → `not_executed/not_started`, retryable.
4. `clean-started` → `indeterminate/effect_started`, not retryable.
5. `committed-missing-success-receipt` → `indeterminate/journal_inconsistent`.
6. `failed-missing-failure-receipt` → `indeterminate/journal_inconsistent`.
7. `committed-opposite-failure-receipt` → `indeterminate/journal_inconsistent`.
8. `failed-opposite-success-receipt` → `indeterminate/journal_inconsistent`.
9. `committed-both-receipts` → `indeterminate/journal_inconsistent`.
10. `failed-both-receipts` → `indeterminate/journal_inconsistent`.
11. `committed-malformed-success-receipt` → `indeterminate/journal_inconsistent`.
12. `failed-misbound-failure-receipt` → `indeterminate/journal_inconsistent`.
13. `authorized-with-success-receipt` → `indeterminate/journal_inconsistent`, never retryable.
14. `started-with-failure-receipt` → `indeterminate/journal_inconsistent`, never retryable.

A valid retained receipt must be an object, bind the current permit/approval/operation, carry a lowercase `sha256:` digest with 64 hex characters, and have `verified === true`; failure receipts additionally require a stable `[a-z0-9_]{1,64}` failure code. Scenario order is frozen as listed. `terminal-journal-integrity-holdout-v1` is reserved and unused. No threshold, fixture, order, or expected result may change after baseline observation.

## Locked metrics and thresholds

Primary: `falseTerminalCertaintyRate`, `unsafeRetryRate`, `integrityClassificationErrorRate`, `resolutionAccuracy`, and `integrityApiAvailability`. Secondary: `coherentSuccessPreservation`, `coherentFailurePreservation`, `cleanRetryPreservation`, `startedFailClosedSafety`, `askCoverage`, and `consumeCoverage`.

Fixture validity and post-fix green require all three unsafe/error rates `= 0`; accuracy, API availability, all four preservation/safety metrics, ask coverage, and consume coverage `= 1`. Baseline is reproducibly red if any incoherent terminal record resolves definitively, any receipt-bearing nonterminal record is retryable, accuracy `< 1`, API availability `< 1`, or any preservation/safety metric `< 1`.

## Aegis ownership boundary

Aegis owns structural coherence validation at every public effect-journal read boundary, explicit fail-closed classification for inconsistent records, receipt shape/binding validation, no retry from terminal receipt fragments, and focused regression tests. The host owns atomic state+receipt writes, durable exact bytes, linearizable readback, repair/quarantine of corrupt data, and never intentionally producing these split-brain records. Aegis must not convert host corruption into claimed terminal truth or new execution authority.

## Exact commands

Baseline:

```bash
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-12-exp37-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-12-exp37-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-12-exp37-baseline/packages/aegis-hook/dist/index.js \
node experiments/37-terminal-journal-integrity/dist/main.js
```

Post-fix repeats the exact command, seed, scenarios, order, records, and thresholds, replacing only the three Aegis paths with `/Users/beauxwalton/projects/worktrees/aegis-2026-09-12-exp37`.
