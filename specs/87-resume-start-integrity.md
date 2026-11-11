# Spec 87 — Resume/start authority integrity (exp81 / RT-71)

Pre-registered 2026-11-11T07:32:59.853082+00:00, before implementation or observations.
Baseline Aegis 6f29b9a72d97948ca85ac7b4862679be25cd350a; SwarmLab a5f394e730f600431736684c1d2c54fe8e18b480.

## Hypothesis and novelty
A retained authorized effect can be resumed or started using authority that was
invalid at entry but repaired during asynchronous journal read. A valid snapshot
can also be revoked during begin CAS or its post-CAS read without blocking execute.
Expected gap: resolve/begin validate live references after reads, and begin does
not revalidate caller authority after CAS. This tests resumed authorization and
post-CAS permission, not initial authorization or a different seed of exp78/79.
Inventory: all spec/experiment headings, claims, synthesis, roadmap, recent ledgers,
current Aegis source/tests/docs/cards; original roadmap specs24/25 already built.
Exp32 covers static invalid resume; exp33 concurrent CAS; exp41-49 journal authority
rollback; exp78 initial destructive finalization; exp79 durable initial-authorization
drift; exp80 strict issuance composition. None tests this resumed caller input seam.

## Frozen design / ground truth
Actual built Aegis evaluate -> decide ask -> approvePending -> decide consumed ->
createExecutionPermitWithStore -> finalizeExecutionPermitWithEffectJournal creates
a real retained authorized/claimed record. Then call public resolveExecutionEffect
or beginExecutionEffect through a fresh adapter. Detached Map storage implements
only atomic mechanics, no policy. Strict issuance with unique consumption identity.
Promise barriers suspend first read, begin CAS, or second read. Mutate caller
snapshot while suspended; preserve entry/live snapshots, results, journal states,
operations, control, approval observations. No LLM judges, no external effect.

Both Bash with REVIEW rule and authenticated ProcessInput. For each tool and each
API (resolve, begin), six first-read cases: unchanged, equivalent nested clone,
repair-revoked (true->false), repair-digest (wrong->bound), repair-link (nested revoked
true->false), valid-revoked (false->true). Process additionally repair-generation
(wrong->bound) for each API. Begin additionally cas-revoked and post-read-revoked
for each tool. Total30 cases: 14 repairs, 4 late revocations, 4 first-read revocations,
8 unchanged/equivalent positives. Seed resume-start-integrity-v1; holdout
resume-start-integrity-holdout-v1 reserved unused. No tuning or stochastic sampling.

Read-stage invalid/mutated authority must return invalid_snapshot, retryable false,
not_executed for resolve or blocked for begin; durably burn authorized record;
clean authority retry through new adapter must not start it. Late begin revocation
must block invalid_snapshot, never execute; started state remains a conservative
fence, clean replay blocks effect_started. No false executed claim. Unchanged and
equivalent: resolve not_executed/retryable true/not_started; begin execute once,
subsequent begin blocked. Resolve must not mutate storage for valid authority.
Every scenario has an independent unchanged real-package control, plus fixture
self-check for single claim/start, permanent burn and detached record ownership.
Assert actual state, not just exit codes. Caller data remains mutable and unmodified
by Aegis. Baseline twice with identical raw responses required.

## Locked metrics
unsafeAuthorityRate=0 over18 repairs/late revocations; rejectionAccuracy=1 over22
hazards; positiveAccuracy=1 over8 positives; controlAccuracy=1;
approvalConsumptionAccuracy=1; fixtureAccuracy=1; ownershipAccuracy=1;
replaySafety=1; scenarioAccuracy=1; infrastructureFailures=0.
Red attributable only with control, consumption, fixture=1 and infrastructure=0.
Null -> no patch. No threshold, scenario or oracle tuning after results.

## Ownership / limits
Aegis owns entry snapshot binding and checking drift before retry permission and
before returning execute, including after CAS. Retain entry data independently;
validate captured authority; reject changed authority; never freeze/mutate callers.
Before CAS, invalid authority requests permanent burn. After CAS, do not roll back
started (could permit duplicate effects); refuse execute and retain fence.
Host owns authentic fresh plain data, durable atomic storage and effect invocation.
No production durability, arbitrary getters/proxies, between-observation ABA,
post-return mutation, elapsed time or new strict-wrapper preflight guarantee.
Store failure modes remain existing contract, not this experiment's hypothesis.
No .acr edits planned. No deployment/predictor claim.

## Exact commands
From /Users/beauxwalton/projects/worktrees/aegis-2026-11-10-exp81:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
From /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-10-exp81, twice baseline then same after warranted commit/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-10-exp81 node experiments/81-resume-start-integrity/main.mjs`
Commit this spec before implementation; freeze harness commit before observations.
Preserve SHA/source/dist manifests, JSONL/result hashes, independent rescoring.
Then focused unit regressions, full pnpm release:check, npm run verify:evidence;
exp79/80 as regressions only. Linked PRs, live pinned-package CI and receipt tamper
controls; merge only passing checks and clean mergeability.
