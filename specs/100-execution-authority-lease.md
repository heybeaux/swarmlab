# Spec 100 — Execution authority lease across shared finalization (exp94 / RT-84)

Pre-registered 2026-11-24T07:34:34.767320+00:00, before implementation or execution.
Baseline Aegis 9c06ee809849a3c60e15160388636f93ab04918d; SwarmLab f4e9ea37d0446dfaccd9628f3127ae0116e47ac9.

## Question and novelty
Can a trusted host bound the lifetime of its authority snapshot while Aegis awaits
shared destructive permit finalization? Existing current/revocation booleans remain
unchanged while the host's freshness lease expires. There is NO existing permit TTL
contract; this tests a missing opt-in policy capability, not a broken documented TTL.
Exp26 limits approval consumption; exp29 refreshes authority between calls; exp57
ages source observations in a different evaluator; exp78 rejects input mutation.
None enforces a host execution-authority lease across take/prepare/claim. Inventoried
187 specs/READMEs, all claims, roadmap, synthesis and latest ledgers; pending93 is
literal scan work, unrelated. Specs24/25 already built. One new hypothesis selected.
Expected gap: existing finalizers ignore an extra options argument and authorize
late results. Aegis should provide an optional finalization options contract with
validUntilMs (inclusive epoch milliseconds) and nowMs (trusted clock; Date.now default).
No option preserves compatibility. This does NOT add expiry to stored permits or
inherit the original approval TTL: hosts own deriving the truthful deadline and
supplying it on EVERY retry. Journal/start/local APIs are outside this bounded design.

## Frozen arms, scenarios and machine oracle
Real exported finalizeExecutionPermitWithStore and finalizeExecutionPermitWithReconciliation,
with an optional last argument. Each begins real evaluate -> ask -> approve -> consume
-> strict createOnce permit. Adapter only stores atomic detached records and advances
a deterministic clock at awaited callbacks; no Aegis policy copy. Separate no-lease
paired control per scenario confirms stable authority still executes exactly once.
Oracle is integer comparison and typed result/state assertions; no LLM, sleeps or
external side effects. All tests use entry100/deadline200 except as listed.

For EACH simple/reconciled API, ordered16 cases:
fresh(return150), boundary(return200), expired(return201), expired-entry(entry201),
clock-regressed(return99), clock-nan(returnNaN), clock-infinite(returnInfinity),
clock-throws(on return), deadline-nan, deadline-fraction(200.5),
deadline-expanded(mutate options deadline to1000 at return201),
clock-replaced(mutate options callback to return0 at return201),
clock-invalid-entry(NaN), legacy(no options,return201), revoked(snapshot revoked),
store-unavailable(throw before destructive claim/take; no execution).
Reconciled-only additional2: prepare-expired-restore(prepare201,claim100),
prepare-expired-ack-loss(prepare201 and throw after commit, claim201).
Total34. Only fresh/boundary/legacy execute; all other cases block, except unavailable
reconciled indeterminate/status_unavailable. Lease failures after entry still consume
and burn the taken/prepared grant; replay cannot execute. Invalid options/entry-clock
may reject before I/O, in which case the unchanged lease retry also must block. All
ordinary lease failure reasons use invalid_snapshot/nonretryable; simple literal false.
Paired no-lease valid controls allow once then replay blocks. Authority and options
must not be frozen or mutated by Aegis; fixture mutations remain visible. Captured
options cannot be relaxed while awaiting I/O; clock regression/failure is sticky.
For unavailable, record retained and valid same-lease recovery must block since the
clock is201; paired control independent. Prepare remains one-shot idempotent by op id.
Seed execution-authority-lease-v1; reserved holdout execution-authority-lease-holdout-v1
UNUSED; no random or parameter tuning. Deadlines chosen before observations.

## Locked metrics and classification
Primary unsafeExecutionRate over nonallow/nonunavailable cases =0; scenarioAccuracy=1.
Secondary pairedControlAccuracy=1, replaySafety=1, ownershipAccuracy=1,
approvalCoverage=1, fixtureAccuracy=1, infrastructureFailures=0. For unavailable,
recoverySafety=1. Exact boundary must allow; clock-invalid entry never executes.
Baseline TWICE and require identical typed outcomes and metrics. Red only attributable
if paired controls, approval and fixture accuracy1 with infrastructure0; preserve all
red evidence. Null => no patch. Post-fix SAME script/seeds/scenarios/thresholds.

## Ownership and limits
Aegis captures optional lease/deadline/clock before I/O, checks entry and every awaited
boundary, retains failure through acknowledgement recovery, fails closed and burns
consumed grants without changing no-option calls. Host owns trustworthy epoch clock,
authenticated deadline and snapshot, atomic durable adapter, mandatory option on all
retries and immediate execution after allow. No automatic original-approval TTL,
durable expiry, arbitrary clock collusion, cross-host clock skew, post-return races,
other journal APIs or production deployment proof. No .acr changes planned.

## Exact commands
Build in /Users/beauxwalton/projects/worktrees/aegis-2026-11-23-exp94: `npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`.
Baseline twice, and post-fix after warranted commit/build, from /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-23-exp94:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-23-exp94 node experiments/94-execution-authority-lease/main.mjs`
Pin source/dist manifests, package SHA, four-file harness hashes and full JSONL raw
observations. Commit pre-registration first, harness second, before baseline.
After novel work: focused Aegis tests; pnpm release:check; npm run verify:evidence.
Add independent receipt replay and tamper controls plus pinned-package CI. Linked PRs;
merge only passed checks/clean mergeability; pending checks terminal permitted.
