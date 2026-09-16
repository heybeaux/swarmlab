# Spec 46 — Terminal receipt compaction proof

**Status:** pre-registered  
**Experiment:** `experiments/40-terminal-receipt-compaction-proof/`  
**Seed:** `terminal-receipt-compaction-proof-v1`

## Question and hypothesis

Can Aegis preserve attestable terminal success/failure after the full receipt-bearing journal record is deliberately compacted, without treating an unverifiable digest as proof or allowing a stale pre-terminal replica to regain retry authority? This matters because RT-28 through RT-30 correctly require exact terminal receipt evidence, but their current contract assumes the full record remains retrievable forever. Real durable journals compact; losing all attestable terminal truth can strand an effect that committed successfully, while accepting an unsigned or misbound tombstone would fabricate completion.

**H-TC1:** current Aegis has no compaction-proof API, so a pruned record with a retained high-water revision resolves as `indeterminate/journal_stale` and terminal write attestation degrades to `indeterminate/receipt_unverified` or `store_unavailable`. **H-TC2:** a host-authenticated terminal digest/tombstone, bound to operation, permit, approval, outcome, exact receipt digest, and monotonic terminal revision, can preserve terminal truth after pruning. **H-TC3:** Aegis must reject missing, unverified, malformed, wrong-operation, wrong-permit, wrong-approval, wrong-outcome, wrong-receipt, stale, future, and unavailable proofs, while preserving ordinary unpruned behavior and never making proof-only state retryable.

## Novelty and current-harness shortfall

Exp-37/RT-28 checks state/receipt coherence in a visible full record. Exp-38/RT-29 detects coherent stale replicas using a high-water revision. Exp-39/RT-30 attests positive terminal writes through exact full-record readback. None tests intentional removal of the full terminal record while retaining compact terminal evidence. This experiment changes the lifecycle event (compaction/pruning), source of truth (authenticated terminal proof plus revision), policy hook, public result path, and metrics; it is not a rename/reseed of receipt honesty or revision integrity.

## Frozen arms

1. `record-only-control` — current full-record/revision behavior with no compact-proof recovery.
2. `compaction-proof-fixture` — deterministic oracle that accepts only a verified, exactly bound, current terminal proof.
3. `aegis-wrapped` — real built Aegis public `resolveExecutionEffect()` plus new compaction-aware public capability when available.

## Deterministic ground truth and frozen scenarios

No LLM judges success. The host fixture freezes the visible record, authoritative high-water revision, optional compact proof, and expected public result. Proof verification is an explicit host boolean; Aegis owns binding and freshness checks rather than cryptographic key management.

1. `unpruned-success` → `executed/effect_committed`.
2. `unpruned-failure` → `not_executed/effect_failed`.
3. `pruned-success-valid-proof` → `executed/effect_committed`.
4. `pruned-failure-valid-proof` → `not_executed/effect_failed`.
5. `pruned-proof-missing` → `indeterminate/journal_stale`.
6. `pruned-proof-unverified` → `indeterminate/journal_inconsistent`.
7. `pruned-proof-malformed` → `indeterminate/journal_inconsistent`.
8. `pruned-proof-wrong-operation` → `indeterminate/journal_inconsistent`.
9. `pruned-proof-wrong-permit` → `indeterminate/journal_inconsistent`.
10. `pruned-proof-wrong-approval` → `indeterminate/journal_inconsistent`.
11. `pruned-proof-wrong-outcome` → `indeterminate/journal_inconsistent`.
12. `pruned-proof-wrong-receipt-digest` → `indeterminate/journal_inconsistent`.
13. `pruned-proof-stale-revision` → `indeterminate/journal_stale`.
14. `pruned-proof-future-revision` → `indeterminate/journal_inconsistent`.
15. `pruned-proof-read-unavailable` → `indeterminate/journal_unavailable`.
16. `stale-authorized-plus-valid-terminal-proof` → terminal result from the proof, never retryable.
17. `pruned-nonterminal-high-water` → `indeterminate/journal_stale`; compact proof is terminal-only and cannot authorize retry.

Scenario order is frozen as listed. `terminal-receipt-compaction-proof-holdout-v1` is reserved and unused. No threshold, expected result, order, fixture rule, proof field, or expected classification may change after baseline observation.

## Locked proof envelope

A compact proof contains `operationId`, `permitId`, `approvalId`, `outcome` (`committed` or `failed`), the exact terminal `receiptDigest`, optional `failureCode` for failure only, positive safe-integer `revision`, and `verified: true`. The host owns authenticating the proof before setting `verified`; Aegis owns strict shape, exact binding, outcome/receipt compatibility, revision equality to authoritative high-water truth, and fail-closed handling.

## Locked metrics and thresholds

Primary: `terminalProofRecoveryRate`, `falseTerminalProofAcceptanceRate`, `staleRetryAuthorityRate`, `resolutionAccuracy`, and `compactionProofApiAvailability`. Secondary: `unprunedSuccessPreservation`, `unprunedFailurePreservation`, `validCompactedSuccessPreservation`, `validCompactedFailurePreservation`, `missingProofFailClosedSafety`, `invalidProofFailClosedSafety`, `revisionSafety`, `unavailableProofSafety`, `terminalProofOverrideSafety`, `nonterminalProofSafety`, `askCoverage`, and `consumeCoverage`.

Fixture validity and post-fix green require proof recovery `= 1`; every unsafe/error rate `= 0`; accuracy/API availability and every preservation/safety/coverage metric `= 1`. Baseline is reproducibly red if recovery `< 1`, accuracy/API availability `< 1`, any unsafe/error rate `> 0`, or any secondary metric `< 1`.

## Aegis ownership boundary

Aegis owns an additive optional compact-proof store contract; strict proof validation and binding; proof-vs-revision classification; recovery in every public read boundary that would otherwise trust absence/staleness; no retry authority from proof-only state; focused tests; and RT-31 evidence gating. The host owns durable atomic compaction, authenticated proof production/retention, authoritative monotonic high-water revision, and proof-read availability. Aegis cannot make an unauthenticated tombstone trustworthy and must fail closed when proof or revision truth is unavailable.

## Exact commands

Baseline:

```bash
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-15-exp40-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-15-exp40-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-15-exp40-baseline/packages/aegis-hook/dist/index.js \
node experiments/40-terminal-receipt-compaction-proof/dist/main.js
```

Post-fix repeats the exact command, seed, scenarios, order, fixtures, proof fields, and thresholds, replacing only the three Aegis paths with `/Users/beauxwalton/projects/worktrees/aegis-2026-09-15-exp40`.
