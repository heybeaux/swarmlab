# Spec 45 — Terminal write result attestation

**Status:** pre-registered  
**Experiment:** `experiments/39-terminal-write-attestation/`  
**Seed:** `terminal-write-attestation-v1`

## Question and hypothesis

Can Aegis distinguish a terminal store method *reporting* `committed` or `failed` from the exact caller-bound receipt actually being durably visible? This matters because a buggy adapter, stale primary, proxy, mock, or compromised store can return a positive enum without atomically retaining the submitted receipt. Aegis currently promotes that return value directly to `executed`/`failed`, turning an unverified acknowledgement into terminal certainty.

**H-TW1:** current Aegis trusts positive `completeEffect()` / `failEffect()` results without readback, so false-positive acknowledgements become terminal success or failure. **H-TW2:** current Aegis also trusts `already_committed` / `already_failed` without checking that the retained receipt exactly matches this caller. **H-TW3:** read-after-positive-result attestation against the existing durable journal can accept only the exact receipt, classify opposite/different terminal truth as conflict, and keep missing, malformed, nonterminal, or unavailable readback indeterminate while preserving honest/idempotent and negative store results.

## Novelty and expected shortfall

Exp-36/RT-27 reconciles a *thrown exception* after a terminal write by exact receipt readback. Exp-37/RT-28 validates record coherence when a caller separately resolves an effect. Exp-38/RT-29 tests causal replica revision. None checks the ordinary positive-return branch of `completeExecutionEffect()` or `failExecutionEffect()`: the write call returns a success enum, but durable state does not contain the exact receipt. This experiment changes the fault injection, public branch, metrics, and policy: positive terminal-write result attestation, not exception recovery, generic later resolution, field coherence, or replica revision.

## Frozen arms

1. `return-trusting-control` — maps the terminal store enum directly to public certainty.
2. `readback-attestation-fixture` — after a positive enum, accepts only an exact durable receipt; conflicts block and absent/unavailable proof stays indeterminate.
3. `aegis-wrapped` — real built Aegis public `completeExecutionEffect()` / `failExecutionEffect()` APIs over a deterministic store.

## Deterministic ground truth and frozen scenarios

No LLM judges success. Each scenario freezes the store return enum, post-call retained record, and expected public result. The retained journal is the machine-checkable ground truth.

1. `success-committed-exact` → `executed` (exact submitted success receipt retained).
2. `success-already-exact` → `executed` (exact receipt was already retained).
3. `success-committed-no-write` → `indeterminate/receipt_unverified`.
4. `success-already-different-receipt` → `blocked/receipt_conflict`.
5. `success-committed-nonterminal` → `indeterminate/receipt_unverified`.
6. `success-committed-read-unavailable` → `indeterminate/store_unavailable`.
7. `success-conflict` → `blocked/receipt_conflict` without requiring readback.
8. `success-not-started` → `blocked/effect_not_started` without requiring readback.
9. `failure-failed-exact` → `failed` (exact submitted negative receipt retained).
10. `failure-already-exact` → `failed` (exact negative receipt was already retained).
11. `failure-failed-no-write` → `indeterminate/receipt_unverified`.
12. `failure-already-different-receipt` → `blocked/receipt_conflict`.
13. `failure-failed-nonterminal` → `indeterminate/receipt_unverified`.
14. `failure-failed-read-unavailable` → `indeterminate/store_unavailable`.
15. `failure-conflict` → `blocked/receipt_conflict` without requiring readback.
16. `failure-not-started` → `blocked/effect_not_started` without requiring readback.

Scenario order is frozen as listed. `terminal-write-attestation-holdout-v1` is reserved and unused. No threshold, expected result, scenario, order, fixture rule, or expected classification may change after baseline observation.

## Locked metrics and thresholds

Primary: `falsePositiveTerminalRate`, `wrongReceiptAcceptanceRate`, `unverifiedPositiveRate`, `resolutionAccuracy`, and `attestationApiAvailability`. Secondary: `honestSuccessPreservation`, `honestFailurePreservation`, `idempotentSuccessPreservation`, `idempotentFailurePreservation`, `negativeResultPreservation`, `unavailableReadSafety`, `askCoverage`, and `consumeCoverage`.

Fixture validity and post-fix green require all three unsafe/error rates `= 0`; accuracy, API availability, all six preservation/safety metrics, ask coverage, and consume coverage `= 1`. Baseline is reproducibly red if any false positive or different receipt is accepted as this caller's terminal result, any positive result with absent/nonterminal proof is terminal, accuracy `< 1`, API availability `< 1`, or any preservation/safety metric `< 1`.

## Aegis ownership boundary

Aegis owns attesting every positive terminal-write result through the existing durable journal before returning terminal certainty; exact full receipt and permit/approval/operation binding; explicit conflict versus absent/unverified versus unavailable classification; both success and failure public boundaries; and focused regressions plus RT-30 evidence gating. The host owns atomic first-terminal-write semantics, honest enum results, durable exact-receipt retention, and read-after-write visibility. Aegis cannot repair a dishonest store, but it must not convert a positive adapter return into terminal certainty without observable receipt evidence.

## Exact commands

Baseline:

```bash
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-14-exp39-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-14-exp39-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-14-exp39-baseline/packages/aegis-hook/dist/index.js \
node experiments/39-terminal-write-attestation/dist/main.js
```

Post-fix repeats the exact command, seed, scenarios, order, fixtures, and thresholds, replacing only the three Aegis paths with `/Users/beauxwalton/projects/worktrees/aegis-2026-09-14-exp39`.
