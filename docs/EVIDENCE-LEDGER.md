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
