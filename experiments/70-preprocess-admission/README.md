# exp70 — Preprocessing admission limits

Pre-registered before implementation/output: [Spec76](../../specs/76-preprocess-admission.md).

Deterministic admission test; not a latency or absolute resource-bound claim. Real built Aegis, frozen same-input before/after.


## RT-60 / exp70 — Admit preprocessing coverage, not silent omission (2026-10-22)

Pre-registration `0f8efd2`, frozen harness `ab9b4dd`; [Spec76](../../specs/76-preprocess-admission.md). Current real Aegis `27375f6` failed admission semantics in **8/8** hazards on two runs (`pa-mvklk7od-66506`, `pa-mvklk8hq-66544`), while all **12 compatibility** and **8 preprocessing-disabled** controls passed. `admissionSafetyRate=0`, `resolutionAccuracy=.6`. Exact same corpus against real candidate `9e99e7bfb109aace16b393418e234162be52f7d5` / `pa-mvklnk5q-77008`: both metrics **1**, controls/recovery/ownership **1**, infrastructure failures **0**. Complete trace replay and source/dist/content-addressed receipts committed; no LLM judge.

The general change bounds evaluator preprocessing admission: original<=65536 UTF16 units; variants<=64 including original; decoded total<=8192 units. First exceeding unique candidate stops extraction; original and admitted prefix still undergo real rules, independent ask on incomplete coverage cannot waive genuine deny. Standalone extractor remains unbounded/compatible. **This is a new conservative admission policy, not measured CPU/memory exhaustion, a latency speedup, whole-call bound or production certification.** Native budgets start later; pending exp68/69 were not imported. No threshold tuning; holdout unused. Existing evidence checks are regression-only. GitHub checks/merge status must be consulted separately from verified corpus.

Run: `AEGIS_REPO=/path/to/aegis node experiments/70-preprocess-admission/main.mjs`. Replay: `node experiments/70-preprocess-admission/verify-receipts.mjs`. Fresh CI verifier additionally requires `--run RESULT --sha EXACT40HEX --since EPOCHMS`. Admission scorer is independent of Aegis implementation; complete evaluations are bound to pinned green evidence.

## Delivery and verification

- Aegis [PR76](https://github.com/heybeaux/aegis/pull/76), pinned runtime `9e99e7bfb109aace16b393418e234162be52f7d5`; release CI39913263015 SUCCESS, full local build/typecheck1208tests (16focused) green.
- SwarmLab [PR60](https://github.com/heybeaux/swarmlab/pull/60); real-pinned-package CI39913371949 SUCCESS, plus triggered64/65/67 CI green. Verification is exact-head; later documentation commits require fresh checks.
- Core build/forcedtypecheck, new ESM syntax, evidence52claims114traces1046assertions, frozen replay and fresh positive+35verifier tamper rejections pass. Relevant exp67 rerun19/19green, not novel evidence or admitted trace.
- Full legacy SwarmLab root build/typecheck has63errors from missing/changed old Parliament/Engram modules. Same63errors reproduced identically on unchanged main5a62453 using the same portable toolchain. No unrelated legacy repair attempted.
- Source `.acr` cards unchanged; Territory not refreshed. Dedicated origin/main worktrees; dirty primary checkouts and held earlier PRs untouched.
- Independent review and merge/main checks are tracked in the nightly ledger; this page does not assert merge or certification.
