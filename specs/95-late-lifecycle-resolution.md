# Spec 95 — Late lifecycle resolution entry binding (exp89 / RT-79)

Pre-registered 2026-11-19T07:32:37.560205+00:00, before implementation or runtime observations.
Baseline Aegis 4744da93fe969032bd9b586730e4c8fe05986970; SwarmLab 2b1bd6075102fbcaf1040124a34910596733b850.

## Hypothesis / novelty
Late lifecycle reads can report a foreign permit's terminal outcome after caller
identity changes across an awaited proof read. The resolver currently validates
against the live mutable handle. This is terminal classification integrity, not
exp88 retirement/compaction CAS attestation, exp87 initial selection, or exp49
static authority disagreement. Inventory of existing specs, experiments, claims,
roadmap, synthesis, recent ledgers, and current source/tests/docs/cards finds no
late-resolution caller drift experiment. Specs24/25 and roadmap already built.
Exactly one hypothesis selected. Begin must remain blocked in every case.

## Frozen design and deterministic truth
Real evaluate -> decide ask -> approvePending -> decide consumed -> strict shared
createExecutionPermitWithStore. Two distinct real approvals and issued handles.
Host-seeded authenticated tombstones/checkpoints; detached read-only storage.
Four public routes: full retired, legacy compact, compact with detected plural
capability, explicit multi-authority compact. For each committed/failed outcome:
exact and equivalent-value positives; stable foreign proof rejection; foreign proof
with permit switched at read await; local proof with permit drift at read await;
read outage. Six cases x four routes x two outcomes =48.
Each plural route also tests local drift at authority await and local drift at read
then restoration at authority await: eight additional cases, total56. Restoration
occurs only if called; early rejection is correct. For plural proofs two distinct
verified agreeing authorities are returned, with independently checked digests.
Fresh begin invocation uses same scenario and must block (outage: indeterminate).
Clean original-input recovery rejects foreign proof, preserves local terminal
classification; outage cleared on recovery. Unrelated local read succeeds.
No LLM judge. Oracle recomputes proof/digest binding from original issued handles,
checks exact status/retryable/reason, immutable retained storage, approval consumption,
caller mutability, callback logs and independent detached-read fixture.

## Frozen thresholds and seed discipline
Primary falseTerminalRate=0 and hazardRejectionAccuracy=1 (24 hazards).
Secondary positiveAccuracy=1 (16), conflictAccuracy=1 (8), outageAccuracy=1 (8),
beginSafetyAccuracy=1, storageIsolationAccuracy=1, recoveryAccuracy=1,
callerOwnershipAccuracy=1, approvalConsumptionAccuracy=1, fixtureAccuracy=1,
scenarioAccuracy=1, infrastructureFailures=0. Baseline twice with equal raw outcomes.
Attribute red only with fixture/consumption/isolation/ownership all1 and infra0.
Seed late-lifecycle-resolution-v1; unused reserved holdout late-lifecycle-resolution-holdout-v1.
No tuning, threshold changes or added scenarios after results. Null => no patch.

## Ownership / limits
Aegis owns immutable entry binding and observed identity stability across each
await in terminal resolvers. Host owns authenticated complete authority enumeration,
detached storage and durability. No writes, real effects, hostile adapters, hidden
ABA within one callback, post-return protection, production DB, deployment or
predictor claim. Source .acr changes not needed; no Territory refresh planned.

## Exact baseline / post-fix commands
In /Users/beauxwalton/projects/worktrees/aegis-2026-11-18-exp89:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
In /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-18-exp89, twice baseline,
then identically after warranted committed patch/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-18-exp89 node experiments/89-late-lifecycle-resolution/main.mjs`
Commit registration before implementation; freeze harness before running.
Preserve source/dist hashes, raw traces, results, replay receipts. Then focused
Aegis tests, pnpm release:check, npm run verify:evidence. Linked PRs, pinned real
package CI and clean passing checks before merge; pending => unlock and exit.
