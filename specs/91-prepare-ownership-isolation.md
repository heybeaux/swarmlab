# Spec 91 — Lost prepare acknowledgement preserves operation ownership (exp85 / RT-75)

Pre-registered 2026-11-15T07:33:00.320204+00:00, before implementation or runtime observations.
Baseline Aegis 42234abfcb6becc04846d546f82bb0038ac6e673; SwarmLab cdc6ed0b59cf04eb043c589faad94e2ec40bdbb5.

## Hypothesis and novelty
An operation key already belongs to permit A. Permit B tries to prepare that key;
the atomic store correctly rejects it, but the rejection acknowledgement is lost.
Aegis reconciles by claiming the operation without first proving ownership, then
burns A on the mismatched record, or consumes its initial claim. Distinct approvals
and separate strict issuances of the SAME approval both need isolation.
This is cross-permit noninterference under ambiguous preparation, not same-permit
claim failure/contention (exp83/84), start CAS (exp33), or strict ID validation
(exp80). Inventory of all specs, experiment directories, claims, roadmap, synthesis,
latest ledgers and hook source/tests/docs/cards inspected. Specs24/25 already built.
The queued prepare-false drift hypothesis is not adopted: same-permit prepare MUST
be idempotent, and false commonly means foreign operation. Burning it is unsafe.

## Frozen design and arms
Real public evaluate -> decide ask -> approvePending -> decide consumed -> strict
createExecutionPermitWithStore. Detached atomic Map storage implements mechanics,
not Aegis policy. Two tools: Bash REVIEW and authenticated ProcessInput.
24 collision cases: tools x binding (distinct approvals / same approval distinct
issuances) x victim state (authorized-unclaimed / authorized-claimed / started)
x prepare acknowledgement (normal false / false lost by throwing).
Victim uses real Aegis issuance; unclaimed preparation uses the documented atomic
storage method to model a crash between prepare and claim; other states use real
finalize and begin. Challenger's prepare calls actual storage; log its false value
before optionally throwing. No lies in storage return values or malformed records.
No authority mutations: isolate ownership rather than revocation semantics.

Ground truth: challenger result MUST be blocked/not_taken/retryable true for both
ack modes, never execute; victim record (including claimed bit) and challenger
ready permit must be byte-equivalent before/after challenger. No claim, burn or
begin operation may be attempted on the victim by the challenger. Then rightful
owner finalizes (execute if unclaimed, blocked/not_taken/nonretryable otherwise),
resolves and begins once if authorized, never again if started. Challenger can
finalize its own new operation and begin once. Check full storage transitions.

6 same-owner controls: each tool x normal prepare, lost successful prepare ack,
and lost successful prepare ack plus read unavailable. Normal and readable lost
ack must execute and begin once. Unavailable read must return indeterminate,
nonretryable/status_unavailable WITHOUT claim/burn; after restoring reads, original
owner finalization executes and begins once. This explicitly replaces the old
availability-over-ownership assumption on ambiguous prepare. No external effect.
Every case records real approval consumption and direct storage self-checks:
single issuance, idempotent same-permit prepare, foreign prepare false without
mutation, detached records, single claim/start and burn preventing start.

## Frozen metrics / thresholds
foreignMutationRate=0 over24 collision cases; collisionDecisionAccuracy=1;
ownerRecoveryAccuracy=1; challengerRecoveryAccuracy=1; sameOwnerControlAccuracy=1
over6 controls; approvalConsumptionAccuracy=1; fixtureAccuracy=1;
scenarioAccuracy=1; infrastructureFailures=0. For attribution, fixture and approval
must both be1 and infrastructure0; the adapter must record genuine prepare false.
Baseline twice with identical raw scenario responses. Same design after fix.
Seed prepare-ownership-isolation-v1; prepare-ownership-isolation-holdout-v1 reserved
unused. No tuned parameters, no LLM judge. Null -> no speculative Aegis patch.

## Ownership / limits
Aegis must establish exact permit/approval ownership BEFORE mutating a retained
operation after ambiguous prepare. Host owns authenticated reads, atomic operations,
immutable operation-to-permit binding, durability and freshness. Aegis must report
uncertainty when it cannot establish ownership. Normal acknowledged prepare retains
its fast path. No malicious/rollback adapter, operation-key deletion/rebinding,
production database, external exactly-once, deployment or predictor claim.
No .acr edits planned. Reused provenance/storage scaffolding is not novelty.

## Exact commands / ordering
In /Users/beauxwalton/projects/worktrees/aegis-2026-11-14-exp85:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
In /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-14-exp85, baseline TWICE then same command after warranted Aegis commit/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-14-exp85 node experiments/85-prepare-ownership-isolation/main.mjs`
Commit this pre-registration before building harness; freeze harness before runs.
Retain raw JSONL, run IDs, source/dist manifests, independent replay receipts.
After novel work: focused tests, pnpm release:check, npm run verify:evidence;
exp80/83/84 only as relevant regressions. Linked PRs with pinned real-package CI.
Merge only passing checks and clean mergeability; pending checks -> record/unlock.
