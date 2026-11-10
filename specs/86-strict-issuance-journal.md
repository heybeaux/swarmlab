# Spec 86 — Strict issuance identity through effect journals (exp80 / RT-70)

## Pre-registration and novelty
Aegis strict shared permits must remain usable through journal authorization,
start, success/failure receipts and resolution, without accepting another issuance's
record or dropping signature validation. Expected current shortfall: strict IDs
use a domain-separated issuance digest, whereas permitRecordMatches recomputes
only the legacy digest, burning legitimate grants. Exp79 setup diagnostics already
suggest this gap; they are motivation, NOT tonight's measured baseline.

Inventory: all specs 01–85, experiments 00–79, CLAIMS, synthesis, roadmap, recent
exp78/79 ledgers and current Aegis source/tests/docs/cards reviewed. Specs24/25 are
built. Exp76/77 cover strict issuance/recovery plus simple destructive take;
exp32–40 cover legacy journal/receipts; exp79 explicitly excludes strict issuance.
This tests composition of identity namespaces with the durable effect lifecycle,
not a reseed of issuance, authority drift or receipt verification.

## Arms, ground truth and scenarios
Real built Aegis public evaluate -> decide ask -> approvePending -> decide consumed
-> createExecutionPermitWithStore; no local policy copy. Two tool variants: Bash
under explicit REVIEW rule, and ProcessInput with authenticated fixed generation.
Every case also runs independent legacy journal success and strict simple-take
controls. A deterministic detached Map fixture supplies ONLY storage operations:
createOnce/retained issued marker, atomic prepare, one claim/start, receipt storage.
Fixture self-checks verify duplicate create/claim/start and retained marker behavior.

Exactly 14 cases per tool (28 total): strict-success, strict-failure,
strict-recovered-handle, strict-prepare-ack-loss, strict-fresh-grant,
legacy-success, signature-change, issuance-change, issuance-remove,
issuance-invalid, cross-grant-record, revoked, read-signature-change,
read-issuance-change. In corruption cases change the stored signature, change/remove
issuanceId, set it to a number, or substitute a genuinely freshly issued record
with its ID relabeled to the old handle. Read corruption cases prepare/claim via
storage primitives using a REAL minted record, then corrupt the retained record;
this isolates read validation without depending on baseline finalization success.
No invented journal policy. Fresh grant requires a second real approval consumption;
old handle must not resolve/start the new operation. Recovery uses real
recoverExisting:true and must return the same handle, with one eventual start.

Positive lifecycle: finalize execute; resolve not_executed/retryable/not_started;
begin execute once; replay begin blocks; receipt completion executed (or failure
failed); resolve exact terminal status, retryable false; terminal begin blocks.
Negative finalize cases must not execute, must burn the claimed effect; clean
resume must never start it. Corrupt read cases must be indeterminate/nonretryable
and block begin without modifying authorized state. Revocation must burn. All
cases retain raw calls, decisions, records, store operations, public results.
No LLM scores. No external effect is executed.

## Metrics and thresholds fixed before execution
Primary strictLifecycleAccuracy=1 across the ten positive strict cases (two tools
x five cases). Secondary negativeAccuracy=1, controlAccuracy=1,
approvalConsumptionAccuracy=1, fixtureAccuracy=1, replaySafety=1,
scenarioAccuracy=1; infrastructureFailures=0. Each is exact deterministic fraction;
no rounding tolerance. Read corruption included in negativeAccuracy. Fresh-grant
positive requires BOTH old and new lifecycles and old-handle rejection.
Baseline twice; require identical raw outputs. Attribute red only if controls,
fixture, approval consumption all equal1 and infrastructureFailures=0. Null means
no Aegis patch. No threshold tuning. Seed strict-issuance-journal-v1; reserved
holdout strict-issuance-journal-holdout-v1 unused unless design tuning is required.

## Ownership and limits
Aegis owns encoding and validating issuance identity across its APIs; retain enough
record metadata to recompute the strict ID, reject malformed metadata or identity
mismatch, preserve legacy validation. Do not merely accept any equal opaque ID.
Host owns truthful consumption identities, authenticated fresh authority, atomic
storage, durable markers and execution of the exact action. This is a deterministic
contract test, not production durability, malicious-host security, external-effect
exactly-once, migration safety or deployment proof. Already stored strict records
lack derivation metadata; any migration limit must be explicit and fail closed.
No .acr change planned; no learned predictor claim.

## Exact commands and ordering
Base Aegis a52fc456d07a05527931c6b2c690e1f09c94ad27;
SwarmLab d308d7cda9362faf2465d55a163d990eb8041df1.
From /Users/beauxwalton/projects/worktrees/aegis-2026-11-09-exp80:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
From /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-09-exp80, run baseline
TWICE, then the exact same command after warranted Aegis commit/build:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-09-exp80 node experiments/80-strict-issuance-journal/main.mjs`
Commit this design before implementation; freeze harness commit before execution.
Preserve source/dist hashes, SHA, trace/run ID and independently rescored outputs.
After novel work: focused tests, pnpm release:check, npm run verify:evidence;
exp77 and exp79 only as compatibility regressions. Linked PRs and pinned actual
package CI, raw readback, tamper tests; merge only passing checks and clean state.
