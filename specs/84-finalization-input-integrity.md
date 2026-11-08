# Spec 84 — Shared finalization input integrity (exp78 / RT-68)

Pre-registered 2026-11-08T07:33:15.069072+00:00, before harness implementation or observations.
Aegis origin/main `2e7d4dd7d8e301713fb4169f9dc4e73d93e6bd98`; SwarmLab origin/main `d6d772b7874dc69222ee8c831cfa782beadec675`.

## Hypothesis and novelty
Caller-owned authority can be repaired while shared finalization awaits storage,
so an invalid entry snapshot can become executable without a fresh finalization
request. Current shared take and reconciled claim validate only the final live
reference. Exp56/58 guard evaluator call/config mutations, not consumed-permit
finalization; exp29 tests static fresh snapshots, exp31 lost take acknowledgements,
exp77 issuance recovery. All specs/README headings, claims, roadmap, synthesis,
current source/tests/docs/cards and latest two ledgers inventoried. Specs24/25 built.
This experiment tests authority consistency across ONE destructive finalization,
not a new revocation policy, issuance replay or differently seeded evaluator test.

## Arms, truth, scenarios
Actual exported finalizeExecutionPermitWithStore and
finalizeExecutionPermitWithReconciliation from built real Aegis. Every case starts
with real evaluate -> decide/request -> approvePending -> decide/consume ->
createExecutionPermitWithStore. Storage fixture implements atomic Map create/take
and prepare/claim, no policy logic. Deferred promise barriers deterministically
pause take (simple) or claimPreparedTake (reconciled); caller mutates while paused.
Controls use a separate permit/store with unchanged valid authority per scenario.
Fixture self-check verifies create duplicate refusal, destructive take and claim.
No LLM judges. Raw entry/live snapshots, return values, operations, consumption,
ready/journal counts, replay and caller ownership retained.

Frozen cross product: Bash and authenticated ProcessInput; simple and reconciled
finalizers; eleven ordered kinds each: unchanged, equivalent nested clone,
revoked-repaired (true->false), unchecked-repaired (false->true),
structure-repaired (false->true), digest-repaired (wrong->bound),
link-repaired (nested revoked true->false), valid-revoked (false->true),
valid-link-revoked, transient-ABA (valid->revoked->valid), unavailable (store throw).
Additionally process-generation-repaired for ProcessInput in both finalizers.
46 cases, 22 repaired hazards. Repairs must BLOCK, consume/burn the grant and
replay must block. Valid-to-invalid cases block; unchanged/equivalent/ABA allow.
Unavailable blocks (simple false; reconciled indeterminate/status_unavailable),
never executes. Reconciled success means status execute/retryable false;
mutation rejection means blocked/invalid_snapshot/retryable false. Simple returns
literal boolean. Ready and prepared journals empty after successful claim/take;
on unavailable fixture throws BEFORE removal, state retained (ready1 for simple,
prepared1 for reconciliation). Replay unavailable is not attempted until recovery;
then a new unchanged valid request may claim once, followed by blocked replay.
Seed finalization-input-integrity-v1; reserved holdout
finalization-input-integrity-holdout-v1 UNUSED. No randomness or threshold tuning.

## Frozen metrics
Primary unsafeRepairExecutionRate over22 repaired cases =0;
mutationBlockAccuracy over30 repair or valid-to-invalid cases =1.
Secondary controlAccuracy46=1, unchangedAccuracy12=1 (unchanged/equivalent/ABA),
unavailableAccuracy4=1, consumptionAccuracy46=1, lifecycleAccuracy46=1,
replayBlockRate46=1, ownershipAccuracy46=1, fixtureAccuracy46=1,
scenarioAccuracy46=1, infrastructureFailures=0.
Baseline twice, require identical raw outcomes. Red attributable only if fixture,
control, consumption=1 and infrastructure=0. Null => no speculative patch.

## Ownership and limits
Aegis owns detached entry-time permit/authority binding and equality at resolution
of its asynchronous simple/reconciled finalization. Changed data fails closed,
including invalid->valid repair; validate the captured binding as well. Burn taken
records. Never freeze or mutate caller-owned data. Equivalent plain-data snapshots
remain valid. Host owns authenticated fresh data, atomic durable take/prepare/claim,
plain-data values and immediately executing exactly the authorized action.
ABA restored between observations, elapsed expiry, malicious adapters, getters/
proxies, external effects, database durability, post-return mutation and separate
effect-journal APIs are NOT proven. No learned predictor claim.

## Exact commands
From `/Users/beauxwalton/projects/worktrees/aegis-2026-11-07-exp78`:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
From `/Users/beauxwalton/projects/worktrees/swarmlab-2026-11-07-exp78`, baseline TWICE then same command after warranted commit/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-07-exp78 node experiments/78-finalization-input-integrity/main.mjs`
Pre-register commit before implementation; frozen harness commit before runs.
Record source/dist manifest, exact SHA, JSONL, replay metrics and run IDs. After
novel work: focused tests; pnpm release:check; npm run verify:evidence; exp77
compatibility regression only. Linked PRs with live pinned-package CI and tamper
controls. Merge only green checks/clean mergeability. No source .acr changes planned.
