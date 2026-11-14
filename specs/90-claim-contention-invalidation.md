# Spec 90 — Claim contention retains invalidation (exp84 / RT-74)

Pre-registered 2026-11-14T07:32:39.497719+00:00 before implementation or observations.
Baseline Aegis 53200335d71b81494470693737c635fea5af1226; SwarmLab 86ded67e977b98ef7868855edee048c460fb8189.

## Hypothesis and novelty
A losing finalizer discards observed authority/handle drift when claim returns
undefined because another real Aegis caller claimed the retained authorization.
Clean recovery can then start the disqualified grant. A competing start also means
burn cannot be confirmed: the loser must expose uncertainty, not definitive refusal.
This tests successful contention, not exp83's transport exceptions. Exp33 covers
begin CAS competition; exp79 successful initial claims; exp81/82 resumed input and
burn failures; exp83 explicitly excludes undefined claims. All spec/experiment
inventories, evidence claims, roadmap, synthesis, recent ledgers, current hook
source/tests/docs/cards inspected. Original Specs24/25 are already built.

## Frozen design and oracle
Real built public evaluate -> decide ask -> approvePending -> decide consumed ->
strict createExecutionPermitWithStore. Atomic detached Map storage implements
mechanics only. Outer finalize prepares a retained effect; its claim adapter awaits
a separate real finalize with original handle/clean snapshot, which claims first.
Then outer storage claim returns undefined. Record both callers, all operations,
storage states, input snapshots and clean-adapter recovery probes. No external effect.

36 scenarios: Bash REVIEW and authenticated ProcessInput, each with normal prepare
ack and lost prepare ack (commit then throw), crossed with nine modes:
1 unchanged; 2 equivalent nested clone; 3 prepare-drift-restored (revoke after prepare,
restore during claim); 4 claim-revoke; 5 repair-revoked (invalid entry repaired during
claim); 6 handle-change; 7 claim-revoke with burn false; 8 claim-revoke with burn throw;
9 claim-revoke with rival begin completed before the outer claim returns undefined.
Modes3-6 require confirmed burn; modes7-9 require uncertainty; modes1-2 retain normal
not_taken behavior (retryable only for lost prepare acknowledgement).

The rival finalize must execute in every case. Mode9 rival begin must execute before
outer return; this is an independent valid caller, not execution under revoked input.
For modes3-6 outer result blocked/nonretryable/invalid_snapshot, state burned;
clean resolve not_executed/nonretryable/authorization_burned and both begin probes
blocked authorization_burned. Fresh finalize returns not_taken, never execute.
For modes7-9 outer result indeterminate/nonretryable/status_unavailable. Modes7/8
retain authorized state; mode9 retains started state, never rolled back. Authorized
recovery: fresh finalize not_taken; resolve retryable not_started; begin executes once,
second begin blocks effect_started. Started recovery: resolve indeterminate/nonretryable/
effect_started and both begins blocked effect_started. Modes1/2 also recover once.
Every scenario has independent no-fault lifecycle control, real consumed approval
observations, and direct fixture single issuance/claim/start/burn checks. State truth
checks use actual operation log independently of desired invalidation outcome.

## Locked metrics / thresholds
unsafeRecoveryRate=0 over16 confirmed-burn drift cases;
durableInvalidationAccuracy=1 over16; uncertaintyAccuracy=1 over12 failed-burn or
started cases; contentionControlAccuracy=1 over8 unchanged/equivalent cases;
recoveryAccuracy=1 over20 retained cases; rivalAccuracy=1; controlAccuracy=1;
approvalConsumptionAccuracy=1; fixtureAccuracy=1; stateAccuracy=1;
scenarioAccuracy=1; infrastructureFailures=0. Baseline twice with identical raw
responses; red attributable only with rival/control/consumption/fixture/state all1,
infrastructure0. Thresholds/scenarios/oracle frozen before observing results.
Seed claim-contention-invalidation-v1; reserved holdout
claim-contention-invalidation-holdout-v1 unused. No tuning, no LLM judge.
Null -> no patch; preserve red.

## Ownership and limits
Aegis owns remembering observed drift across every claim outcome and checking burn
acknowledgement. If a rival already started, refuse permission and expose uncertainty;
never roll back started state or claim external-effect cancellation. Hosts own atomic
durable storage, authentic fresh plain-data authority, begin CAS before effects,
and quarantine/reconciliation. No production database, malicious adapter, unseen
ABA, immutable-invalid input without drift, prepare-false, elapsed expiry,
post-return mutation, external-effect exactly-once or trained predictor claim.
No .acr changes planned. Reused storage/provenance utilities are not novelty.

## Exact commands / ordering
From /Users/beauxwalton/projects/worktrees/aegis-2026-11-13-exp84:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
From /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-13-exp84, twice baseline, then unchanged after warranted Aegis commit/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-13-exp84 node experiments/84-claim-contention-invalidation/main.mjs`
Commit spec before implementation and freeze harness commit before observations.
Retain source/dist hashes, raw JSONL, receipts and independent rescoring.
After novel work run focused tests, pnpm release:check and npm run verify:evidence;
exp79/83 only as post-change regressions. Linked PRs, pinned real-package CI, merge
only passing checks and clean mergeability; pending checks -> unlock/exit.
