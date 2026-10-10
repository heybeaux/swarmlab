# exp-59 — Evaluation receipt reference ownership

Design/thresholds frozen in [Spec65](../../specs/65-evaluation-receipt-ownership.md).


## RT-49 — Evaluation receipt reference ownership (exp-59 / Spec65)

Pre-registered `f54a6a1a0f069b1cc4f2f9e4cc6b1de68ee7cedb` before implementation/output. Baseline fetched main Aegis1550e6e produced receipt drift **8/8**, cross-call contamination **8/8**, and exact scenario accuracy **3/21** in both `ero-mv20uicz` and `ero-mv20uig5`. Returned prediction and ruleVersions referenced caller-owned metadata. Matched-rule, defaults and explicit mutation controls correctly stayed independent; detached consumer control was **21/21**.

Committed Aegis `7b4c5b08ab09201d6371a06de343eb435f0b26ed` copies prediction public fields and version strings at construction; existing matches were already private. Unchanged frozen harness/scenarios/seed `ero-mv20w6b7` yields drift **0**, contamination **0**, accuracy **21/21**, all secondary metrics **1**. Three replay-verified68-event traces bind source/dist/full artifact manifests and identical harness hashes. Ten focused regressions added. This is output-to-input reference isolation AFTER return across pure/async APIs, unlike RT46/48 in-flight input/config checks.

Results are evidence-verified but **candidate merge/CI not yet confirmed**. No mutable-record tamper detection, signed persistence, transactional action, getter/proxy/extension-data or live production incident claim. Host still owns exact execution and durable signed receipts. Prior exp57/58 remain separately unlanded; no combined certification. Reserved holdout unused; no tuning. Regression verification is not novelty.

```bash
npm install && npm run build && npm run typecheck
AEGIS_REPO=<built-aegis> AEGIS_DIST=<built-aegis>/packages/aegis/dist/index.js node experiments/59-evaluation-receipt-ownership/dist/main.js
```
The process deliberately exits0 for a valid red run; inspect summary metrics. Entry action remains correctly classified at baseline, but receipt metadata becomes inconsistent post-return. Fixtures/controls are explicitly NOT runtime improvement evidence.

RT49 paired candidates: [Aegis64](https://github.com/heybeaux/aegis/pull/64) / [SwarmLab47](https://github.com/heybeaux/swarmlab/pull/47). Local release/static/test checks green (1086 tests), SwarmLab evidence46 claims96 traces872 assertions. GitHub checks/independent review pending at this documentation commit; no remote merge claim.
