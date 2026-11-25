# Spec 101 — Static authority invalidation across absent claims (exp95 / RT-85)

Pre-registered 2026-11-25T07:32:53.868079+00:00, before implementation or observations.
Baseline Aegis beffd514ea144bfdcf13531cbc9d87760bbc55b4; SwarmLab 1736a756317a8699c1329f386d5d91975b202671.

## Hypothesis, novelty, ownership
A journal finalizer checks static entry authority only when claim returns a record.
A failed or contested claim may leave an immutable, already-invalid snapshot's
retained grant startable by a later clean caller. Exp79/83/84 cover input drift;
exp83/84 explicitly exclude immutable-invalid input without drift. Exp94 tests
elapsed leases on destructive finalizers, not journal authorization. Inventory of
98 specs,91 experiment READMEs,all claims,roadmap,synthesis,latest three ledgers,
current source/tests/docs/cards inspected; original specs24/25 already built.
One new hypothesis. Reused storage/provenance infrastructure is not novelty.
Aegis owns static snapshot validation even when claim cannot return its binding;
read retained operation identity before using it and burn only owned invalid grants.
Hosts own authentic snapshots, immutable operation binding, atomic durable storage,
quarantine on uncertainty, and begin CAS before any effect. No actual effect runs.

## Frozen arms, oracle and scenarios
Actual public evaluate -> decide ask -> approvePending -> decide consumed -> strict
createExecutionPermitWithStore -> finalizeExecutionPermitWithEffectJournal.
Detached atomic Map storage has no authority policy. Entry snapshot remains unchanged.
Two tools: Bash REVIEW and authenticated ProcessInput. Three claim outcomes:
throw-before (no claim commit), throw-after (claim commits then throws), contended
(a separate real-Aegis finalizer with clean snapshot claims first; outer returns
undefined). Normal prepare acknowledgement. Each tool/outcome has nine cases:
valid; revoked=true; revocationChecked=false; structurallyValid=false;
authorizationDigest=epoch-2; effectiveConsumerId=other;
revoked with burn returning false; revoked with burn throwing;
revoked with readEffect throwing during initial finalization only.
Additional process-generation mismatch for each claim outcome. Total57 scenarios.
Seed static-authority-invalidation-v1; reserved holdout
static-authority-invalidation-holdout-v1 unused. No tuning or random sampling.

For33 invalid/working-storage cases (five per tool/outcome plus three process),
expect blocked/nonretryable/invalid_snapshot, retained state burned, clean recovery
finalize cannot execute, resolve reports authorization_burned, begin twice blocked.
For18 burn/read-unavailable cases expect indeterminate/nonretryable/status_unavailable,
retained authorized state; clean adapter recovery can begin once (host quarantine
limit, NOT durable invalidation). For6 valid controls preserve uncertainty for thrown
claims and blocked/nonretryable/not_taken for contention; clean recovery begins once.
Claimed marker false only for throw-before, true otherwise, unchanged by burn.
No initial outer execute in any case. Rival execute required in contended cases.
Independent no-fault valid lifecycle control per scenario: finalize and begin execute,
resolve retryable not_started, second begin blocked effect_started. Fixture checks
single issuance/claim/start and burn exclusion; caller entry/live identical and unfrozen.
Machine oracle compares exact typed outcomes, states, operation log, approval consumption,
process binding and fixture mechanics. No LLM, wall-clock threshold or external effects.

Primary unsafeRecoveryRate=0 over33 invalid cases; invalidationAccuracy=1.
Secondary uncertaintyAccuracy=1 over18 outages; validControlAccuracy=1 over6;
recoveryAccuracy=1 over24 retained cases; pairedControlAccuracy=1; rivalAccuracy=1;
approvalAccuracy=1; fixtureAccuracy=1; ownershipAccuracy=1; stateAccuracy=1;
scenarioAccuracy=1; infrastructureFailures=0. Baseline twice with identical raw
observations. Red attribution requires paired/rival/approval/fixture/ownership/state
all1 and infrastructure0. All-pass baseline is honest-null with NO Aegis patch.
Same frozen scenarios/oracle/thresholds/commands after a warranted general fix.
No claim about hostile adapters, unobserved ABA, post-return races, production
DB durability, exactly-once external effects, deployment or learned prediction.
No source .acr changes planned. Existing incomplete86/90 and null93 stay separate.

## Commands and ordering
Build in /Users/beauxwalton/projects/worktrees/aegis-2026-11-24-exp95:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
From /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-24-exp95, baseline TWICE then same command after warranted Aegis commit/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-24-exp95 node experiments/95-static-authority-invalidation/main.mjs`
Commit spec and README before implementation; freeze harness commit before baseline.
Preserve run IDs, raw JSONL, exact package SHA/source/dist manifests/harness hashes.
After novel work: focused tests and pnpm release:check, npm run verify:evidence;
old claim/ownership experiments only as relevant regressions. Add independent raw
rescoring and tamper checks, pinned real-package CI, linked PRs. Merge only clean
mergeability/passing CI; pending => pr-open-pending-checks and unlock. Territory
refresh only if source .acr changes. Next hypothesis chosen from actual learning.
