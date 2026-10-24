# Exp71 — Structured edit coverage

[Spec77](../../specs/77-structured-edit-coverage.md).


## RT-61 / exp71 — Structured replacement coverage (2026-10-23)

[Spec77](../../specs/77-structured-edit-coverage.md), preregistration1bc1564; initial harness e5059f8,
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

Commands: `AEGIS_REPO=/path/to/built/aegis node experiments/71-structured-edit-coverage/main.mjs`; `node experiments/71-structured-edit-coverage/verify-receipts.mjs`; `node experiments/71-structured-edit-coverage/test-verifier.mjs`.


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
