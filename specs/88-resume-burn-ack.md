# Spec 88 — Resume invalidation acknowledgement (exp82 / RT-72)

Pre-registered 2026-11-12T07:32:51.614606+00:00 before implementation or observations.
Baseline Aegis 63387b582721c5326780b7e936c226ff61c1597f;
SwarmLab 93da56866b11bf1988b4b9d554c76bafca3d77ee.

## Hypothesis and novelty
Resume/start discard a negative burn acknowledgement and report definitive
invalid_snapshot while retained authorization remains startable, or has concurrently
started. The missing capability is truthful invalidation outcome reporting at resumed
execution boundaries. Exp79 covered initial prepare/claim invalidation failures;
exp81 covered entry authority across read/CAS and explicitly excluded burn failures.
Exp31 concerns destructive take reconciliation; exp32 crash outcomes; exp33 start CAS;
exp34-49 receipt/revision/authority truth, not failed resumed invalidation. All spec
and experiment inventories, claims, roadmap, synthesis, recent ledgers and current
Aegis code/tests/docs/cards inspected. Specs24/25 already built. Reusing mechanical
storage/provenance utilities does not count as novelty; this fault/outcome question does.

## Frozen design and deterministic truth
Real built evaluate -> decide ask -> approvePending -> decide consumed -> strict
createExecutionPermitWithStore -> finalizeExecutionPermitWithEffectJournal creates a
claimed authorized record. Then public resolveExecutionEffect or beginExecutionEffect
is called with revoked authority. Detached Map storage implements only atomic storage,
no policy; raw operations, states, decisions, responses and clean adapter observations
are retained. Both Bash with REVIEW rule and authenticated ProcessInput.

Exactly24 cases: two tools x two APIs x six modes:
- valid: unchanged authority, burn callback must not run, ordinary resolve retry/start.
- burn-true: revoked authority, burn commits and returns true.
- burn-false: revoked authority, burn returns false without mutation.
- throw-before: revoked authority, burn throws before mutation.
- throw-after: revoked authority, burn commits then throws (lost acknowledgement).
- concurrent-start: while revoked request awaits burn, independent clean-authority
  adapter successfully starts the authorized effect; burn then returns false because
  started state cannot be burned. This is a competing authorized host, not a claim
  that revoked authority may execute. No external effect is performed.

Each case also has an independent ordinary real-package control and direct fixture
checks for single create/claim/start, permanent burn and detached ownership. Initial
finalization must execute and leave claimed authorized state. For burn-true, result
must be not_executed (resolve) or blocked (begin), retryable false, invalid_snapshot;
state burned; clean begin blocked authorization_burned. For every false/throw case,
result must be indeterminate, retryable false, journal_unavailable (resolve) or
status_unavailable (begin). Never label uncertain invalidation definitive. Underlying
state is authorized for false/throw-before, burned for throw-after, started for
concurrent-start. Clean-adapter diagnostic begin executes exactly once for authorized
state, blocks authorization_burned for burned, blocks effect_started for started.
Diagnostic probes document why host quarantine is necessary; preventing these probes
is NOT the success criterion. Aegis cannot durably revoke while storage fails.
Valid control: resolve retryable not_started or begin execute; no burn; one start total.
Every second diagnostic begin blocks; no duplicate start or false external-effect claim.

## Frozen metrics / thresholds
falseDefinitiveRate=0 across16 uncertain-burn cases; uncertaintyAccuracy=1 across16;
confirmedBurnAccuracy=1 across4 burn-true cases; validAccuracy=1 across4 valid cases;
stateAccuracy=1; probeAccuracy=1; controlAccuracy=1; approvalConsumptionAccuracy=1;
fixtureAccuracy=1; scenarioAccuracy=1; infrastructureFailures=0.
Baseline twice, raw observations identical. Attribute red only when fixture, control,
approval consumption and state accuracy all1 and infrastructure0. Thresholds fixed.
Seed resume-burn-ack-v1; reserved holdout resume-burn-ack-holdout-v1 unused, no tuning.
Null means no Aegis patch. No LLM judges success.

## Ownership and limits
Aegis must consume burn acknowledgements and expose uncertainty without execute/retry.
Host owns truthful durable atomic storage, authentic fresh authority and quarantine /
reconciliation of indeterminate operations. Do not turn a store-local rejection into
cross-host revocation claims. No production database durability, post-return safety,
malicious adapter defense, external-effect execution or learned predictor claim.
No .acr edit planned. Preserve red traces and package source/dist hashes.

## Exact commands
From /Users/beauxwalton/projects/worktrees/aegis-2026-11-11-exp82:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
From /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-11-exp82, twice baseline,
then unchanged after warranted Aegis commit/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-11-exp82 node experiments/82-resume-burn-ack/main.mjs`
Commit spec before implementation, harness before observations. Then focused tests,
`npx --yes pnpm@10.9.0 run release:check` and `npm run verify:evidence`; exp79/81 as
post-change regressions only. Frozen receipt rescoring, tamper controls, live pinned
package CI, linked PRs. Merge only all checks green and clean mergeability.
