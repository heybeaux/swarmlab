# Spec 44 — Monotonic effect-journal revision across replica rollback

**Status:** pre-registered  
**Experiment:** `experiments/38-monotonic-journal-revision/`  
**Seed:** `monotonic-journal-revision-v1`

## Question and hypothesis

Can Aegis refuse retry authority and terminal classification when a replica returns a coherent but causally stale effect record after a newer terminal revision exists? This matters because Spec 43 validates one record's internal state/receipt coherence, but a perfectly coherent older `authorized` snapshot can reappear during replica lag, rollback, failover, cache replay, or backup restore and look safely retryable even though another replica already committed or failed the effect.

**H-MJ1:** current Aegis validates record shape and receipt coherence but has no monotonic revision/high-water contract, so a stale coherent `authorized` record regains retry authority. **H-MJ2:** current Aegis misclassifies other coherent rollback and missing-replica views because it cannot distinguish absence/current state from causal regression. **H-MJ3:** an additive host-provided authoritative revision watermark, validated at every public journal read (including post-CAS readback), can fail closed on stale/invalid/unavailable revision truth while preserving current authorized, started, committed, and failed behavior.

## Novelty and expected shortfall

Exp-37/RT-28 tests *intra-record coherence*: state and retained receipt disagree in one read. This experiment keeps every stale record structurally valid and receipt-coherent, but compares its causal revision with an authoritative monotonic high-water mark. No prior experiment tests replica rollback, revision regression, terminal tombstones after a missing replica read, or revision failure at the `resolveExecutionEffect()` / `beginExecutionEffect()` boundary. The question, fault mechanism, scenarios, metrics, and proposed policy are distinct from split-brain field validation and acknowledgement reconciliation.

## Frozen arms

1. `replica-trusting-control` — classifies the visible coherent record without causal revision validation.
2. `monotonic-watermark-fixture` — compares the visible record revision with an authoritative high-water revision and fails closed on stale, invalid, missing, or unavailable revision truth.
3. `aegis-wrapped` — real built Aegis public `resolveExecutionEffect()` or `beginExecutionEffect()` API over a host store exposing `readEffectRevision()`.

## Deterministic ground truth and frozen scenarios

No LLM judges success. Each scenario fixes a visible replica record, authoritative high-water revision, and expected public result. Revisions are positive safe integers. A revision-capable store requires a valid record revision equal to its authoritative high-water mark; a lower revision or missing record under an existing high-water mark is stale; missing/malformed/ahead revision truth is inconsistent; an unavailable authoritative revision read is unavailable and non-retryable.

1. `current-authorized-r1` → `not_executed/not_started`, retryable.
2. `current-started-r2` → `indeterminate/effect_started`, not retryable.
3. `current-committed-r3` → `executed/effect_committed`, not retryable.
4. `current-failed-r3` → `not_executed/effect_failed`, not retryable.
5. `rollback-authorized-after-committed` (visible r1, high-water r3) → `indeterminate/journal_stale`, never retryable.
6. `rollback-authorized-after-failed` (visible r1, high-water r3) → `indeterminate/journal_stale`, never retryable.
7. `rollback-started-after-committed` (visible r2, high-water r3) → `indeterminate/journal_stale`.
8. `rollback-burned-after-failed` (visible r2, high-water r3) → `indeterminate/journal_stale`.
9. `missing-replica-terminal-watermark` (no visible record, high-water r3) → `indeterminate/journal_stale`.
10. `versioned-store-missing-record-revision` → `indeterminate/journal_inconsistent`.
11. `record-revision-ahead-of-watermark` (visible r4, high-water r3) → `indeterminate/journal_inconsistent`.
12. `revision-watermark-unavailable` → `indeterminate/journal_unavailable`.
13. `post-cas-rollback-after-terminal-race` — initial current authorized r1/high-water r1, failed begin CAS after a terminal r3 wins, then stale authorized r1/high-water r3 readback → `blocked/journal_stale`, never execute/retry.

Scenario order is frozen as listed. `monotonic-journal-revision-holdout-v1` is reserved and unused. No threshold, expected result, scenario, order, or fixture rule may change after baseline observation.

## Locked metrics and thresholds

Primary: `staleRetryAuthorityRate`, `staleClassificationErrorRate`, `revisionFailureUnsafeRate`, `resolutionAccuracy`, and `revisionApiAvailability`. Secondary: `currentAuthorizedPreservation`, `currentStartedPreservation`, `currentCommittedPreservation`, `currentFailedPreservation`, `postCasRollbackSafety`, `askCoverage`, and `consumeCoverage`.

Fixture validity and post-fix green require all three unsafe/error rates `= 0`; accuracy, revision API availability, all five preservation/safety metrics, ask coverage, and consume coverage `= 1`. Baseline is reproducibly red if either stale authorized view is retryable, any scenario 5–13 misses its frozen fail-closed classification, any malformed/ahead/unavailable revision case returns execute/retry, accuracy `< 1`, revision API availability `< 1`, or any preservation/safety metric `< 1`.

## Aegis ownership boundary

Aegis owns an additive revision-aware journal adapter contract; validating positive safe-integer record revisions against authoritative high-water truth at every public read; an explicit non-retryable stale classification; fail-closed handling for missing, malformed, ahead, and unavailable revision metadata; and focused regression tests including the post-CAS read. The host owns durable monotonic revision assignment, a linearizable/authoritative `readEffectRevision()` implementation or terminal tombstone, revision retention across compaction/failover/restore, and atomic state/receipt/revision writes. Aegis cannot repair or make a stale replica current, but it must not turn observable causal regression into execution authority or false terminal truth.

## Exact commands

Baseline:

```bash
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-13-exp38-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-13-exp38-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-13-exp38-baseline/packages/aegis-hook/dist/index.js \
node experiments/38-monotonic-journal-revision/dist/main.js
```

Post-fix repeats the exact command, seed, scenarios, order, fixtures, and thresholds, replacing only the three Aegis paths with `/Users/beauxwalton/projects/worktrees/aegis-2026-09-13-exp38`.
