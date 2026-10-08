# Spec 62 — Async source-policy gate input integrity (exp-56)

**Pre-registered:** 2026-10-07T06:34:32.734030+00:00, before implementation or baseline observation.
**Seed:** `async-gate-input-integrity-v1`. **Reserved holdout:** `async-gate-input-integrity-holdout-v1` (unused; no tuned policy).

## Question and unique hypothesis

Can an otherwise correct asynchronous source-policy roster checkpoint gate return allow for a LIVE tool call whose command or evidence changed while its durable I/O was awaited? Current Aegis `f37864f945fa914e56c4e1cc070c8874733d9f96` evaluates one mutable caller-owned object and creates its checkpoint proposal before awaiting read/observe/read, then returns that earlier Evaluation without validating that the live call still matches it.

This is not a renamed roster rollback experiment. Exp-55 changes independently retained checkpoint truth across calls; this experiment keeps host checkpoint operations valid and changes the caller-owned action/evidence object DURING one API invocation. Exp-29 checks newer approval/revocation snapshots at the execution boundary; no existing spec tests reference aliasing between async evaluate and the call it authorizes. RT-36/37 concern retaining strict execution policy selection, not mutating an in-flight evaluation input. Specs 24/25 and all roadmap reliability specs have built harnesses. Default next candidate durable source-policy capability downgrade is deferred: it closely parallels RT-36/37; in-flight input integrity is a distinct prerequisite before extending that boundary.

## Controls and arms

- `unguarded-control`: real built Aegis pure evaluate once before valid host read/observe/read; demonstrates stale evaluation, never counts as integration improvement.
- `input-integrity-fixture`: independent deterministic oracle scoring expected actions/state/write counts from scenario labels; NOT Aegis integration.
- `aegis-wrapped`: actual exported evaluateWithSourcePolicyRosterCheckpoint loaded from a real built Aegis artifact with SHA and full dist manifest. No fake local policy implementation. Both baseline and candidate invoke the SAME exported API and same harness.

## Ground truth and frozen scenarios

Host owns valid authenticated monotonic checkpoint (initial epoch 2) and calls scripted mutations before fulfilling an awaited read. All mutation timing is deterministic (no sleeps, no LLM judgments). The independent scorer checks live evidence/action, exact returned action, durable epoch and observe count; six input faults are otherwise legal JavaScript mutations of a public ToolCall.

Frozen ordered 18 scenarios:
1. unchanged current call — allow;
2. equivalent deep-cloned evidence replacement during first read — allow;
3-8. mutate after first read: stale observation, cached/observed version drift, policy-authority equivocation, coherent roster rollback, revoked fact, critical dangerous command. First five ask, critical command deny; observe count must be zero;
9-14. same six mutations immediately before final read fulfills (after observe). First five ask, critical command deny;
15. initial critical deny floor — deny, zero store operations;
16. explicit legacy ordinary evaluate on current input — allow;
17. initial read unavailable — ask, zero observes;
18. transient mutate-and-restore before first read resolves (ABA) — allow; intentionally demonstrates scope limit, not transient change detection.

Fixture must be perfect before trusting integration scores. Scenarios 3-14 are the unsafe mutation set. Each arm gets a fresh call and host. No tuning, scenario substitution, or threshold change after observation. Holdout reserved, not used: deterministic mechanism coverage, not statistical calibration.

## Frozen metrics and thresholds

Primary wrapped: `unsafeMutableInputAllowRate == 0`, `inputMutationDetectionRate == 1`, `resolutionAccuracy == 1`.
Secondary: `unchangedAllowance == 1`, `earlyMutationNoObserve == 1`, `criticalDenyPreservation == 1`, `legacyPreservation == 1`, `unavailableSafety == 1`, `transientAbaScopeControl == 1`, `noCheckpointRegression == 1`, `fixtureAccuracy == 1`, `replayVerified == 1`.
Exact deterministic ratios, no confidence interval or production generalization. Exit zero does not mean the experiment passed: inspect metrics and final state.

## Ownership boundary

Aegis owns private entry-time snapshots of the supported ToolCall data, pre/post-await live input validation, no checkpoint writes after an observed early mutation, fail-closed integrity escalation immune to permissive severity tables, and preservation of both original and newly observed deny floors. It must not mutate/freeze the caller's object. Host owns authentic durable checkpoint, valid plain-data input, truthful current metadata, and executing exactly the authorized call after return. Out of scope: arbitrary proxies/getter effects, mutations restored before any observation (ABA), and mutation/world changes AFTER the final guard/return. This does not make action execution transactional.

## Exact commands (from SwarmLab worktree)

```bash
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-06-exp56-baseline install --frozen-lockfile
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-06-exp56-baseline run build
npm install && npm run build && npm run typecheck
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-06-exp56-baseline AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-06-exp56-baseline/packages/aegis/dist/index.js node experiments/56-async-gate-input-integrity/dist/main.js
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-06-exp56 run build
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-06-exp56 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-06-exp56/packages/aegis/dist/index.js node experiments/56-async-gate-input-integrity/dist/main.js
```

Repeat baseline unchanged for reproducibility. Post-fix uses identical frozen scenarios/seed/thresholds. After novel work only: `npm run verify:evidence`; focused Aegis test then `npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-06-exp56 run release:check`. Existing evidence is regression verification, NOT novel evidence.
