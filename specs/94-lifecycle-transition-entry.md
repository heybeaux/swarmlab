# Spec 94 — Lifecycle transition entry binding (exp88 / RT-78)

Pre-registered 2026-11-18T07:33:03.851082+00:00 before harness implementation or experiment observations.
Baseline Aegis 90bd6b1aa0bbe6821d455939611b935788002679; SwarmLab 92a50f16f03b2cb13c231b537c593018a475225e.

## Hypothesis and novelty
Retirement and compaction may attest a different permit's terminal lifecycle after
caller identity changes during an awaited journal read, CAS, or retained read.
Retirement currently reads terminal truth before capturing caller identity; both
transitions validate retained truth against the live caller. This can retire the
wrong entry identity or report a foreign pre-existing tombstone/checkpoint as success.
Unlike exp87 (create-if-absent selection receipt), this tests terminal-proof ingestion,
irreversible active-to-retired / retired-to-compacted CAS, and lifecycle attestation.
Exp47/48 cover static binding and missing APIs; exp49 covers conflicting authorities,
not changing caller identity. Exp78 finalizes execution authorization, not lifecycle
retirement. Reviewed all spec/experiment titles, claims, roadmap, synthesis, latest
ledgers and related full specs/source/tests/docs/cards. Specs24/25 are already built.
Exactly one hypothesis selected; this is not a renamed selection experiment.

## Frozen design, controls and deterministic truth
Use real built Aegis APIs: evaluate -> decide ask -> approvePending -> decide consumed
-> createExecutionPermitWithStore. Two distinct real issued permits A/B, same tool
(Bash REVIEW), distinct approval task contexts. Host fixture seeds detached terminal
journal records with the actual stored permit record, bound verified success/failure
receipt, claimed=true and revision3. These are deterministic authenticated host inputs,
NOT a claim that a real external effect executed. Detached Map lifecycle store performs
exact compare-and-swap only; no local replacement of Aegis policy. No LLM judge.

32 ordered scenarios: committed then failed; within each, retire9 then compact7.
Retire9: fresh, exact duplicate, equivalent object assignment (3 positives);
foreign journal+foreign active stable (negative control), foreign journal+foreign active
with permit switched to B during journal read (hazard); foreign retired with local A
journal stable (negative control), same foreign retained record with permit switched
at CAS or retained read (2 hazards); local active with permit drift at CAS then restored
at retained read (hazard). Compact7: fresh, duplicate, equivalent (3 positives);
foreign checkpoint stable (negative control), same with permit switched at CAS or
retained read (2 hazards); local tombstone with drift at CAS restored at retained read
(hazard). Each switch changes permit.id and permit.approvalId together. Mutations occur
after awaited microtasks. Restoration only happens if Aegis reaches readback; early
rejection is valid. Equivalent mode replaces values without changing identity.

All12 positives must return retired/nonretryable/policy_retired and retain exact entry
terminal state. All14 hazards and6 stable conflicts must return
blocked/nonretryable/policy_lifecycle_inconsistent. No success against a foreign entry
binding. A rejected foreign-journal drift must not initiate a lifecycle CAS; other
foreign retained records stay identical. A successful CAS before drift is detected
is retained (no rollback); local CAS-drift retains the exact entry target. After clean
original-input retry, local cases succeed; foreign cases reject. Unrelated lifecycle
control succeeds. Caller remains mutable and Aegis must not rewrite caller fields.
Record all journal/CAS/read inputs/results, retained states, callbacks and approvals.
Separate direct storage checks prove exact CAS, conflicts, detached reads, and
host-authenticated compaction. Baseline twice with identical raw observations.

## Metrics and thresholds frozen before execution
Primary falseAttestationRate=0 over32 and hazardRejectionAccuracy=1 over14.
Secondary positiveAccuracy=1 over12; conflictAccuracy=1 over6;
transitionIsolationAccuracy=1; recoveryAccuracy=1; callerOwnershipAccuracy=1;
approvalConsumptionAccuracy=1; fixtureAccuracy=1; scenarioAccuracy=1;
infrastructureFailures=0. Red attributable only with fixture/consumption/ownership1
and infrastructure0. Seed lifecycle-transition-entry-v1; reserved unused holdout
lifecycle-transition-entry-holdout-v1. No tuned parameters or threshold/scenario
changes after observations. Honest null => no speculative Aegis patch.

## Ownership and limits
Aegis owns immutable entry identity throughout terminal validation, proposed CAS,
and readback; reject observed identity drift at each awaited boundary. Hosts own
atomic truthful storage, detached records, authenticated terminal evidence and
checkpoint authentication. No guarantee against hidden ABA wholly inside a callback,
post-return drift, malicious storage, production durability, external effects or
deployment. This is lifecycle attestation, not a new execution/revocation decision.
No .acr changes planned; Territory refresh only if source cards change.

## Exact commands and ordering
In /Users/beauxwalton/projects/worktrees/aegis-2026-11-17-exp88:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
In /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-17-exp88, twice baseline then
identically after warranted Aegis patch commit/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-17-exp88 node experiments/88-lifecycle-transition-entry/main.mjs`
Commit spec before implementation; freeze harness before observations. Preserve raw
JSONL, source/dist manifests and receipts. Post-novel regressions: focused tests,
pnpm release:check, npm run verify:evidence. Linked PRs with pinned real-package CI;
merge only clean and passing. Pending CI => record pending, unlock, exit.
