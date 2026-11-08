# Evidence Ledger

SwarmLab's evidence chain is now explicit:

`claim → experiment → run id → trace path → score fields → reproduction command → stack recommendation`

The machine-readable ledger lives at [`../CLAIMS.json`](../CLAIMS.json). It is intentionally boring JSON so a fresh clone, reviewer, or future agent can audit the corpus without conversation memory.

## How to read `CLAIMS.json`

Each entry represents one headline retest claim from `SYNTHESIS.md` (`RT-01` and onward).

The latest admitted claim is **RT-55**, exp65 direct loader validation-snapshot
ownership (Spec71). Frozen18-scenario real-Aegis repeated red `lro-mvalf27u` /
`lro-mvalf2al` and same-design green `lro-mvalgz7p` preserve all observable rows,
38-event full replay, exact Git/source/dist manifests and content-addressed
receipts. `node experiments/65-loaded-rule-ownership/verify-receipts.mjs` verifies
frozen receipts. CI also reruns the frozen design against pinned real Aegis and
checks fresh live rows/artifacts; static score checks alone are not runtime proof.
Full corpus currently50 claims108 traces1001 assertions; ids RT50–53 remain on
separate unmerged branches, not silently certified by the range label.

Required fields:

- `id` — stable claim id, matching the `SYNTHESIS.md` heading.
- `claim` — one-sentence claim in plain English.
- `experiment` — experiment folder that owns the harness.
- `spec` — dispatch/spec file that authorized the work.
- `runIds` — run ids named in the trace filenames or writeup.
- `tracePaths` — committed JSONL trace files used as evidence.
- `scoreFields` — assertion keys the verifier should check.
- `expectedValues` — expected numeric values for those score fields.
- `reproductionCommand` — command to regenerate a comparable run. New timestamps mean a regenerated run will not have the same filename, but it should reproduce the same score fields under the same seed.
- `stackRecommendation` — architecture recommendation produced by the evidence.
- `stackReposAndPRs` — external repos, branches, commits, and PRs when the retest links real packages.
- `evidenceStatus` — one of:
  - `verified` — committed traces support the claim with exact score assertions.
  - `in_sample` — committed traces support the claim, but policy/threshold selection used the same seed family and still needs holdout confirmation.
  - `exhibition_only` — useful live texture, not replicated evidence.
  - `needs_holdout` — the current result should not be treated as a recommendation until fresh seeds exist.
- `notes` — caveats and historical provenance gaps.

Assertion key format:

```text
<trace path>#<score selector>.<score field>
```

Supported selectors in `npm run verify:evidence`:

- `last.<field>` — last score event in the trace.
- `first.<field>` — first score event in the trace.
- `score[N].<field>` — zero-based score-event index.

Example:

```text
experiments/08-rumor-mill/runs/rm-engram-mr7uzjds.jsonl#last.coverageOutrunsTruth
```

## Verification command

From the repo root:

```bash
npm run verify:evidence
```

The verifier:

1. loads `CLAIMS.json`;
2. checks required claim fields;
3. confirms each trace path exists;
4. replays each JSONL trace through `@swarmlab/core`'s trace reader;
5. finds score events;
6. asserts each listed score field equals the expected value within tolerance;
7. fails if a `verified` claim has no trace evidence or assertions.

This does not rerun every simulation. It verifies the committed evidence corpus. Use each claim's `reproductionCommand` when you need to regenerate fresh traces.

## Run metadata convention for new traces

Existing historical traces often start with a `message` event on topic `meta`, but the metadata is inconsistent. From Spec 22 onward, every new committed run should start with a first JSONL header event in this shape:

```json
{
  "t": "message",
  "ts": 1783277025056,
  "from": "moderator",
  "to": "*",
  "topic": "meta",
  "body": {
    "evidenceVersion": 1,
    "experiment": "16-handoff-guards",
    "spec": "21-handoff-requirement-guards",
    "runId": "hg-example",
    "timestamp": "2026-07-06T14:22:00.000Z",
    "repo": {
      "commit": "<swarmlab git sha>",
      "dirty": false
    },
    "command": "node experiments/16-handoff-guards/dist/main.js",
    "seed": "delegation-decay-v1",
    "seedFamily": "delegation-decay-v1",
    "evidenceKind": "deterministic_sim",
    "model": null,
    "provider": null,
    "externalPackages": [
      {
        "name": "@openengram/reconciliation",
        "repo": "~/projects/engram",
        "branch": "versioned-facts-anti-entropy",
        "commit": "0a4910d",
        "dirty": false,
        "dependency": "file:../../../../../../../projects/engram/src/reconciliation"
      }
    ]
  }
}
```

`evidenceKind` should be one of:

- `deterministic_sim`
- `live_llm_exhibition`
- `live_llm_replicated`
- `package_retest`

For any `file:` dependency, record the external package repo, branch, commit SHA, and dirty state. If a historical run did not capture this, mark the ledger note as `unknown_past_run`; do not reconstruct provenance from vibes.

## Holdout discipline

Tuned policies must be labeled `in_sample` until fresh holdout seeds are run. Historical example: `RT-06` evidence-capped probation started as `in_sample` while its probe cadence was still shared-seed-only, then moved to `verified` after the August 15, 2026 five-seed holdout sweep.

## RT-45 — exp-55 durable source-policy roster checkpoint

Pre-registration `730e3b3f8fdc98fc11a85889f47cdc47e70bd65f`; red `sprc-muwb2jz7` (repeat `sprc-muwb2k1q`), green `sprc-muwb77jk`, runtime `86d68cd30c08a26e7ad8e18918770aa069d3f8c7`. Three committed traces, 71 events each, full replay equality verified. Baseline unsafe allow 12/13 → 0; exact accuracy 10/22 → 1; detection 1/13 → 1. Each trace binds the real Aegis artifact and frozen harness with SHA-256. No tuned policy; reserved holdout unused. Pure evaluate remains compatible, not durable-safe. See Spec 61 and CLAIMS.json for exact fields.

## RT-46 — Async gate input integrity (exp-56 / Spec 62)

Pre-registration `57a40a8988e6659b0ab8a008237b14af078ff197` precedes implementation and output. A valid host checkpoint did not save a
mutable caller object: real baseline Aegis `f37864f945fa914e56c4e1cc070c8874733d9f96` allowed **12/12**
mutated action/evidence cases while awaiting read/observe/read. Runs `agii-muxqic7t` and `agii-muxqic9t`
both had exact accuracy **6/18**, mutation detection **0**, and fixture **18/18**.

Aegis `21f34fbedcfb8f48bbe3f61522e530de7595d563` privately snapshots ToolCall and compares the live input after each awaited
operation. Early visible mutation prevents observe; later mutation refuses stale authorization;
new critical command preserves deny. Same frozen scenario/seed/harness/API run `agii-muxqm4fw` is
**18/18** with unsafe allow **0**, detection **1**, all secondary metrics **1**. No thresholds moved.
Three committed traces (59 events each), full artifact manifests, harness SHA-256, and exact scores
are pinned in CLAIMS.json. Nine focused new tests cover these boundaries.

This is observable reference-integrity, not action atomicity. Equivalent deep copies remain allowed;
the explicit transient ABA control remains allowed. Host must own authentic checkpoint truth, stable
plain-data actions, stable rules/options and exact execution after return. Proxy/getter behavior,
restored transient mutation and post-return changes are unproven. RT-45's historical rollback check
is still distinct. Regression-only evidence commands do not count as this new development.


### RT-47 — Unchanged source observations expire during async checkpoint I/O (exp-57)

Pre-registration `180db76` froze20 scenarios and integer monotonic-clock ground truth before
implementation/output. Unlike exp56 input aliasing, input and policy remain unchanged throughout.
Real origin/main Aegis `1550e6ed8a660febee30ce6fe291f41b87bf1bf1` allowed all12 expiry/clock hazards
(`ase-muz5zo5h`, repeat `ase-muz5zoav` with identical scenario rows), reached8/20 exact accuracy,
and never sampled elapsed lifetime. The independent fixture was perfect; checkpoint truth remained valid.

Runtime `aeb1abf434d0789b1770ffc956ddb6c96aa987c0` adds optional monotonic-clock injection (real `performance.now` default),
private entry sample/function capture, inclusive remaining-budget comparisons after read/observe/read,
invalid/regressing/throwing-clock refusal, early no-observe and post-observe no-read discipline,
and deny-floor preservation. SAME frozen harness/seed/scenarios reran as `ase-muz63pn3`:
unsafe allow0/12, detection1, exact accuracy20/20 and every secondary metric1. All65events
replay exactly; trace manifests bind source and complete real built Aegis artifact, not a local policy copy.

Hosts still own trustworthy initial source timestamps, units/clock, authentic persistence and exact
immediate action after return. This does not re-observe sources, detect changes inside a valid window,
validate colluding clocks, cover pre-invocation latency/rules-options mutation or close post-return races.
No predictive calibration or production-database claim. Reserved holdout unused; no policy tuned.

## RT-49 — Evaluation receipt reference ownership (exp-59 / Spec65)

Pre-registered `f54a6a1a0f069b1cc4f2f9e4cc6b1de68ee7cedb` before implementation/output. Baseline fetched main Aegis1550e6e produced receipt drift **8/8**, cross-call contamination **8/8**, and exact scenario accuracy **3/21** in both `ero-mv20uicz` and `ero-mv20uig5`. Returned prediction and ruleVersions referenced caller-owned metadata. Matched-rule, defaults and explicit mutation controls correctly stayed independent; detached consumer control was **21/21**.

Committed Aegis `7b4c5b08ab09201d6371a06de343eb435f0b26ed` copies prediction public fields and version strings at construction; existing matches were already private. Unchanged frozen harness/scenarios/seed `ero-mv20w6b7` yields drift **0**, contamination **0**, accuracy **21/21**, all secondary metrics **1**. Three replay-verified68-event traces bind source/dist/full artifact manifests and identical harness hashes. Ten focused regressions added. This is output-to-input reference isolation AFTER return across pure/async APIs, unlike RT46/48 in-flight input/config checks.

Results are evidence-verified but **candidate merge/CI not yet confirmed**. No mutable-record tamper detection, signed persistence, transactional action, getter/proxy/extension-data or live production incident claim. Host still owns exact execution and durable signed receipts. Prior exp57/58 remain separately unlanded; no combined certification. Reserved holdout unused; no tuning. Regression verification is not novelty.

RT49 paired candidates: [Aegis64](https://github.com/heybeaux/aegis/pull/64) / [SwarmLab47](https://github.com/heybeaux/swarmlab/pull/47). Local release/static/test checks green (1085 tests: 628+95+22+86+51+203), SwarmLab evidence46 claims96 traces872 assertions. GitHub checks/independent review pending at this documentation commit; no remote merge claim.

### RT-48 / exp58

Spec64 preregistration b0378e0. Baseline1550e6e: `aci-mv0ldq1x`, repeat `aci-mv0ldq3x`; runtime `2dfc4929a9a8f94b28875b69cad577ebe0822fce`, green `aci-mv0lgl6y`. Three admitted 68-event traces; 48 exact scores. Configuration drift is novel; exp55/56 reruns are regression only, exp57 is prior work.

Linked PRs: https://github.com/heybeaux/aegis/pull/63 (Aegis), https://github.com/heybeaux/swarmlab/pull/46 (SwarmLab). Local green; CI status inspected in tonight's pipeline ledger before any merge.

## RT-47 + RT-48 integration check (not new experimental evidence)

After the independent frozen exp57 and exp58 receipts, both implementations were combined on a
base that already contained RT49. The original candidate manifests and run IDs above remain
historical, not retroactively attributed to this combined source. The unchanged exp57 and exp58
harnesses each replayed against the combined built Aegis package: 65/65 and 68/68 events,
respectively, with unsafe allow rate 0 and resolution accuracy 1 in both. Aegis release:check
passed with 49/49 evidence mappings and combined clock/config unit tests. These integration
checks do not expand the original experiment scope or certify post-return atomicity.

## RT54 — Merged rule reference ownership (exp64 / Spec70, 2026-10-14)

New pre-registered question: can caller-owned rule recipes edit already-constructed
cascade policy between synchronous merge and compilation? Pre-registration `4e5c4c8`;
21 frozen scenarios, no tuning or LLM judge. Distinct from in-flight RT48, receipt
metadata RT49, defaults RT51, compiled-cache RT52 and overlay consent RT53.

Real Aegis `4be84ed` baseline `mro-mv96376j` / `mro-mv9637ag` identical rows:
producer drift **8/9**, unsafe allow **8/9**, exact resolution **8/21**;
consumer isolation **0**, compatibility controls **7/9**, caller ownership **1**.
Independent detached-boundary diagnostic **21/21** on both baselines; it is a
control, not replacement Aegis. These red traces remain committed.

Runtime patch `f27427879984856bad36731788376dbc74702aaa` clones each effective Rule independently at
merge return. Separate cloning is important: cloning the whole array preserves
shared nested identities across distinct rule ids. Same unchanged harness/seeds,
`mro-mv966i1f`: producer drift **0/9**, unsafe allow **0/9**, resolution **21/21**,
all secondary metrics **1**,46-event full replay; manifests pin real package.
Focused frozen tests **16 red/4 pass ->20 green**. Thresholds unchanged.

Host owns provenance, deliberate policy edits and reloading; result remains
editable. Direct loadPack binding, live immutability/atomic execution, getters or
proxies are not claimed. Stored scores are historical regression evidence,
not runtime verification. Full regression and remote CI/PR status will be recorded
below when actually observed. Prior exp60–63 candidates remain separate/unmerged.

### Regression verification (not new evidence)
Full Aegis release:check at `edb9f55`: build/typecheck **1145/1145 tests**
(628core,152Aegis,22collect,86label,203hook,54bench), static measured evidence **50/50**.
Initial evidence catalogue update exposed one stale expected report banner, not a
runtime regression: corrected RT49->RT54 expectation; preserved red log, full rerun
green. SwarmLab build/typecheck and verify:evidence **49claims105traces980assertions**.
Fresh same-harness `mro-mv96dcb4` on clean final candidate **21/21**, actual source/dist
manifest audited. Frozen red+green46-event receipts verified; no thresholds moved.
Baseline frozen/remerge compatibility controls fail on real old Aegis7/9, whereas
the detached diagnostic is21/21, distinguishing general ownership gap from fixture
failure. Holdout remains unused. No source .acr changes; Territory not refreshed.

### Linked PRs and observed GitHub CI
Aegis [PR70](https://github.com/heybeaux/aegis/pull/70), candidate
`edb9f557fc776b5710360a453f0df0146f3b977b`: release-check
[38694629492](https://github.com/heybeaux/aegis/actions/runs/38694629492) **SUCCESS**.
SwarmLab [PR53](https://github.com/heybeaux/swarmlab/pull/53), evidence
`b973bd8db231b4168191a773f9f0e06f463192a2`: portable replay + pinned real-package
[38694637393](https://github.com/heybeaux/swarmlab/actions/runs/38694637393) **SUCCESS**.
Both inspected CLEAN/MERGEABLE; CodeRabbit success is review-skipped, **not review
approval**. No protections bypassed. Final documentation commit will get its own CI;
merge/main SHA/status recorded in the nightly ledger, not inferred here.

### Verifier hardening follow-up (2026-10-14, not new evidence)
An independent audit found that `verify-receipts.mjs --run` checked self-reported row
booleans but not the full observable data. It accepted missing or empty check maps,
changed rule/input/action data with unchanged booleans, missing or retagged log
identity/summary, and stale timestamps. Manifest and unsafe-action tampering were
already rejected. The admitted red/green traces were never affected: their bodies
match, and the runtime fix independently passed.
The verifier now requires the exact per-scenario check keys. It requires both arms'
live scenario bodies to equal the content-addressed pinned green rows. It binds
log run ID, trace path, summary and replay count to the recomputed trace. It rejects
frozen receipts presented as live runs. With `--since`, it requires fresh,
monotonic timestamps; CI requires `--since`. `test-verifier.mjs` checks 17 tampered
copies of a fresh live log, plus a positive control and a CI freshness check, and
runs in CI. Frozen harness hash, thresholds, scenarios, receipts and traces are
unchanged. The audit rerun was not admitted as evidence. Limitation: run identity
is bound by filename because the frozen harness does not embed `runId` in the trace.


## RT-62 / exp72 — Interactive process input is not a complete command

[Spec78](../specs/78-process-input-boundary.md), preregistration12edf6f, frozen796b77e.
Fetched main32391a41c4d09cdad2e4aa083382b222d78976c2 reproduced two red runs
`pib-mvowbjbg-97970` / `pib-mvowbjgw-97989`: reviewCoverage0/18,
identityCoverage0/18, directBoundaryAccuracy0. All9compatibility controls and
destructive-command positive-control checks pass; independent deny, ownership
and recovery remain1. This is a new action-boundary policy, NOT empirical shell
execution or a claim that these27 fixtures exhaust terminal behavior.

Actual runtime97108ecec292dc2642c3f87692e57b2ff49c7a92, same27cases
`pib-mvowdfh8-1211`: review/identity/directBoundary/control/deny/ownership/recovery
and resolution all1, infrastructure0. No threshold tuning or holdout use.
Source/dist/package hashes, full raw JSONL and sidecars committed; companion
verifier recomputes raw checks, binds identities/timestamps/artifacts, rejects26
forgeries; CI runs fresh exact pinned package and checks observable equality.

General fix: classify OpenClaw process.write/send-keys/paste/submit as ProcessInput;
independent ask floor cannot be configured away by optimistic prediction or
severity. No fabricated rule hits, genuine deny wins. Bind action/sessionId and
raw input fields via detached digest into approvalSignature/actionKeyFor.
Do NOT map fragments to independently safe Bash commands: benign/empty text,
EOF or submit may complete existing buffered input. Read/management controls
unchanged. Host owns input validation, authenticated process/session, buffered
terminal state and exact approved execution. No terminal emulator, safe-fragment
exemption, actual approval consumption, automatic plugin rollout, calibrated
prediction or production-safety claim.

Regression-only: focused17tests pass; full local release1225tests
(628+216+22+86+217+56), historical52/52. SwarmLab core build/forcedtypecheck
and changed ESM syntax pass; verify:evidence53claims117traces1073assertions.
Candidate evidence bookkeeping initially lacked required change field; typecheck
red retained in execution log, corrected before commit. Final release rerun/checks
reported in nightly ledger. RT62 stays pending/outside landed catalogue.
Prior Aegis78 remains OPEN/CIred at unchanged core clock test; no lucky rerun,
prior branch absorption or unrelated repair. .acr unchanged; Territory skipped.

Linked PRs/CI status are recorded after observation. No merge claimed here.
Next distinct question: binding payload/session strings does not attest immutable
process-generation identity; can a recycled session handle replay approval?
This requires host authenticated generation evidence, NOT another input-fragment
variant. Queue path/argv cumulative work remains separate/unselected.

### Observed exact-head PR CI / linked delivery
[Aegis80](https://github.com/heybeaux/aegis/pull/80), head7cb6ce641fae04919c5ae10f3a0903ac55cdeecd:
[releaseCI40282693478](https://github.com/heybeaux/aegis/actions/runs/40282693478) SUCCESS, CLEAN/MERGEABLE.
[SwarmLab63](https://github.com/heybeaux/swarmlab/pull/63), initial evidence head2f1f8a2:
[actual-package exp72CI40282698361](https://github.com/heybeaux/swarmlab/actions/runs/40282698361) SUCCESS;
all other registered workflow checks SUCCESS. Fresh actual source/dist/evaluation
equality and26tamper rejections observed in CI, not inferred from exit0.
Final local release after evidence bookkeeping:1226tests(628+216+22+86+217+57),
build/typecheck and historical52/52 green. Independent read-only review no blockers;
its prose mistakenly says honest-null for baseline: actual classification is
**reproducible-red**. Review does not certify approval-store consumption, terminal
state or session-generation authenticity. Current runtime PR includes no prior
held branch. Prior78/79 unchanged; current normal CI passed without rerunning.
Final docs-head checks and merge/main status must still be observed; nightly ledger
owns final status. Candidate catalogue promotion remains separate from corpus
proof; static historical52/52 is not a fresh execution of RT62.

### Final compatibility red and correction (same experiment, no threshold change)
Final independent observable-interface probe found existing `appliesTo:['process']`
critical content policy denied a paste on main but only asked on candidate97108ec.
This was a genuine policy-scope regression, missed by initial reviewer; not hidden
by corpus green or prior CI. Corrected3acbacc keeps legacy process-scoped rules
applicable to ProcessInput while preserving input-specific and unrelated scopes.
Two focused regressions added:19focusedtests; full local1228tests
(628+217+22+86+218+57), historical52/52 green. Same frozen27-case harness now
admits `pib-mvowplbp-32581` at `3acbacc4a9954992605c6136347371940ac6dac2`, all metrics unchanged green.
Former green `pib-mvowdfh8-1211` remains committed/superseded in receipts; raw reds
and frozen scenarios/oracle/child/main unchanged. Final exact-head CI must be
observed again; earlier green CI does NOT certify this corrective commit.
## RT-61 / exp71 — Structured replacement coverage (2026-10-23)

[Spec77](specs/77-structured-edit-coverage.md), preregistration1bc1564; initial harness e5059f8,
unique-region fixture correction/final frozen harness cadebd5. Actual fetched Aegis
32391a41c4d09cdad2e4aa083382b222d78976c2 missed8/8 hazards and all8 identity probes on
`sec-mvm1703u-57714` and `sec-mvm1707n-57732`. Direct scalar8/8 and compatibility10/10 passed,
so this is a projection gap, not a broken rule fixture. Initial red pair used repeated
oldText and was re-frozen/re-baselined before candidate observations; retained unadmitted.
Same18cases real Aegis runtime `259882071774cd2f65da09e8077363995ff11dd2` / `sec-mvm17vay-59158` is18/18green,
hazardCoverage0→1, identityCoverage0→1, resolutionAccuracy10/18→1. No LLM judge,
threshold tuning or holdout use. Full response JSONL and source/dist/package hashes committed.

Fix: optional independent `ToolCall.contentFragments`, projection from validated
OpenClaw edit.edits[].newText, content rule traversal without joining boundaries,
ordered identity binding and max per-fragment heuristic risk. Scalar input preserved.
Host still owns validation, unique oldText/application and action receipts. No support
claim for arbitrary apply_patch/malformed envelopes or production calibration. Review
found no blockers; literal host `newText` contract explicitly unit-tested, no invented aliases.

Regression-only: full Aegis release:check1216tests green (628+216+22+86+207+57),
historical catalogue52/52. RT61 candidate constant remains OUTSIDE landed release catalogue;
focused test asserts pending/PARTIAL. Two catalogue/test-bookkeeping red runs retained,
not hidden. Prior RT57 timingCI issue77 still open. SwarmLab core build/forced typecheck,
ESM syntax and evidence replay green. Legacy root build63TypeScript errors unchanged
from prior nightly; not a full root-build-green claim. Receipts re-scored from raw outcomes;
24 forged evidence variants rejected; live verifier binds response equality, exact SHA,
fresh timestamps and actual source/dist bytes. Existing15/16/17 not run.

Delivery: [Aegis78](https://github.com/heybeaux/aegis/pull/78); linked SwarmLab PR pending.
CI/mergeability must be observed before merge. .acr unchanged, Territory not refreshed.
Next independent hypothesis: path/argv/content-fragment arrays can expand regex planning
before native deadlines; resource admission not tested or claimed here.


### Delivery hold — observed CI, not inferred success
Linked [SwarmLab62](https://github.com/heybeaux/swarmlab/pull/62) / [Aegis78](https://github.com/heybeaux/aegis/pull/78).
SwarmLab experimentCI [40071762631](https://github.com/heybeaux/swarmlab/actions/runs/40071762631)
SUCCESS at c3eeea2: frozen raw red-red-green,24tamper cases, fresh pinned actual-package18/18.
Aegis releaseCI [40071707272](https://github.com/heybeaux/aegis/actions/runs/40071707272)
FAILED at3eee4db: unchanged core/test/test-helpers.test.ts:70 real Date.now determinism
expectation,627/628core. Zero core diff against baseline; local1216tests passed.
[Issue79](https://github.com/heybeaux/aegis/issues/79) records the blocker (distinct from77).
Both PRs remain OPEN/unmerged; no rerun-to-green or unrelated patch. Subsequent doc-only
head has separate CI; nightly ledger records latest exact-head checks. Unadmitted local
review/final-live traces retained separately from the three pinned corpus runs.
Legacy root63TypeScript diagnostic lines exactly equal unchanged-main baseline.
## RT58 / exp68 — cumulative native regex work (Spec74)

Pre-registration `f5dbc19f35af2e894d5ced702eb422aa59be0a4a` before implementation/output. Twenty independent loader-accepted patterns consume100ms each on actual input, not loader probes. This is a NEW cumulative-work boundary explicitly outside RT57/exp67. Repeated real-main `27375f6a04cd9403725499d75ac046d8d6e33986` baselines `crw-mvhqnt5r-74169` / `crw-mvhqo3nm-74077`:8/8hazards killed by1500ms parent watchdog;13compatibility+8linear controls pass, no infrastructure failure. Parent kill is NOT Aegis refusal. Red traces retained.

Runtime `fee7bd9ab4d71d399c5f243b0c110aeb6833b616` rerun `crw-mvhqqvjv-84114`, exact21scenarios+8linear same seeds/thresholds: watchdog1→0, cumulative safety0→1, resolution13/21→21/21; all controls/recovery/ownership pass. Default250ms total caps native batch AND retry allowance across rules/targets/decoded variants; per-match limit remains. Unknown is independent ask even all-allow severityTable, never a match; previously proven regex and separate substring/predictor deny remain. Later native matches may be unknown. No fixture-specific rule count/pattern policy. 19focused +25RT57 regression tests passed; full release before catalogue1211tests,52/52historical evidence. Final exact-head checks/CI tracked in nightly ledger; no merge asserted here.

Source/dist/full typed traces and hashes in receipts; verifier recomputes roster/checks/scores, binds exact package and admitted green evaluations,39tamper rejections +disk/virtual positives. Holdout reserved unused, no tuning. Scope NOT preprocessing/job-plan/loader/compilation/memory, arbitrary JS or absolute evaluate time bound. Host owns input/policy provenance and execution. Source .acr unchanged, no Territory refresh. Existing held PRs untouched. Next new question (not selected/run): can decode-then-rescan variant expansion consume unbounded preprocessing work before native matching begins? Needs independent preregistration.

Final local release candidate `fb842ea66be1666ca771195b5923c2bdcb096aa0` (runtime/source/dist unchanged from admitted fee7bd9) passed build+typecheck+1212tests (628+216+22+86+203+57),53/53stored evidence. Initial catalogue count assertion expected52 vs53; corrected explicit count, red log retained, not runtime regression. SwarmLab core build+forcedtypecheck and verify:evidence52claims114traces1049assertions pass. Exp67 on candidate19/19 passed as REGRESSION ONLY, not novelty. Paired Aegis PR74: https://github.com/heybeaux/aegis/pull/74. Fresh exact-head package verification and CI required before merge.
## RT-51 — Package-default policy isolation (exp61 / Spec67)

Pre-registration `5271a6f0a95728cfc74e18ed2e102501554cd229` preceded all implementation/output. Fetched current main Aegis `4be84ed` let edits to exported severity/threshold/Set recipes silently become unrelated consumers' implicit policy: **9/9** hazards influenced decisions, **6/6** weakening hazards escaped their required default classification, exact scenario accuracy **7/16**. Baselines `dpi-mv4vqk63` / `dpi-mv4vqkba` have identical full scenario bodies/artifact manifests. Captured-host and explicit-template controls both **16/16**; no fixture or LLM decided success.

Aegis runtime `186cc3541218ca0a591bc36fd02bc7708f0d65bd` separates private implicit severity/prediction/safe defaults from publicly editable recipe copies, including strict async effective options. SAME immutable harness/scenario/seed `dpi-mv4vti3m`: influence **0/9**, weakening failures **0/6**, accuracy **16/16**, every secondary/control metric **1**. Three committed53-event replay traces pin package/source/full artifact hashes; 14 focused unit regressions transition11 red/3 pass to14 green. Public names/types/editability preserved; passing edited recipes explicitly still selects host policy. No frozen caller data or fixture-specific branching.

This is between-call ambient policy isolation, distinct from RT48 in-flight configuration/RT49 output ownership/RT50 numeric validation. RT50 remains separately reserved in prior unmerged draft PRs66/49; no cherry-pick or false combined claim. Hosts using ambient DEFAULT_* mutation must migrate to existing explicit options. Lattice/host owns distributing/selecting overrides; Aegis owns private defaults. Arbitrary process compromise/getters/proxies, malformed policy and signed/transactional execution unproven. No tuning; holdout unused. Local green is not CI/merge proof; candidate status recorded in nightly ledger and linked PRs. Existing exp55–59 unchanged neighbor checks are regression ONLY, not novelty.

### Regression-only / release results
SwarmLab build+typecheck+verify:evidence pass (49 claims,105 traces,995 assertions). Aegis release:check passes build+typecheck+1139 tests (628+146+22+86+54+203) and50/50 evidence mappings implemented in candidate source, NOT remote-main certification. Neighbor exp55/56/57/58/59 exact accuracy1/unsafe0 replay71/59/65/68/68events against runtime186cc35; committed traces/receipts do not rewrite their historical claims. First release attempt exposed evidence-accounting test assertions, repaired before full green rerun. No runtime/scenario/threshold tuning.

**Merge HOLD / draft:** implicit policy isolation intentionally removes undocumented ambient DEFAULT_* configuration. Beaux should review migration to explicit options before adoption. CI can be green without resolving that policy decision. Prior RT50 draft remains separate. Source .acr unchanged; Territory not refreshed.

Paired draft candidates: [Aegis67](https://github.com/heybeaux/aegis/pull/67) / [SwarmLab50](https://github.com/heybeaux/swarmlab/pull/50). Owner migration review HOLD applies even with green checks; no merged-main claim.
### RT53 / exp63
Pre-registration c8bc120; occ-mv7qlhb7 / occ-mv7qlhdk red -> occ-mv7qn439 green; exact source/dist/trace hashes in adjacent .receipt.json; frozen harness sha256:5acc408f7c473e0ee849f015fd4609c41c2275e10dcba15c5960a5e68cff660b. Real Aegis runtime bc879d6c7fd213b49ef355b64bd83196098ffa0e; candidate only, PR/CI state tracked in nightly ledger.

RT53 linked candidates: [Aegis69](https://github.com/heybeaux/aegis/pull/69) / [SwarmLab52](https://github.com/heybeaux/swarmlab/pull/52). Local1144 tests + Aegis stored50/50; SwarmLab49 claims105 traces983 assertions; exact clean-worktree CI rehearsal green. Remote CI pending; NOT merged; migration review required. Stored gate range is50 cases throughRT53 with50–52 absent, not53/53 or certification of prior candidates.

### Same-experiment observable evidence-verifier audit

Independent verification reproduced false acceptance: bare `--latest` certified the existing committed green as fresh; missing secondary metrics and altered action/effective-rule rows were accepted when stored self-check booleans stayed green. This is evidence tooling, NOT a new nightly experiment or an Aegis policy defect. The original three traces and all thresholds remain unchanged.

Receipt verification now pins the frozen scenario/harness contract, requires the complete exact metric set, independently recomputes row field checks and all eight metrics, rejects duplicate/omitted or relabeled scenarios, and inspects every live source/dist hash. New `run-and-verify.mjs` requires exactly one newly produced receipt and checks its exact ID against prior IDs and invocation start; bare `--latest` fails closed. Fifteen verifier regressions cover stale-run acceptance, altered trace checks and live artifact mismatch. The exact unchanged experiment reran green in a clean real-Aegisbc879d6 worktree; audit trace remains non-admitted. Core/experiment build/typecheck, full evidence corpus, and all15 verifier tests green. Runtime still byte-identical to bc879d6; no thresholds tuned, no `.acr` changes, migration hold retained.

## RT-50 — Predictor numeric contract integrity (exp60 / Spec66, candidate HOLD)

Novel numeric consumer-boundary test, not elapsed source freshness RT47, during-await policy mutation RT48, or returned alias isolation RT49. Pre-registered `3518c35` before implementation/results. 52 frozen scenarios at pure and strict public APIs; exact built real Aegis; machine equality, tagged nonfinite values, no LLM judgment. Authentic fixed roster and deterministic zero clock isolate predictor shape from host faults.

Baseline Aegis `4be84ed`: `pnc-mv3g8k05` and `pnc-mv3g8k40`, identical 208 scenario rows and package manifests. Runtime candidate `bde9260`: `pnc-mv3gda9w`, identical harness hash, 210-event replay each. Unsafe malformed allow **62/74 -> 0/74**, malformed diagnostic **0/74 -> 74/74**, complete resolution **30/104 -> 104/104**, crashes **2/104 -> 0**. Valid controls **30/30** and deterministic critical deny preserved. Full fields/metrics in CLAIMS and committed traces; producer validation control is illustrative, not package improvement.

Consumer validation requires finite numeric pFailure/confidence in inclusive [0,1], awm/prior source, ordered finite [0,1] ask/deny thresholds (equality allowed). Only undefined is absence; null is invalid. Fixed diagnostic ask cannot be bypassed by custom medium severity downgrade. Invalid prediction is omitted from typed receipt. Host/AWM retains origin/calibration responsibility; getters/proxies and transport faults not tested.

**Merge HOLD / regression red:** unchanged exp58 supplies partial Prediction `{pFailure:.1}` missing required confidence/source. Candidate correctly asks before I/O, making frozen RT48 resolution 3/21 rather than 21/21. Unsafe allow remains 0, but this is NOT a green regression. Trace `aci-mv3get8b` is preserved as diagnostic, not admitted new evidence or a rewritten RT48 receipt. Two unit drift fixtures now use complete Prediction and ordered tightened thresholds (.02/.05); no frozen experiment edit. Full Aegis release check passes 1175 tests, static stored evidence49/49; these do not certify current behavior of old fixtures. Neighbour exp55/56/57/59 real-package regressions green; SwarmLab build/typecheck/evidence green. Candidate unmerged pending explicit contract migration review; no origin/main improvement claim. Independent novelty audit failed at startup; independent patch review pending, no certification yet. Primary dirty checkouts untouched, .acr unchanged/Territory skipped.

Next: dedicated RT48 fixture migration/re-pinning with owner review, while tomorrow's new hypothesis must remain novel (e.g. mutable exported defaults between calls need an explicit policy ownership contract; deduplicate first).

Linked **draft HOLD** PRs: [Aegis#66](https://github.com/heybeaux/aegis/pull/66), [SwarmLab#49](https://github.com/heybeaux/swarmlab/pull/49). No merge authorized while frozen exp58 regression remains red.
## RT56 — Loader regex-probe preemption (exp66 / Spec72, 2026-10-18)

Pre-registration `632df6b424123cb000dd83f4f918c213b654a7f3` preceded harness implementation and
output; harness `d98b0cbe05562b05e12bdacd6f79d336ced7aea3` froze19 scenarios and5 substring controls.
New failure boundary: the loader's own synchronous regex probe can block before
its elapsed-time check executes. Not receipt honesty/recall replay, rule ownership,
compiled-cache binding or in-flight config drift. Original queue is already built.

Real origin/main Aegis `f73ce63d5ab1f389fbda3465916bcba2afb4b117`,
`lpp-mvevxxcc-75248` / `lpp-mvevy3zp-75313`: **5/5** hazard children watchdog-killed after1500ms,
**0/5** bound ReDoS rejections, **12/19** total correct, **12/14** controls,
**5/5** literal substring controls. Repeated deterministic outcomes identical;
raw timestamps differ. Invalid budgets0/-1 were genuine additional safe-pattern
rejections, not fixture errors. Both red traces preserved, no thresholds moved.

Runtime `528438cc279623e5c57fa3c5b6f8375b3c7109fc` runs a fixed probe script with primitive
pattern/flags/text inside an interruptible V8 context; synchronous API, whole-pack
refusal and RulePackError identities preserved. Invalid env values use default25ms.
Frozen candidate `db899177bea17b15f814c5a7ccd7e605a01bb112`, `lpp-mvew4ef8-93479`: **19/19** + **5/5**, zero watchdog,
all5 hazards return exact typed errors and subsequent safe load works. Focused public
artifact tests8red10pass→18green. Complete source/dist manifests, frozen harness,
trace hashes and machine oracles in receipts.json. Fresh live run independently
checked against actual files; verifier rejects15 tampers and accepts positive.

Regression-only: full build/typecheck/release **1185 tests** (628+190+22+86+203+56),
evidence52/52; SwarmLab core build/forced typecheck + native ESM syntax +
verify:evidence51claims111traces1022assertions. One intermediate release failed a
stale explicit catalogue count51→52 (corrected); another **falsely rejected safe
builtin secrets.openai-key.bash at25ms under parallel test load**. Focused hook and
subsequent full release passed unchanged. This new wall-clock compatibility risk
is unresolved; green rerun does NOT erase red. **Aegis PR72 held from automatic
merge**, even if CI passes. Linked SwarmLab CI runs frozen design against pinned
real package, not merely stored scores. Remote CI unobserved at this write.

Scope: finite loader probes only. Native runtime evaluate still has no general
regex deadline. No general ReDoS safety proof, sandbox guarantee, arbitrary pack
resource bound, production certification or tuned holdout claim. No .acr changes;
Territory untouched. Existing dirty primary checkouts untouched. Prior pending
experiments remain separate. Next new hypothesis: patterns absent from the finite
probe alphabet may load but block runtime evaluation; pre-register a separate
bounded evaluation watchdog/host-input contract before testing, not tonight.

## RT-64 / exp74 — Process lifetime must survive into execution permits

Spec80 pre-registration3596654 (package-manager setup correction235a666), frozen harness812c6c4, precede all observations. This is the post-consumption target checkpoint intentionally excluded by exp73, not a replay of approval identity or delegation checks. Real fetched Aegis `85d451dbb9a8d956023514b2cf1e360d6913fbc0` runs `pet-mw1sxdo3-29192` and `pet-mw1sxdrw-29210` have identical24 raw rows: **16/16 hazardous finalizations authorized**, target binding0/20, valid controls8/8, one-shot replay24/24, consumption24/24, ownership24/24, infrastructure0.

Candidate `26f269567ab7ba335577f0b556b088c3adde5f15`, SAME immutable design `pet-mw1t0mch-35427`: **0/16 unsafe authorizations**, valid controls8/8, bound process records20/20, replay24/24; all thresholds pass. New ProcessInput permits retain detached host/session/generation and tool discriminator; creation rejects unavailable target, shared snapshot validator rechecks target on finalization/resume/start. Nonprocess permits remain compatible. Seventeen new focused tests transition16red/1pass to17green; prior15 generation tests pass. Tests cover reconciled and journal APIs beyond the experiment's local/shared variants.

Three26-event raw traces plus source/dist manifests and content-addressed receipts retained. Verifier recomputes every metric/check, compares live raw responses with pinned green, validates actual artifact roster/bytes, exact clean SHA and fresh run identity;29 tamper controls rejected. Negative stale-snapshot controls remain6/6 authorized: a truthful fresh host snapshot is required. No actual process execution, host deployment, cryptographic identity, post-finalization atomic write guarantee or tuned holdout claim. Old outstanding process permits lack a discriminator: host must drain/reapprove them before adoption; no automatic safe migration is claimed.

Regression checks are separate from novelty: exp73 all frozen thresholds pass; full Aegis release and SwarmLab evidence results are logged in nightly artifacts. Static evidence catalogue does not execute RT64. Source .acr unchanged; no Territory refresh. CI/PR/landing status is recorded separately, never inferred from local green. Next hypothesis: whether permit authority can be recreated from the same consumed-approval ID after the prior permit is finalized; must deduplicate and pre-register tomorrow.

Linked delivery: [Aegis83](https://github.com/heybeaux/aegis/pull/83) / [SwarmLab66](https://github.com/heybeaux/swarmlab/pull/66). Local release1,457 tests and58 historical gates; SwarmLab63claims147traces1331assertions green. Remote exact-head CI is independently tracked in the nightly ledger.

## RT-65 / exp75 — Spent local permits must not be recreated

Spec81 pre-registration `dee55d3`, frozen harness `c51ab2d`, precede observations.
New question: create AFTER destructive finalization, including restart, not
finalizer replay or outstanding duplicate creation. Real main Aegis
`9841b2c8a2dd1e71f48b6443ffe648bd9e69943d` runs `lpi-mw38eqx1-60473` and
`lpi-mw38er4w-60491`: **12/12 unsafe reissuances**, **2/2 stale-handle executions**,
2/20 complete scenarios pass. Initial lifecycle, consumption, host controls and
finalizer replay all20/20; infrastructure0. Observable outcomes repeat after
normalizing approval timestamps; raw traces preserved. Four fresh-after cases
execute but reuse old handles, and two stale-handle cases steal the new permit;
thus all6 fresh-approval identity/behavior controls fail their full contract.

Runtime `8162da4f7842a909fa155893bcec2cf4af12af4f`, SAME frozen20cases,
`lpi-mw38hk2d-67844`: unsafe reissuance **0/12**, stale execution **0/2**,
fresh approval6/6, scenario20/20, all thresholds pass. Successful consumption
publishes a per-grant nonce; local permit IDs bind it and an exclusive persistent
issuance marker survives ready-file removal. A fresh consumption gets a new
handle. Pending/approved/failed consumption cannot reset issuance. Legacy direct
callers retain an initial issuance only.12new tests; hook266pass; full release
1469tests and58historical gates pass. Exp74 unchanged24cases green as regression
ONLY. Source .acr unchanged, Territory not refreshed.

Three22-event traces include raw decisions, filesystem observations and package
source/dist manifests. Verifier recomputes checks and metrics, verifies source
bytes and fresh pinned-package execution, and rejects31tampers. For cross-run
equality only, opaque permit/nonce bytes, temporary paths and createdAt fields
are normalized while identity relationships remain; all other observations are
compared. No thresholds, scenario order or harness files changed after baseline.

Scope: protected local directory and serialized trusted host workflow. Retain
markers; safe compaction not implemented. Pre-upgrade grants lack history and
must be drained/reapproved. No shared-store remint guarantee, concurrent
consume/reapprove, fsync/power-loss proof, adversarial file-write defense, actual
side effect or deployment claim. Reserved holdout unused, no tuning. Next
hypothesis: shared create/take adapters forget issuance after destructive take;
can a per-consumption identity and durable create-once contract prevent remint
without denying fresh approvals? Must deduplicate and preregister separately.
CI and merge status are recorded only when observed, separately from local green.

Paired runtime [Aegis84](https://github.com/heybeaux/aegis/pull/84). Candidate
head1b383b6 includes docs only beyond executable pin8162da4. SwarmLab final
evidence verification:64claims150traces1364assertions. Remote CI pending.

## RT-66 / exp76 — Shared storage must negotiate issuance lifetime

Spec82 pre-registration0730d79, corrected frozen harness235afbc precede Aegis
changes. This extends the ownership boundary from local issuance to independent
hosts sharing a transactional store: capability refusal and CREATE acknowledgement
loss are new mechanisms, not a reseeded local replay. Original Specs24/25 built.

Real main `2c3a68d20b0fc7dd033eeba717567a04748fdb02`, runs `sic-mw4nuqxc-64932` and
`sic-mw4nur18-64948`: identical raw28responses; **8/8 unsafe remint
scenarios**, **2/2 stale handles execute**, fresh approval0/6, capability refusal0/6,
create failure handling0/4. Initial lifecycle, consumption, fixture controls,
replay and legacy behavior all pass; infrastructure0. Two earlier diagnostic
runs used the wrong approval event field in the oracle; retained with original
harness commit28cc942, not admitted. Only that field lookup was corrected before
repeating baseline. No metric threshold, scenario, seed or host operation changed.

Real runtime `dad07662ae7f7b88386b88844a576ef2afd7679b`, SAME corrected frozen28cases,
`sic-mw4nxfb6-71023`: **0/8 remints**, **0/2 stale executions**,
fresh6/6, refusal6/6, failure handling4/4, all28/28 green. Optional strict issuance
requires a bounded nonblank host consumed-grant identity and createOnce storage
capability. Separate handle namespace, durable atomic issuance marker contract,
no capability downgrade and literal true acknowledgement. Legacy four-argument
calls intentionally remain compatible and are NOT remint-safe.

Aegis owns capability enforcement and identity binding. Host owns authentic
per-consumption IDs and durable atomic marker+ready publication across all hosts;
take must retain markers. The deterministic shared Map fixture tests this
contract, not a production database. Strict/legacy modes must not mix for the
same grant. Lost creation acknowledgement stays blocked; lost-handle recovery
and marker compaction remain unimplemented. No actual side effects, deployment,
network partition, malicious host/storage or durability claim. Holdout unused.

Three admitted30-event traces include calls, decisions, storage operations,
records, finalizer results, source/dist manifests and hashes. Verifier recomputes
all scores, requires exact raw response equality on fresh pinned-package CI,
and rejects34tamper controls; actual local fresh artifact check passed.21new
unit tests red before/green after; focused50 pass. Regression-only: Aegis
release build/typecheck1490tests and58historical gates pass; exp74 and75 all
thresholds green. Historical58-case catalogue is not execution of RT66.
Source .acr unchanged, no Territory refresh. PR/CI/merge recorded separately.
Next new hypothesis: can creation acknowledgement loss be recovered safely by
issuance identity without handing two hosts executable authority? Deduplicate
against take reconciliation before preregistering; no such recovery claim here.

Linked runtime: [Aegis85](https://github.com/heybeaux/aegis/pull/85).
Executable pin dad0766; docs-only head3efa656. Final local evidence65claims,
153traces,1406assertions verified. Remote CI and merge tracked in nightly ledger.


## RT-67 / exp77 — Recover a lost issuance handle, not fresh authority

Spec83 pre-registration59244fa and frozen harness ec933f7 preceded all observations.
New boundary: CREATE acknowledgement recovery; exp31 reconciled destructive TAKE
and exp76 explicitly accepted lost-handle orphaning. Real Aegis `340cc7798d375f131c0e5181bfe213e0249296f2`,
`sir-mw6382rf-91926` / `sir-mw6382w4-91948`: identical raw28rows,
**0/10 recovery**, **0/2 capability refusals**,16/28complete cases.
Consumption, no-recovery control and fixture all28/28; infrastructure0.
Duplicate execution and unsafe readback acceptance were already0. The two
baseline replay failures are first takes after erroneously accepted unsupported
recovery requests, not duplicate execution evidence. Both reds retained.

Runtime `103e343d351c694bdf9103208af30ec583ffbda8`, SAME immutable28cases,
`sir-mw63a7ys-99583`: **10/10 recovery**, **2/2 refusal**,28/28green.
Optional recoverExisting requires coherent readIssuedPermit before mutation.
False/exception creation can recover only an exactly matching issued-ready
record, with expected binding detached before await. No new issuance, take or
execution decision occurs in recovery. Multiple hosts can hold the same handle;
atomic take and fresh authorization still yield one execution. Existing strict
defaults reject duplicates, as the frozen no-recovery controls demonstrate.

Host owns authentic per-consumption IDs, atomic durable marker+ready publication,
coherent reads, take and fresh authority. Aegis owns capability refusal and
binding verification. Deterministic shared Map fixture, no database durability,
external effects, deployment, malicious storage, crash-after-take or holdout claim.
Reserved holdout unused; no threshold/scenario tuning.24new tests10red/14pass to
24green; focused45pass; full release1514tests plus58historical gates pass. Static
58-case catalogue is not execution of RT67. exp76 relevant regression28/28green.

Three admitted30-event traces and complete source/dist manifests retained;
independent verifier recomputes outcomes, requires fresh pinned-package raw
equality and rejects36tamper controls. Local fresh actual-artifact validation
passed. SwarmLab evidence66claims156traces1439assertions verified. Source.acr
unchanged; no Territory refresh. Exact-head PR checks and merge status are tracked
separately in nightly ledger, never inferred from local green.

Next new hypothesis: does mutable caller authority change across an asynchronous
shared finalization take alter the snapshot that Aegis validates? Deduplicate
against exp56/58 (evaluator async boundaries) and execution snapshot tests before
pre-registering; no claim or speculative patch tonight.

Linked runtime: [Aegis86](https://github.com/heybeaux/aegis/pull/86). Runtime pin103e343; docs-only head2e5e6df. CI and merge evidence recorded independently in nightly ledger.


## RT-68 / exp78 — Authority cannot be repaired inside a pending finalization

Spec84 pre-registration `562701c717c6b723f3701f1eaab8dcbae607eaa7` and frozen harness
`3f73dc80d5695f46fcb03bb22d6b9ae530d40b8a` preceded observations. This tests consumed-permit
finalization across storage awaits; exp56/58 tested evaluator call/config changes,
exp31 take acknowledgement loss, exp77 creation recovery. No renamed regression.

Real baseline `2e7d4dd7d8e301713fb4169f9dc4e73d93e6bd98` runs `fii-mw7iok3w-26732` and
`fii-mw7ioxsi-27340` have identical raw46rows. **22/22 invalid-to-valid repairs
execute**, mutation blocking8/30; full scenarios24/46. All unchanged/equivalent/
ABA, revocation, outage, replay, storage and real approval-consumption controls
pass. Infrastructure0. The caller can repair revoked, unchecked, structurally
invalid, wrong-digest, revoked-link or wrong-process-generation authority while
simple take/reconciled claim is pending; old code validates only the live object.

Runtime `63cbf6fafdd97b8eb14973006da2899b73b970b3`, same frozen46cases, `fii-mw7irbzf-35786`:
**0/22 repair executions**, mutation blocking30/30, **46/46green**. Both public
finalizers capture private entry permit/snapshot data and require equality before
returning executable authority. Reconciliation also remembers drift observed after
prepare and still claims/burns the record. Equivalent data remains valid; callers
are neither mutated nor frozen. No fixture-specific policy or new approval rule.

21new regression tests:15fail/6pass baseline,21pass candidate; focused92pass.
Full release1535tests and58historical gates pass. The static catalogue is not
execution of RT68. Relevant exp77 compatibility regression28/28green. Source.acr
unchanged; Territory not refreshed. Three admitted48-event traces plus source/dist
manifests and hashes committed. Replay recomputes metrics from raw outcomes;
32tamper cases rejected; fresh local actual-package validation passed. CI executes
the pinned real package and requires fresh raw equality, not merely exit0.

Host owns authentic fresh authority and atomic durable storage. This establishes
plain-data input consistency at observed boundaries, not database durability,
external effects, post-return safety, elapsed-time expiry, malicious storage,
getters/proxies or transient ABA detection. Effect-journal entrypoints remain
outside this experiment. Holdout reserved unused; no statistical generalization.
Exact-head CI/merge status is recorded independently in the nightly ledger.

Next hypothesis: can effect-journal finalization authorize or persist an authorized
operation after caller authority changes during prepare/claim? Distinct durable
state transition and resume implications must be deduplicated before registration.

Linked runtime: [Aegis PR](https://github.com/heybeaux/aegis/pull/87); executable pin63cbf6f, docs-only head89d56bd.
