# Spec 85 — Journal authorization drift and durable invalidation (exp79 / RT-69)

Pre-registered 2026-11-09T13:30:06.177125+00:00 before harness implementation or baseline observations.
Baseline Aegis 104113f41774a874680fc334841a6ce2a12f3012; SwarmLab 649723cb2c2d1569bb09c8e23f27eb7fc1479c1c.

## Hypothesis and novelty
Authority drift during effect-journal prepare/claim can leave a retained authorized
operation resumable by another adapter even when the original invocation should
be rejected. Aegis validates caller-owned live data after claim. Expected shortfall:
invalid-to-valid repairs and drift observed after prepare then restored at claim
produce execute, no durable burn, retryable resolution and a successful effect start.

Exp78 tested simple/reconciled destructive takes only, explicitly excluding journal
entrypoints. Exp32 tested crash resolution and invalid authority AT resume; exp33
tested concurrent start fencing. Neither measures durable invalidation of an operation
after authority drifts DURING initial journal finalization. Novel question, metrics
and policy are retained authorization lifetime and subsequent clean-snapshot resume,
not merely another boolean finalizer or renamed fixture. Inventory reviewed all
spec/README headings, claims, source/tests/docs/cards, roadmap and recent ledgers;
Specs24/25 and other original roadmap experiments already exist.

## Frozen design and machine truth
Real public evaluate/decide/approvePending/decide, strict createExecutionPermitWithStore,
finalizeExecutionPermitWithEffectJournal, resolveExecutionEffect, beginExecutionEffect.
Deterministic shared Map storage with cloned records; independent adapter wrapper
for resume. No local Aegis policy implementation. Store implements atomic ready ->
authorized, single claim, authorized -> started and permanent burned states.

Seed journal-authorization-drift-v1; reserved holdout journal-authorization-drift-holdout-v1
unused. No random sampling or tuned parameters. Both Bash (explicit REVIEW rule)
and ProcessInput (authenticated host/session/generation). Ordered cases per tool:
unchanged; equivalent replacement; claim-repair-revoked; claim-repair-digest;
claim-repair-link; prepare-repair-revoked; prepare-drift-restored;
claim-valid-revoked; prepare-valid-revoked; ack-loss-unchanged;
ack-loss-drift-restored; claim-unavailable; burn-false; burn-throws;
plus process-only claim-repair-generation. Total29 cases.

Pause with deterministic promise barriers inside prepare/claim. For repair cases
start invalid and repair while designated operation is pending. Drift-restored starts
valid, revokes while prepare is pending and restores during claim (both observed
boundaries). Valid-revoked stays revoked. Equivalent replaces nested data with equal
values. Ack loss commits prepare then throws. Claim unavailable throws BEFORE claim;
retry same invocation with stable valid authority after recovery should execute.
Burn-false/throws start revoked, remain revoked, fail burn after claim: indeterminate,
never definitive blocked or execute. Do not resume after failed burn: safety requires
host quarantine/reconciliation, not a claim that failed storage invalidation persisted.

After successful invalidation: snapshot of state MUST show burned + claimed, no ready
record; fresh clean authority through independent adapter must resolve not_executed,
retryable false, authorization_burned; begin must block authorization_burned; repeated
finalize must not execute. Controls: authorized claimed state, retryable not_started
resolution, first start execute, second start blocked, finalizer replay blocked.
Fixture controls directly test single claim/start, permanent burn, and clone ownership.
Record calls/evaluation/approval consumption, entry/live snapshots, every operation,
state before resume/after start, all API results. Exact literals/state transitions
are ground truth; no LLM judge. One unchanged real-package control per scenario.

## Frozen metrics / thresholds
unsafeResumeRate (repair and drift cases, excluding burn failures) =0;
durableInvalidationAccuracy (same + valid-revoked) =1;
initialDecisionAccuracy (all29) =1; controlAccuracy=1;
recoveryAccuracy (claim-unavailable)=1; uncertaintyAccuracy (burn failures)=1;
approvalConsumptionAccuracy=1; replayBlockRate=1; ownershipAccuracy=1;
fixtureAccuracy=1; scenarioAccuracy=1; infrastructureFailures=0.
Baseline twice with identical raw observations required. Infrastructure failures or
bad fixture/consumption/control cannot be attributed to Aegis. No threshold changes.
Baseline passes => honest null, no Aegis patch. Frozen harness and identical commands
for red and green. Baseline result files and JSONL preserved, including diagnostic failures.

## Ownership and limitations
Aegis owns detached entry binding, drift detection at prepare/claim boundaries, and
requesting durable burn before definitive rejection; existing burn-failure uncertainty
must remain. Host owns authentic fresh plain data, atomic durable journal, burn contract,
and quarantine of indeterminate operations. No production database, actual external
effect, post-return mutation, transient between-observation ABA, malicious adapter,
getters/proxies, claim-after-commit loss or generalized resume-input integrity claim.
No speculative patch to adjacent resume/start entrypoints. No .acr edits planned.

## Exact commands
Aegis worktree /Users/beauxwalton/projects/worktrees/aegis-2026-11-09-exp79:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
SwarmLab worktree /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-09-exp79:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-09-exp79 node experiments/79-journal-authorization-drift/main.mjs`
Run twice baseline; same command after warranted Aegis commit/build. Capture SHA,
source/dist manifests, run IDs, trace hashes, frozen harness hashes, independent scores.
Preregistration commit precedes implementation; harness commit precedes first run.
After novel work: focused hook tests; `npx --yes pnpm@10.9.0 run release:check`;
`npm run verify:evidence`; relevant exp78 regression. Receipt tamper controls and
fresh pinned real-package CI. Linked PRs; merge only green CI and clean mergeability.

## Setup amendment before Aegis edits
The original frozen harness9fa55a2 used strict issuance. Diagnostic runs
jad-mw9avnrp-23305 and jad-mw9avq50-23476 showed ALL unchanged controls blocked:
permitRecordMatches derives only legacy IDs whereas strict issuance uses a separate
namespace. These runs are NOT admitted drift baselines and remain committed.
Use the four-argument real issuance API already used by journal tests, in isolated
stores with exactly one issuance. Store issued roster records creates for inspection;
no remint safety claim. No Aegis edits, hypothesis/scenario/threshold changes.
This setup amendment is committed before rerunning baseline. Strict-issuance journal
compatibility is a separate future hypothesis, not patched or counted tonight.
