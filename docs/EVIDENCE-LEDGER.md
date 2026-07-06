# Evidence Ledger

SwarmLab's evidence chain is now explicit:

`claim → experiment → run id → trace path → score fields → reproduction command → stack recommendation`

The machine-readable ledger lives at [`../CLAIMS.json`](../CLAIMS.json). It is intentionally boring JSON so a fresh clone, reviewer, or future agent can audit the corpus without conversation memory.

## How to read `CLAIMS.json`

Each entry represents one headline retest claim from `SYNTHESIS.md` (`RT-01` and onward).

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

Tuned policies must be labeled `in_sample` until fresh holdout seeds are run. Current example: `RT-06` evidence-capped probation has strong trace support but selected probe cadence on the shared seed family, so the ledger marks it `in_sample` and names the missing holdout explicitly.
