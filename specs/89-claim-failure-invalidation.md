# Spec 89 — Claim failure must retain observed invalidation (exp83 / RT-73)

Pre-registered 2026-11-13T07:33:27.884394+00:00 before implementation or runtime observations.
Baseline Aegis 23e33e098ad24b04aed8291b654c953af2165073;
SwarmLab 98d9ec00ef032fb02cd93d244fb36ae580baddba.

## Hypothesis / novelty
When journal claim throws before commit or after committing its claimed marker,
finalization returns uncertainty without acting on already observed input drift.
Clean-authority recovery can then start a grant whose invalidation was observed.
Expected shortfall: the claim exception branch bypasses finalization's durable
burn logic. Error recovery must retain security observations across failed I/O.
This is a fault-composition experiment, not a new seed of successful finalization.
Inventory: all spec/experiment titles, claims, roadmap, synthesis, latest three
ledgers and Aegis implementation/tests/docs/cards inspected. Specs24/25 built.
Exp31 tests destructive take; exp32 post-authorization crash; exp33 start CAS;
exp79 has unchanged claim-before-commit failure and explicitly excludes claim-after-
commit loss; exp81/82 begin with successfully finalized authorization. None injects
claim failure across observed invalidation and then probes clean adapter recovery.

## Frozen design and arms
Actual built public evaluate -> decide ask -> approvePending -> decide consumed ->
strict createExecutionPermitWithStore. Detached Map implements atomic storage only.
Public finalizeExecutionPermitWithEffectJournal receives injected claim failures.
Faults: throw-before (claim not committed) and throw-after (claim commits then throws).
Two tools: Bash with REVIEW rule and authenticated ProcessInput generation.
For each tool/fault, six modes: unchanged, equivalent nested clone during claim,
prepare-drift-restored (revoke during prepare, restore during claim), claim-revoke,
repair-revoked (revoked at entry, repaired during claim), handle-change (ID changed
in claim). Four mutation modes use working burn. Additional claim-revoke cases use
burn-false and burn-throws for each tool/fault. Total32 cases, no random sampling.
Each case runs an independent unchanged no-fault lifecycle control and storage
self-checks. No external effect is invoked; no LLM judges success.

For four mutation modes with working storage, finalization must return
blocked/nonretryable/invalid_snapshot, permanently burn the operation, and clean
adapter finalize/resolve/begin must never grant execute/retry. The claim marker is
false before-commit, true after-commit, including after burn. A repaired caller
must not conceal drift seen after prepare. Handle mutation must bind original ID.
For unchanged/equivalent inputs, return indeterminate/nonretryable/status_unavailable;
retain authorized state. Clean adapter finalize recovers before-commit failure;
after-commit returns blocked/not_taken, but resolve then begin recovers exactly once.
For burn-false/throws, return indeterminate/nonretryable/status_unavailable, retain
authorized state; clean recovery may start once (diagnostic host-quarantine limit,
not an invalidation success). Never claim durable burn without acknowledgement.
After restoring adapter, probe with ORIGINAL handle and clean authority: finalize,
resolve, begin twice; record state before/after each, operation log, caller snapshots,
real approval observations. All authorized controls start once, second begin blocks;
burned state never starts. Observe actual state, not only return status.
Fixture self-checks: duplicate issuance/claim/start reject; prepare consumes ready;
detached records; burn prevents start and future claim.

## Frozen metrics / thresholds
Primary unsafeRecoveryRate=0 over16 mutation cases with working burn;
durableInvalidationAccuracy=1 over16; uncertaintyAccuracy=1 over16 unchanged,
equivalent or failed-burn cases; recoveryAccuracy=1 over16 retained controls;
controlAccuracy=1; approvalConsumptionAccuracy=1; fixtureAccuracy=1;
stateAccuracy=1 (actual claim marker and storage transitions match operation log,
not assumed desired burn); scenarioAccuracy=1; infrastructureFailures=0.
Baseline twice; raw responses must be identical. Attribute red only with fixture,
control, consumption and state all1, infrastructure0. Same thresholds after fix.
Seed claim-failure-invalidation-v1; holdout claim-failure-invalidation-holdout-v1
reserved unused. No parameter tuning. Null -> no Aegis patch.

## Ownership / limits
Aegis owns preserving observed entry/prepare/claim input drift when claim rejects;
attempt durable burn on that invalidation; report definitive rejection only after
true burn acknowledgement, otherwise uncertainty. Hosts own authentic fresh plain
data, atomic storage, retained state and quarantine/reconciliation on storage loss.
No recovery execute from an ambiguous claim itself; recovery still uses begin CAS.
No claim of production durability, external-effect exactly-once, malicious adapter
security, unseen ABA, immutable-invalid input without drift, elapsed expiry,
post-return protection, or deployment. No .acr changes planned.

## Exact commands and ordering
In /Users/beauxwalton/projects/worktrees/aegis-2026-11-12-exp83:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
In /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-12-exp83, baseline TWICE,
then exact same command after warranted Aegis commit and build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-12-exp83 node experiments/83-claim-failure-invalidation/main.mjs`
Commit pre-registration before harness implementation; freeze harness before runs.
Preserve SHA, source/dist hashes, raw traces, run IDs, independent replay receipts.
After novel work: focused tests, pnpm release:check, npm run verify:evidence;
exp79/82 only as post-change regressions. Linked PRs, pinned real-package CI;
merge only passing checks and clean mergeability. Pending checks -> unlock/exit.
