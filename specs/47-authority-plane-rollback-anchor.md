# Spec 47 — Authority-plane rollback anchor

**Status:** pre-registered  
**Experiment:** `experiments/41-authority-plane-rollback-anchor/`  
**Seed:** `authority-plane-rollback-anchor-v1`

## Question and hypothesis

Can Aegis detect a coherent backup restore that rolls back both the visible execution journal and its host-owned authoritative revision/terminal-proof plane, or must it compare that plane with an independently retained transparency checkpoint before restoring retry authority? This matters because RT-29 detects a stale replica only while host high-water truth survives, and RT-31 preserves compacted terminal truth only while the host proof/high-water survives. A backup restore can make the old record, old high-water, and old proof mutually consistent while erasing a newer terminal outcome.

**H-AR1:** current Aegis trusts the host-owned high-water as the final causal authority, so a coherently restored `authorized` record at revision 1 is incorrectly retryable even when an external append-only checkpoint proves the operation reached revision 3. **H-AR2:** an optional host adapter for an independently authenticated monotonic checkpoint can detect authority-plane rollback without rejecting a current record merely because the checkpoint lags. **H-AR3:** unavailable, absent, malformed, unverified, misbound, or impossible checkpoints must fail closed; a checkpoint must never manufacture terminal success/failure or create retry authority.

## Novelty and current-harness shortfall

Exp-37/RT-28 tests torn fields in a visible terminal record. Exp-38/RT-29 tests record rollback while host high-water truth remains current. Exp-39/RT-30 tests terminal-write acknowledgement against readback. Exp-40/RT-31 tests full-record compaction while host high-water and authenticated terminal proof remain current. This experiment rolls back **all host-owned authority state together** and introduces an independent lower-bound checkpoint. The question, failure mechanism, trust boundary, public adapter, scenarios, and metrics are distinct; this is not a reseed or replay of RT-29/31.

## Frozen arms

1. `host-authority-control` — resolves from visible record plus host high-water/proof only.
2. `transparency-anchor-fixture` — deterministic oracle treats a verified external checkpoint as a monotonic lower bound on host revision.
3. `aegis-wrapped` — real built Aegis public resolution/start APIs and a new anchor-aware public capability when available.

## Deterministic ground truth and frozen scenarios

No LLM judges success. The fixture owns journal records, host high-water/proofs, independently retained checkpoint, and exact expected public result. `verified: true` means the external checkpoint adapter authenticated the checkpoint; Aegis owns strict shape, operation binding, safe revision comparison, and fail-closed classification.

Scenario order is frozen:

1. `legacy-current-authorized` → `not_executed/not_started`, retryable true (non-anchor legacy preservation).
2. `anchored-current-authorized` → `not_executed/not_started`, retryable true.
3. `anchored-current-success` → `executed/effect_committed`, retryable false.
4. `anchored-current-compacted-success` → `executed/effect_committed`, retryable false.
5. `anchor-lags-current-success` → `executed/effect_committed`, retryable false; a checkpoint is a lower bound, not an equality lock.
6. `restore-authorized-below-anchor` → `indeterminate/journal_stale`, retryable false.
7. `restore-started-below-anchor` → `indeterminate/journal_stale`, retryable false.
8. `restore-missing-below-anchor` → `indeterminate/journal_stale`, retryable false.
9. `restore-stale-proof-below-anchor` → `indeterminate/journal_stale`, retryable false.
10. `checkpoint-unavailable` → `indeterminate/journal_unavailable`, retryable false.
11. `checkpoint-absent` → `indeterminate/journal_unavailable`, retryable false.
12. `checkpoint-unverified` → `indeterminate/journal_inconsistent`, retryable false.
13. `checkpoint-malformed-revision` → `indeterminate/journal_inconsistent`, retryable false.
14. `checkpoint-wrong-operation` → `indeterminate/journal_inconsistent`, retryable false.
15. `checkpoint-extra-property` → `indeterminate/journal_inconsistent`, retryable false.
16. `host-revision-unavailable-with-anchor` → `indeterminate/journal_unavailable`, retryable false.
17. `post-cas-authority-rollback` → begin is blocked `journal_stale`, never `execute`.

`authority-plane-rollback-anchor-holdout-v1` is reserved and unused. No scenario, order, expected result, checkpoint field, fixture rule, metric, or threshold may change after baseline observation.

## Locked checkpoint envelope

`ApprovalExecutionRevisionCheckpoint` contains exactly `operationId`, positive safe-integer `revision`, and `verified: true`. The checkpoint is an authenticated, append-only, independently retained lower bound: host revision `< checkpoint.revision` proves rollback; host revision `>= checkpoint.revision` is not rollback. The host owns authenticating and monotonically retaining it outside the journal backup/restore domain. Aegis owns strict shape, exact operation binding, lower-bound comparison, and fail-closed handling. It does not infer terminal outcome from a revision-only checkpoint.

## Locked metrics and thresholds

Primary: `authorityRollbackDetectionRate`, `rollbackRetryAuthorityRate`, `resolutionAccuracy`, and `transparencyCheckpointApiAvailability`. Secondary: `legacyPreservation`, `currentAuthorizedPreservation`, `currentTerminalPreservation`, `currentCompactedPreservation`, `laggingCheckpointPreservation`, `unavailableCheckpointSafety`, `absentCheckpointSafety`, `invalidCheckpointSafety`, `hostRevisionUnavailableSafety`, `postCasRollbackSafety`, `askCoverage`, and `consumeCoverage`.

Fixture validity and post-fix green require rollback detection `= 1`; rollback retry authority `= 0`; accuracy/API availability and every secondary metric `= 1`. Baseline is reproducibly red if rollback detection `< 1`, accuracy/API availability `< 1`, rollback retry authority `> 0`, or any secondary metric `< 1`.

## Aegis ownership boundary

Aegis owns an additive optional independently checkpointed store contract; strict checkpoint validation; lower-bound comparison at every public resolution/start read including failed-CAS readback; non-retryable stale classification; backward compatibility for stores without the capability; focused tests; and RT-32 evidence gating. The host owns atomic journal/proof storage, backup/restore, independent append-only checkpoint durability/authentication, and checkpoint availability. Aegis cannot detect rollback if every authority source, including the independent checkpoint, is rolled back together.

## Exact commands

Baseline:

```bash
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-16-exp41-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-16-exp41-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-16-exp41-baseline/packages/aegis-hook/dist/index.js \
node experiments/41-authority-plane-rollback-anchor/dist/main.js
```

Post-fix repeats the exact command, seed, scenarios, order, fixtures, checkpoint fields, and thresholds, replacing only the three Aegis paths with `/Users/beauxwalton/projects/worktrees/aegis-2026-09-16-exp41`.
