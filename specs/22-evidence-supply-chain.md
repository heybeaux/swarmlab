# Spec 22 — Evidence Supply Chain & Claims Ledger

> Infrastructure / verification hardening. Scope: repo root, `core/trace`, docs, and all existing
> experiment writeups. This is not a new behavioral experiment. It turns the current SwarmLab
> corpus into a clone-zero-verifiable evidence artifact.

## Question

Can a future agent or outside reviewer trace every headline SwarmLab claim from prose to exact
run trace, score fields, command, seed, git SHA, and stack delta without relying on conversation
memory or Scout's local workspace?

The deliverable is a machine-auditable chain:

`claim → experiment → run id → trace path → score fields → reproduction command → stack recommendation / PR`

## Why

SwarmLab already has strong writeups and committed traces. The remaining weakness is evidence
supply-chain clarity:

- claims live across READMEs, `SYNTHESIS.md`, and `JOURNAL.md`;
- replay proves event counts and score fields, but run metadata is thin;
- retests using real packages do not consistently record external package SHAs;
- tuned results, such as exp-15's probe cadence, need explicit in-sample / holdout labeling.

This spec upgrades the repo from "credible if you read it carefully" to "auditable by machine."

## Deliverables

1. **Claims ledger**
   - Add `CLAIMS.json` at repo root.
   - Include one entry per headline claim in `SYNTHESIS.md` RT-01 through latest.
   - Required fields:
     - `id`
     - `claim`
     - `experiment`
     - `spec`
     - `runIds`
     - `tracePaths`
     - `scoreFields`
     - `expectedValues`
     - `reproductionCommand`
     - `stackRecommendation`
     - `stackReposAndPRs`
     - `evidenceStatus`: `verified` | `in_sample` | `exhibition_only` | `needs_holdout`
     - `notes`

2. **Evidence docs**
   - Add `docs/EVIDENCE-LEDGER.md` explaining how to read `CLAIMS.json`.
   - Add a short "Evidence and replay" section to `README.md`.

3. **Trace/run metadata forward path**
   - Add a lightweight run metadata convention.
   - Either:
     - a first JSONL header event, or
     - `runs/<runId>.meta.json` sidecars.
   - Required metadata for new runs:
     - experiment id
     - spec id
     - run id
     - timestamp
     - repo commit SHA
     - command
     - seed / seed family
     - deterministic sim vs live LLM exhibition
     - model/provider if live
     - external package repo/branch/SHA/dirty state for `file:` deps

4. **Verification command**
   - Add a script, e.g. `npm run verify:evidence`.
   - It must:
     - load `CLAIMS.json`;
     - confirm every trace path exists;
     - replay/read each trace;
     - assert listed score fields equal expected values within declared tolerances;
     - fail if a verified claim has missing evidence.

5. **Retest SHA capture**
   - For claims tied to stack repos, record external package SHAs used during the retest.
   - If the exact SHA is unknown for past runs, mark as `unknown_past_run` and add a remediation
     note rather than inventing it.

6. **Holdout labeling**
   - Mark exp-15 evidence-capped probation as `in_sample` unless/until a holdout seed run is added.
   - Add a `needs_holdout` note where appropriate.

## Acceptance criteria

- `npm run typecheck` passes.
- `npm run build` passes if build is already required by verification.
- `npm run verify:evidence` passes.
- `CLAIMS.json` contains at least all RT-01 through RT-07 headline claims.
- Every `verified` claim has at least one committed trace path and exact score-field assertion.
- No claim silently relies on conversation history.

## Honesty rules

- Do not overclaim historical provenance. If an old run lacks exact external SHA data, say so.
- Do not relabel live n=1 exhibitions as evidence.
- Do not hide in-sample tuning; label it.
- If a README claim cannot be backed by a trace, mark it `needs_evidence`, not `verified`.

## Final report required

- Files added/changed.
- Number of claims represented.
- Number of verified / in-sample / exhibition-only / needs-holdout claims.
- Verification command output.
- Any historical claims that could not be fully backed.
- Recommendations for future run metadata improvements.
