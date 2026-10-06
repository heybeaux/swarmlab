# Spec 61 — Durable source-policy roster checkpoint (exp-55)

**Pre-registered:** 2026-10-06T06:33:47.975514+00:00, before harness implementation and observed results.
**Seed:** `source-policy-roster-checkpoint-v1`. **Reserved holdout:** `source-policy-roster-checkpoint-holdout-v1` (unused; no tuned policy).

## Question and unique hypothesis

Can a previously observed newer authenticated source-policy roster prevent a later internally coherent rollback of BOTH the caller's expected roster and presented roster across restart/handoff? Hypothesis: per-call RT-44 equality cannot reject such rollback; a strict Aegis public boundary must validate an independently authenticated durable monotonic roster checkpoint, with same-epoch digest conflict detection and exact readback after atomic host observation.

Why novel: exp-54 compares one call to caller-supplied current truth. Exp-55 instead preserves a cross-call lower bound, uses an async durable-store boundary, and tests restored expectations, checkpoint write lies, acknowledgement loss and races. RT-29/32 concern execution-journal history, RT-36/37 select execution policy, not source-policy roster history. Specs 24/25 and roadmap successors are built; all existing specs/experiment questions and claims inspected.

## Expected current-harness shortfall

Merged Aegis `c8fe1b06ff9da1134f7ca64282c9776dd1cd1b6f` validates exact RT-44 roster evidence but has no durable source-policy checkpoint boundary. A caller can restore both expected and presented epoch 1 after epoch 2 was independently observed and still get allow.

## Controls and arms

- `per-call-control`: real built Aegis evaluate, no durable checkpoint boundary.
- `durable-checkpoint-fixture`: machine-owned oracle consumes host checkpoint/fault scenario, never counted as Aegis integration.
- `aegis-wrapped`: real public built Aegis strict async checkpoint API when present; otherwise real evaluate (missing API is measured red, not simulated). Same frozen scenarios in all arms.

## Deterministic ground truth and frozen scenarios

Host adapter retains authenticated checkpoint in a durable map; JSON serialize/deserialize models restart. Atomic observe never regresses epochs and never replaces same-epoch differing digest. All presented calls are otherwise valid RT-44. Scorer owns initial high-water, faults, expected actions, and resulting state. No LLM judges success.

Ordered 22 scenarios (allow unless explicitly ask):
1. initialize epoch 1;
2. same epoch/digest replay;
3. advance epoch 1 to epoch 2;
4. coherent epoch 1 rollback after epoch 2 — ask;
5. coherent rollback after serialized restart/cross-host handoff — ask;
6. same-epoch different member digest — ask;
7. checkpoint unauthenticated — ask;
8. checkpoint disappears after positive observe — ask;
9. checkpoint foreign roster identity — ask;
10. checkpoint invalid non-positive epoch — ask;
11. checkpoint malformed digest — ask;
12. initial checkpoint read unavailable — ask;
13. observe commits then loses acknowledgement, exact authenticated readback — allow;
14. observe fails before commit, absent readback — ask;
15. positive observe acknowledgement without durable persistence — ask;
16. newer epoch races before post-observe readback — ask;
17. member order permutation preserves digest — allow;
18. restored current epoch 2 after rollback — allow;
19. strict wrapper without roster evidence — ask;
20. ordinary legacy evaluate without checkpoint still allows;
21. RT-41 stale observation — ask;
22. RT-43 authority disagreement — ask.

No scenario, seed, oracle, or threshold changes after baseline. Faults are host-contract violations deliberately injected, not hidden fixture bugs; normal host persists/reads exactly and the fixture must stay green.

## Metrics and frozen thresholds

Primary wrapped: `unsafeCheckpointAllowRate === 0`; `checkpointFailureDetectionRate === 1`; `resolutionAccuracy === 1`; `checkpointApiAvailability === 1`.
Secondary each equals 1: `validTransitionAllowance`, `restartRollbackSafety`, `sameEpochForkSafety`, `ackLossRecovery`, `falseAcknowledgementSafety`, `raceSafety`, `legacyPreservation`, `earlierPolicyPreservation`, `noCheckpointRegression`, `fixtureAccuracy`, `replayVerified`. Metrics finite exact deterministic ratios; no probability/calibration or production DB claim.

## Ownership boundary

Aegis owns additive public checkpoint/store types, strict async evaluate boundary, authentic checkpoint shape/identity/positive epoch/digest validation, monotonic comparison, same-epoch conflict refusal, exact post-observe readback, fail-closed missing/unavailable/incoherent evidence, and earlier rule-floor preservation. It never self-certifies `authenticated:true` in its proposal.
Hosts own independent durable checkpoint authentication, atomic monotonic observe, linearizable shared reads, restart/handoff retention, stable identity, complete membership, epoch allocation and truthful current inputs. Aegis cannot defeat rollback of the independent checkpoint itself or colluding authorities. Ordinary pure evaluate remains backward compatible, not claimed durable-safe.

## Exact commands

```bash
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-05-exp55-roster-checkpoint-baseline install --frozen-lockfile
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-05-exp55-roster-checkpoint-baseline run build
npm install && npm run build && npm run typecheck
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-05-exp55-roster-checkpoint-baseline AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-05-exp55-roster-checkpoint-baseline/packages/aegis/dist/index.js node experiments/55-source-policy-roster-checkpoint/dist/main.js
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-05-exp55-roster-checkpoint run build
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-05-exp55-roster-checkpoint AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-05-exp55-roster-checkpoint/packages/aegis/dist/index.js node experiments/55-source-policy-roster-checkpoint/dist/main.js
```

After novel work only: `npm run verify:evidence` and `pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-05-exp55-roster-checkpoint run release:check`. Existing evidence checks are regressions, not tonight's novel evidence.
