# Spec 93 — Durable policy selection attestation integrity (exp87 / RT-77)

Pre-registered 2026-11-17T07:33:40.622111+00:00, before implementation or runtime observations.
Baseline Aegis d9d50b0fab3ae76cbe53457d5ef3c7a05bd359ef; SwarmLab e0975c43a26465e6777a82c2bc3f1d9201e5f874.

## Question / novelty
Can caller identity drift during durable strict policy selection cause Aegis to
return a selection receipt that disagrees with the retained marker? Selection
constructs its return from entry permit IDs but validates readback against live
caller IDs. A pre-existing foreign marker plus caller drift can attest the wrong
binding. Current approval drift may also pass unnoticed across bind/read awaits.
This tests selection receipt truth, not execution authority: exp46 tests stable
conflicting markers/restart, exp77 issuance acknowledgement, exp85 effect ownership,
and unmerged exp86 wrapper execution authority. All spec/experiment titles, claims,
roadmap, synthesis, relevant full specs, latest ledgers and Aegis source/tests/docs/
cards inspected. Specs24/25 already built. Exactly one new hypothesis selected.

## Frozen design / machine ground truth
Real built public evaluate -> decide ask -> approvePending -> decide consumed ->
createExecutionPermitWithStore(requireAtomicIssuance, distinct issuance IDs).
Two tools: Bash REVIEW and authenticated ProcessInput. A detached Map implements
atomic create-if-absent policy storage; log every bind input, result and read.
No local replacement for Aegis selection policy. No LLM judge.

26 ordered scenarios, 13 per tool:
- fresh marker, exact idempotent reselection, equivalent value clones: 3 positives;
- foreign marker for same approval/different issuance and distinct approval:
  each stable conflict, permit identity switched to foreign at bind await, and
  switched at read await: 6 cases (2 safe rejection controls, 4 hazards);
- fresh marker with current.approvalId drift at bind, at read, and at bind then
  restored at read: 3 hazards;
- fresh marker with permit.id drift at bind then restored at read: 1 hazard.
All mutations occur after an awaited microtask; the truthful adapter never changes
or overwrites an existing marker. Restoration only occurs if Aegis continues to
read; early rejection is allowed. Same-approval foreign case leaves current ID
unchanged; distinct-approval case changes permit IDs and current ID coherently.

Success: positives return exact entry marker equal to retained marker; stable
foreign conflicts and ALL16 hazards return undefined. No false receipt (every
non-null result equals actual retained record AND entry binding). Existing markers
remain byte-identical; fresh inserts retain the entry marker even on rejection
(no deletion/rollback claim). Returned objects must not alias storage or caller.
Caller fields remain mutable; Aegis must not freeze or rewrite them. Clean reselection
with original inputs succeeds on fresh markers and rejects foreign markers; a new
unrelated operation succeeds. Real approval consumption and single-issuance store
controls required. Record both issued permits, callback input snapshots, full store
operations and retained state. Baseline twice with identical raw outcomes.

## Frozen metrics / thresholds
Primary: falseReceiptRate=0 over26, hazardRejectionAccuracy=1 over16.
Secondary: positiveAccuracy=1 over6; conflictControlAccuracy=1 over4;
storageIsolationAccuracy=1; recoveryAccuracy=1; callerOwnershipAccuracy=1;
approvalConsumptionAccuracy=1; fixtureAccuracy=1; scenarioAccuracy=1;
infrastructureFailures=0. Attribute red only if approval/fixture/storage isolation/
caller ownership all1 and infrastructure0. Seed policy-selection-integrity-v1;
reserved unused holdout policy-selection-integrity-holdout-v1. No tuned parameters,
scenario/threshold changes after observation or speculative patch for null results.

## Ownership / limits
Aegis owns binding selection attestation to immutable ENTRY operation/permit/approval
identity and observing identity stability at each await. This is not a full approval
revocation/expiry decision and does not grant execution permission. Host owns atomic
truthful storage, detached reads, durability and current roster authenticity.
No malicious storage, hidden ABA within a callback, post-return drift guarantee,
production DB, external effect, deployment or predictor claim. No .acr edits planned.

## Exact commands / ordering
In /Users/beauxwalton/projects/worktrees/aegis-2026-11-16-exp87:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
In /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-16-exp87, baseline twice then identically after warranted Aegis commit/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-16-exp87 node experiments/87-policy-selection-integrity/main.mjs`
Commit pre-registration before implementation; freeze harness commit before runs.
Retain raw JSONL, results, exact source/dist manifests, independent replay receipts.
After novel work: focused tests, pnpm release:check, npm run verify:evidence.
Linked PRs with pinned real-package CI, merge only passing checks/clean mergeability.
Pending CI => record pending, unlock, exit. Preserve red and uncertainty.
