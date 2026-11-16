# Spec 92 — Authority lifetime across strict wrappers (exp86 / RT-76)

Pre-registered 2026-11-16T07:33:57.305875+00:00, before harness implementation or observations.
Baseline Aegis d9d50b0fab3ae76cbe53457d5ef3c7a05bd359ef; SwarmLab e0975c43a26465e6777a82c2bc3f1d9201e5f874.

## Hypothesis and novelty
Strict wrapper preflight can repair invalid entry authority before the generic
resolver/begin captures it; strict postflight can revoke authority AFTER generic
begin returns execute. The strict composition grants more authority than its inner
boundary. Exp81 expressly excludes strict-wrapper preflight; exp45/46 test roster
capability/policy continuity, not caller authority across outer awaits. The queued
begin-CAS hypothesis is rejected as already exp81. Elapsed approval expiry deferred
because its lifetime contract needs separate design. Exactly one hypothesis selected.
Inventory: all spec/experiment titles, relevant full specs, evidence claims, synthesis,
roadmap, latest ledgers, current source/tests/docs/cards. Specs24/25 already built.

## Frozen design and machine truth
Real built public evaluate -> decide ask -> approvePending -> decide consumed ->
strict createExecutionPermitWithStore -> finalize journal. Detached atomic Map store
retains real records. Add coherent current revision/checkpoint/quorum/set/roster
views and real selectDurableStrictRosterPolicy with retained readback. Adapters
implement storage mechanics only. No LLM judge, sleeps, external effects or fake policy.

34 ordered scenarios: two tools (Bash REVIEW, authenticated ProcessInput) x three
APIs (durable resolve, durable begin, continuity begin). Each has four modes:
unchanged, equivalent nested clone, entry-revoked repaired during first preflight,
entry-link-revoked repaired during first preflight (24 cases).
Both durable APIs add pre-revoke-restored: valid entry revoked at marker read,
restored at following roster read (4). Both begin APIs add post-revoke during final
wrapper roster read after inner begin (4). Durable begin adds post-revoke-restored:
revoke at second marker read, restore at final wrapper roster read (2).
A marker/roster callback mutates inputs after an awaited microtask; snapshots and
all storage operations captured. Preflight roster is roster call1; begin inner
roster calls2/3; final wrapper roster call4. Durable resolve inner roster call2.

12 unchanged/equivalent controls must preserve resolve retryable/not_started and
begin execute once. 16 preflight hazards must produce invalid_snapshot/nonretryable
(not_executed for resolve, blocked for begin), permanently burn authorized record,
perform no begin CAS, and refuse clean generic recovery authorization_burned.
6 postflight hazards must block invalid_snapshot/nonretryable, retain started fence,
and refuse clean recovery effect_started. No claim external effect occurred.
All scenarios include real consumption, valid setup, unchanged independent strict
lifecycle control and direct storage tests for single issuance/claim/start, foreign
prepare isolation, detached records and permanent burn. Caller objects remain
mutable and equal to the deliberately changed expected input (no Aegis mutation).
Baseline twice; raw scenario responses must be identical.

## Frozen metrics / thresholds
unsafePermissionRate=0 over22 hazards (execute OR retryable considered permission);
preflightInvalidationAccuracy=1 over16; postflightFenceAccuracy=1 over6;
positiveAccuracy=1 over12; recoverySafety=1; controlAccuracy=1;
approvalConsumptionAccuracy=1; fixtureAccuracy=1; ownershipAccuracy=1;
scenarioAccuracy=1; infrastructureFailures=0.
Attribute red only with control/consumption/fixture/ownership all1 and infrastructure0.
Seed strict-wrapper-authority-v1, reserved unused holdout strict-wrapper-authority-holdout-v1.
No tuned parameters; thresholds/oracle/scenarios frozen before runtime observations.
Null -> no patch. Preserve all red results.

## Ownership / limits
Aegis owns retaining entry authority across the ENTIRE public wrapper invocation,
remembering observed drift across marker/roster checks, and refusing permission after
postflight drift. Reuse generic burn acknowledgement semantics before start; never
roll back started state. Host owns truthful fresh authority, authenticated policy
and checkpoint views, atomic durable storage and actual effect invocation. No
malicious storage, unseen ABA within one callback, expired approval lifetime,
post-return mutation, production durability, deployment or predictor claim.
No .acr changes planned. Storage/provenance scaffold reuse is not novelty.

## Exact commands and ordering
In /Users/beauxwalton/projects/worktrees/aegis-2026-11-15-exp86:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
In /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-15-exp86, twice baseline,
then identically after warranted Aegis commit/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-15-exp86 node experiments/86-strict-wrapper-authority/main.mjs`
Commit this spec before implementation; commit frozen harness before observations.
Retain exact source/dist manifests, raw JSONL, independent rescore and receipts.
After novel work run focused regressions, pnpm release:check and npm run verify:evidence.
Exp81/82 relevant regressions only. Linked PRs with pinned real-package CI; merge
only passing checks and clean mergeability. Pending checks -> record, unlock, exit.
