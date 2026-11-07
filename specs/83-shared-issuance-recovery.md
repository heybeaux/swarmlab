# Spec 83 — Shared issuance acknowledgement recovery (exp77 / RT-67)

Registered 2026-11-07T07:32:41.223416+00:00 before implementation and baseline observations.
Aegis origin/main 340cc7798d375f131c0e5181bfe213e0249296f2;
SwarmLab origin/main d190a630034d91550c408db5a2d9c33abeec6336.

## Hypothesis, novelty and boundary
A committed strict issuance with lost reply or lost client handle is permanently
orphaned even while its ready record exists. Recovering the SAME handle after
exact readback can restore availability without reissuing authority. Exp76
explicitly excludes recovery and accepts this orphan. Exp31 reconciles destructive
TAKE ownership; exp36 reconciles terminal effect receipts. Neither tests recovery
of CREATE identity, exact creation readback or racing recovered handles. All
spec/experiment headings, evidence claims, roadmap, synthesis, latest ledgers,
Aegis code/tests/docs/cards were inventoried; Specs24/25 already built.

Real API: createExecutionPermitWithStore(call,evaluation,id,store,
{issuanceId:'grant-1',recoverExisting:true}). Current JavaScript accepts this
object but ignores recoverExisting. Proposed optional contract requires
readIssuedPermit(id), returning a detached ready record ONLY when permanent
issued marker and ready record both exist. On false/exception from createOnce,
exact readback may recover a handle; no readback means reject. Missing capability
must reject before creating. Existing strict default stays reject-on-duplicate.
Recovery MUST NOT recreate or take state, mint new identity, or authorize execution.
Multiple hosts may recover the same handle; atomic take plus fresh snapshot
validation still permits only one execution. Exact record binding includes all
fields, signature, authority, delegation and process target. Host owns authentic
per-consumption IDs, durable atomic createOnce+marker, coherent readback and take.
Fixture Map implements storage only. No DB durability, malicious host, network
partition, external side effect, crash-after-take recovery, deployment or marker
compaction claim. No new learned predictor claim.

## Frozen design
Two tools Bash (explicit REVIEW ask) and ProcessInput (authenticated fixed target).
Each case real evaluate/decide -> approvePending -> decide consumed. Independent
host adapters share only store. Deterministic no-recovery arm issues once with
simulated lost acknowledgement, then retry default rejects, retaining ready1/
issued1; documents deliberate availability tradeoff, not improvement.

For EACH tool, ordered cases:
1 normal-control: recover option, first create succeeds, finalize once.
2 precommit-retry: throw before commit; first rejects, healthy retry succeeds once.
3 ack-loss: create commits then throws; immediate exact readback recovers, once.
4 reconnect-recovery: default creation loses acknowledgement; new adapter with
  recovery returns original ready handle, once.
5 concurrent-recovery: lost handle, two adapters recover same ID, parallel
  finalization results exactly one true and one false.
6 spent-recovery: normal create/finalize, recovery rejects, marker retained.
7 revoked-recovery: lost handle recovered, revoked fresh snapshot blocks/burns;
  healthy recovery then rejects.
8 unavailable-read: lost handle, read throws; reject, ready retained, no execution.
9 absent-read: lost handle, read returns undefined; reject, ready retained.
10 mismatched-signature: lost handle, read copy changes signature; reject.
11 mismatched-authority: lost handle, read copy changes authorizationDigest; reject.
12 missing-capability: recover requested on adapter without readIssuedPermit;
  reject BEFORE any createOnce/create/take operation.
13 stale-handle-fresh: recovered grant1 executes, new real approval consumption
  creates grant2; old handle blocks, fresh handle executes, identities differ.
14 default-no-recovery: lost handle, retry WITHOUT recovery rejects.

28 total. Raw request/decision, records, store operations, creation accepted/errors,
handles, finalizer responses and state retained. Fixture controls verify read
requires marker+ready, take retains marker, spent read absent. No LLM scores.
Seed shared-issuance-recovery-v1, holdout shared-issuance-recovery-holdout-v1
reserved unused, no random scenario generation or tuning.

## Locked thresholds
Primary recoveryAccuracy over ack-loss/reconnect/concurrent/revoked/stale cases
(10) =1; duplicateExecutionRate over concurrent2=0; unsafeReadbackAcceptanceRate
over unavailable/absent/mismatched-signature/mismatched-authority (8)=0.
Secondary refusalAccuracy2=1; lifecycleAccuracy28=1; consumptionAccuracy28=1;
replayBlockRate28=1; controlAccuracy28=1; fixtureAccuracy28=1;
scenarioAccuracy28=1; infrastructureFailures=0. Scenario truth uses literal
boolean arrays, counts and identity relationships (opaque IDs compared relationally).
Baseline TWICE; identical deterministic raw observations after removing approval
creation timestamps. Red attributable only with consumption/control/fixture=1,
infrastructure=0. Null => no Aegis patch. Same frozen code/thresholds after fix.

## Exact commands and evidence
In Aegis worktree /Users/beauxwalton/projects/worktrees/aegis-2026-11-06-exp77:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
In SwarmLab worktree baseline twice, then after warranted Aegis commit/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-06-exp77 node experiments/77-shared-issuance-recovery/main.mjs`
Pre-registration commit before harness; harness commit before observations.
Capture Aegis clean SHA, complete source/dist manifests, frozen harness hashes,
run IDs, logs, raw JSONL, independent replay scores and content-addressed receipts.
After novel work: focused regression tests, receipt tamper tests, live pinned
Aegis CI; `npm run verify:evidence`; `npx --yes pnpm@10.9.0 run release:check`;
exp76 relevant compatibility regression only. Linked PRs; all checks and clean
mergeability required. No .acr edits planned, Territory only if source cards change.
