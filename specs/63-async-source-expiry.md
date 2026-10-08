# Spec 63 — Async source-observation expiry (exp-57)

**Pre-registered:** 2026-10-08T06:35:44.510364+00:00, BEFORE implementation and baseline output.
**Seed/scenario family:** `async-source-expiry-v1`. Reserved holdout `async-source-expiry-holdout-v1` remains unused: deterministic coverage, no tuned policy.
**Current Aegis baseline:** `1550e6ed8a660febee30ce6fe291f41b87bf1bf1` (origin/main after green carry-over PR62 was merged).

## Unique hypothesis and expected shortfall

An immutable fresh source observation can expire while `evaluateWithSourcePolicyRosterCheckpoint` awaits authentic durable checkpoint I/O. Both ToolCall and policy stay unchanged. RT41 validates caller-supplied timestamps synchronously; RT45 adds durable roster truth; RT46 detects input mutation but expressly leaves stable clocks untouched. None measures elapsed gate time. Scanning every existing spec, experiment README, claims ledger and recent nightly ledgers found no latency-expiry experiment. This differs from exp26 approval expiry (approval wall-time validity), exp55 checkpoint rollback, and exp56 reference aliasing: source version truth expires merely through awaited latency, WITHOUT changed input. Rules/options mutation is deferred to tomorrow.

## Arms, ground truth and frozen scenarios

Three arms: `entry-only-control` (real pure evaluate on unchanged input); `elapsed-fixture` (independent integer-clock oracle; not integration); `aegis-wrapped` (real built exported async API, with an optional injected `monotonicNowMs` clock in its fourth argument; baseline ignores it). Full package manifest/source SHA captured; no local Aegis policy copy.

A deterministic host with valid epoch2 checkpoint advances a separate clock inside scripted read/observe callbacks. No sleeps or LLM judges. Initial source checkedAt1000/actionAt1010/maxAge100 means age10 and budget90. Oracle uses age + elapsed, and checks action AND observes/reads. Frozen ordered20 scenarios:
1 unchanged clock allow;
2 first-read elapsed90 inclusive allow;
3 first-read elapsed91 ask, zero observes;
4 observe elapsed91 ask, one observe/no final read;
5 final-read elapsed91 ask;
6 cumulative first30/observe60/final91 ask;
7 final-read elapsed90 inclusive allow;
8 initial age100 + elapsed1 ask before observe;
9 initial age0/maxAge0/elapsed0 allow;
10 initial age0/maxAge0/elapsed1 ask before observe;
11 fresh adopted observed/cached version8, elapsed20 allow;
12 monotonic clock regresses after first read ask/no observe;
13 first-read clockNaN ask/no observe;
14 first-read clockInfinity ask/no observe;
15 first-read clock throws ask/no observe;
16 entry clockNaN ask/no I/O;
17 initial critical deny unchanged/no I/O/clock must not weaken deny;
18 explicit pure-evaluate legacy ignoring elapsed1000 allow;
19 first store read unavailable ask/no observe;
20 commit succeeded/observe acknowledgement lost, elapsed91 ask/no final read.

Each arm gets a fresh unchanged deep-cloned call and host. Hazards3,4,5,6,8,10,12,13,14,15,16,20 must be ask. Ground truth is integer elapsed from entry plus submitted initial observation age. Critical17 deny, controls as listed. Frozen thresholds never change after observation.

## Metrics and exact pass/fail thresholds

Primary wrapped: `unsafeExpiredAllowRate == 0` (hazards), `failureDetectionRate == 1`, `resolutionAccuracy == 1`.
Secondary: `inclusiveBoundaryAllowance == 1`, `earlyExpiryNoObserve == 1`, `postObserveExpiryNoRead == 1`, `clockFailureSafety == 1`, `criticalDenyPreservation == 1`, `legacyPreservation == 1`, `unavailableSafety == 1`, `unchangedInput == 1`, `noCheckpointRegression == 1`, `fixtureAccuracy == 1`, full trace replay equality.

## Ownership and general behavior contract

Aegis owns an additive optional monotonic clock for deterministic host/testing, a default real monotonic clock, private entry-time clock/config capture, observation age plus elapsed at every awaited boundary, inclusive age boundary, fail-closed invalid/non-finite/regressing/throwing clocks (including entry), no new observe after early expiry, no extra I/O after already observed expiry, and original/new deny-floor preservation. Public API name and first three arguments remain unchanged; pure evaluate remains compatible. Never mutate/freeze caller data/config. Clock delta is checked at read/observe/read and thrown-operation paths. Authentic checkpoint ack-loss can be reconciled only if the observation still has lifetime remaining.

Host owns truthful current source timestamps, same clock units, clock trust, authentic monotonic persistence, prior latency BEFORE invocation and executing immediately after allow. This does not re-observe source, detect source change inside a valid window, validate colluding host clocks, close post-return races, or make actions transactional. Getter/proxy effects, transient ABA and concurrent rules/options drift are out of scope.

## Exact baseline and post-fix commands

From `/Users/beauxwalton/projects/worktrees/swarmlab-2026-10-07-exp57`:
```bash
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-07-exp57-baseline install --frozen-lockfile
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-07-exp57-baseline run build
npm install && npm run build && npm run typecheck
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-07-exp57-baseline AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-07-exp57-baseline/packages/aegis/dist/index.js node experiments/57-async-source-expiry/dist/main.js
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-07-exp57 run build
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-07-exp57 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-07-exp57/packages/aegis/dist/index.js node experiments/57-async-source-expiry/dist/main.js
```
Repeat baseline identically to demonstrate reproducibility. Regression only AFTER novel work: SwarmLab build/typecheck/verify:evidence, focused Aegis tests, release:check and exp55/56 as nearby regressions. None counts as novel evidence.
