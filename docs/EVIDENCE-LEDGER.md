# Evidence Ledger

SwarmLab's evidence chain is now explicit:

`claim → experiment → run id → trace path → score fields → reproduction command → stack recommendation`

The machine-readable ledger lives at [`../CLAIMS.json`](../CLAIMS.json). It is intentionally boring JSON so a fresh clone, reviewer, or future agent can audit the corpus without conversation memory.

## How to read `CLAIMS.json`

Each entry represents one headline retest claim from `SYNTHESIS.md` (`RT-01` and onward).

The latest admitted claim is **RT-39**, supported by the real-Aegis red/green exp-48 pair
`dsrc-mujg8jlt` and `dsrc-mujg9oha`. It establishes that strict-roster retirement compaction needs
an authenticated self-binding lifecycle checkpoint; existing evidence checks remain regression
verification rather than novel evidence.

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
