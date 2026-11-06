# Spec 82 — Shared issuance capability negotiation (exp76 / RT-66)

Pre-registered 2026-11-06T07:34:07.506702+00:00 BEFORE implementation or baseline observations.
Aegis fetched origin/main `2c3a68d20b0fc7dd033eeba717567a04748fdb02`;
SwarmLab `53557f9227b627129c2d0662fd1c95a6b3f3a43a`.

## Hypothesis and novelty
Independent hosts using destructive shared create/take cannot distinguish an
already issued grant from an unused grant after take. An explicit strict issuance
request is currently ignored; shared creation cannot bind a host's consumed-grant
identity or require a durable issuance capability. Expected failures: remint,
stale handle capturing a fresh grant, and silent fallback with incapable stores.
Exp30 covered global take and duplicate outstanding creation; exp31 covers take
ack loss, exp33 effect-start fencing. Exp75 covers local persisted generations and
explicitly excludes shared stores. This experiment tests the negotiated distributed
issuance contract, cross-adapter contention and CREATE acknowledgement loss;
these mechanisms and refusal metrics are absent from the previous experiments.
Inventory: all specs/experiment README headings, claims, roadmap, synthesis,
latest ledgers, Aegis source/tests/docs/cards; full inventory hashes in nightly
artifacts. Original roadmap Specs24/25 are already built. Shared trace plumbing
is reused and is not novelty.

## Boundary and intended API
Same real public API throughout: createExecutionPermitWithStore(call,evaluation,
approvalId,store,{issuanceId}). Fifth argument requests strict issuance. Current
JavaScript ignores it; no API absence shim or fake Aegis policy. Proposed Aegis
contract requires nonblank bounded string issuanceId and store.createOnce(record),
binds a domain-separated issuance ID to the exact call signature, and NEVER falls
back to create when strict mode requested. createOnce must atomically retain a
permanent issued tombstone AND publish the ready record; return literal true only
for first issuance. take removes only ready state. Aegis selects capability,
constructs identity, fails closed; host supplies truthful per-consumption issuance
identity and atomic durable storage. External authorization service may supply ID;
fixture issues grant-1/grant-2 ONLY after real local approval consumption. Legacy
4-argument callers remain compatible, with explicit NO remint safety claim.
Store is a deterministic transactional Map fixture shared across independent
adapter objects; only storage mechanics, no policy. No real database durability,
network partition, malicious adapter/host, concurrent approval-consumption,
compaction, production rollout or exactly-once external side-effect claim.
Do not use process-local seen sets as a fix. Marker retention/adapter migration
are required. Old finalized records have no issuance history; drain/reapprove.

## Frozen arms, scenarios, ground truth
Seed shared-issuance-capability-v1; reserved holdout shared-issuance-holdout-v1
unused (no tuning/randomness). Tool variants Bash under explicit REVIEW ask rule
and ProcessInput with fixed authenticated host/session/generation. Each scenario
uses real evaluate/decide -> approvePending -> decide consumed. Independent host
adapters share only ready/issued storage; no Aegis local issuance state consulted.
Ordered cases for EACH tool (28 total):
1 success-remint: hostA executes, hostB remint same grant rejects.
2 burn-remint: revoked snapshot burns, valid hostB remint rejects.
3 reconnect-remint: execute then construct new adapter, remint rejects.
4 concurrent-remint: execute then two adapters concurrently retry; both reject.
5 concurrent-initial: two adapters concurrently issue unused same grant; exactly
  one creation succeeds and one execution succeeds; all later handle replays false.
6 fresh-after-success: execute then real fresh approval consumption; grant-2
  issues distinct handle and executes once.
7 fresh-after-burn: burn then fresh consumption; same fresh guarantee.
8 stale-handle-after-fresh: new grant issued, old handle blocks without consuming
  new grant; new handle executes.
9 missing-capability: strict options with adapter lacking createOnce must reject
  before any legacy create or take.
10 missing-issuance: explicit empty options must reject before storage.
11 blank-issuance: whitespace issuance ID must reject before storage.
12 create-before-failure: createOnce throws before commit; creation rejects,
  retry after recovery issues once and executes.
13 create-after-commit-failure: createOnce commits then throws (ack loss);
  first creation rejects, retry rejects, retained issued marker prevents remint.
  Lost handle recovery deliberately out of scope; availability loss accepted.
14 legacy-control: omitted options with simple create/take remains usable once.

Raw calls/evaluations/approval decisions, snapshots, every storage operation and
records, permit handles, create results, finalizer booleans and before/after
storage retained. Separate fixture controls directly exercise storage primitives:
createOnce rejects after take/reconnect; distinct ID succeeds; create permits
reinsert after take. These validate fixture mechanics, not Aegis improvement.
Deterministic literal expected booleans/counts and handle relations are ground
truth. No LLM judge, sleeps, sampling or tuned thresholds. Creation error captured
as observation; unexpected setup failures count infrastructure errors. Input
call/evaluation/options remain unmodified. Timestamp normalization ONLY for repeat
comparison; exact raw traces retained.

## Metrics and locked thresholds
unsafeReissueRate (4 hazards x2 tools) =0; staleHandleExecutionRate(2) =0;
freshApprovalAccuracy(6) =1; concurrentInitialAccuracy(2) =1;
capabilityRefusalAccuracy(6) =1; createFailureAccuracy(4) =1;
legacyAccuracy(2) =1; approvalConsumptionRate(28) =1;
initialLifecycleAccuracy(28, non-lifecycle cases vacuously valid) =1;
replayBlockRate(28) =1; ownershipRate(28) =1;
fixtureControlAccuracy =1; scenarioAccuracy(28) =1; infrastructureFailures=0.
Baseline twice with identical normalized raw responses/metrics required. Only
attribute red when initial lifecycle/consumption/fixture controls pass and
infrastructure=0. Honest null means no Aegis patch. Same scenarios, thresholds,
seed and frozen code after fix; never tune from observed output.

## Exact commands and evidence
Aegis worktree `/Users/beauxwalton/projects/worktrees/aegis-2026-11-05-exp76`:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
SwarmLab worktree, baseline TWICE then same command after warranted committed
Aegis patch/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-05-exp76 node experiments/76-shared-issuance-capability/main.mjs`
Capture exact SHA, clean state, source/dist manifest, frozen harness hashes, run
IDs, JSONL and independently recomputed scores. Pre-registration commit precedes
implementation; freeze harness commit precedes observations. Preserve red traces.
Focused Aegis regression tests, independent receipts verifier/tamper tests and
fresh pinned-package CI. AFTER novel work: `npm run verify:evidence`, relevant
exp74/75 regression, `npx --yes pnpm@10.9.0 run release:check`. All CI/mergeability
must pass to land; pending checks allow overnight pending exit. No .acr edits
planned; refresh Territory only if source cards change.

## Harness correction before any Aegis edits
Initial runs sic-mw4nu27u-64213 and sic-mw4nu4d0-64261 preserved as
non-admitted diagnostics: oracle incorrectly looked for approval.status instead of
public approval.event. Raw traces show event requested/consumed and exit2/0.
Correct only field lookup, retain all thresholds/scenarios/seed/host code; rerun
baseline twice before attribution or patch. Old oracle recoverable at28cc942.
