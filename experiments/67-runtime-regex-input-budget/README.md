# exp67 — Runtime regex input budget

Pre-registered before implementation/output: [Spec73](../../specs/73-runtime-regex-input-budget.md).
Real public loadPack → evaluate, finite-loader-corpus escape, fixed19 scenarios+7 linear negative controls, external watchdog. Not an exp66 loader-probe replay. See spec for frozen oracle, thresholds, ownership and exact commands. Results pending.

## Measured outcome — RT-57

Pre-registration `32fcac7`; runnable frozen design `80dd9dd`. No thresholds, scenarios or watchdog changes after observation. Seed `runtime-regex-input-budget-v1`, holdout unused.

- Baseline Aegis `f73ce63d5ab1f389fbda3465916bcba2afb4b117`; repeated runs `rrib-mvgbfpzj-90188`, `rrib-mvgbfz19-90260`. Seven successful loads followed by seven native evaluator watchdogs each time. Controls12/12 and linear controls7/7 green, infrastructure failures0.
- Candidate actual runtime `0bfd2fdc065d5e27c98f0e566d6d40e6ede99d77`; run `rrib-mvgbm9x1-7963`. Watchdog rate1→0; unresolved safety0→1; full resolution12/19→19/19; recovery/ownership12/19→19/19; controls unchanged. Each unknown is ask (except preserved critical deny), explicit budget/unavailable reason, no fake hazardous hit.
- Minimal general runtime patch: interrupt actual regex matching using fixed-script VM; safe configurable100ms default (positive finite<=1000ms rounded up), independent ask floor. Per-call rules/options/input unmodified. Not a clone of Aegis policy. Dist/source manifests pinned in `receipts.json`.
- The first implementation created a realm per match and failed two existing benchmark determinism tests at the5s timeout (red preserved in nightly artifacts). Reusing a private realm with fresh native RegExp and cleared data slots fixed measured overhead without moving any experiment threshold or old test timeout. Old candidate traces remain audit-only, not admitted.

`node verify-receipts.mjs` verifies admitted red/red/green content addresses, recomputed checks/metrics, exact frozen design, actual package source/dist and result/log binding. Live mode `--run LOG --since START_MS --sha EXPECTED_SHA` requires a fresh run (not admitted replay) and exact actual evaluations versus green. Native ESM harness: `node --check` on each file. Core replay/evidence gate is regression only.

Uncertainty: bounded matching is not cumulative budget or preprocessing/loader protection; wall-clock watchdog is safety test, not a latency benchmark. RT56 remains independently held. No learned model/product-quality claim. PR/CI status pending until independently observed; no merge implied by `verified` claim status.

## Verification / delivery

Aegis paired [PR73](https://github.com/heybeaux/aegis/pull/73); CI pin `46090e614b9fed08fab2eda7d5b7a383a3e62bdd` (runtime source/dist byte-identical to admitted `0bfd2fdc`). Full local release build+typecheck+1188 tests (628core193aegis22collect86label203hook56bench) green, stored evidence52/52. SwarmLab core+neighbor64/65 build/forcedtypecheck and all exp67 ESM syntax checks passed; verify:evidence51claims111traces1025assertions. Verifier24tamper rejections+positive. Fresh exact-head actual package audit `rrib-mvgbq80t-19868` is unadmitted and not tonight's novelty. Prior exp15/16/17 not run/count. .acr unchanged, no Territory refresh. Remote CI and merge status must be observed separately.

## FINAL HOLD — remote compatibility regression (not merged)

Linked PRs: [SwarmLab57](https://github.com/heybeaux/swarmlab/pull/57) / [Aegis73](https://github.com/heybeaux/aegis/pull/73). Aegis head `46090e614b9fed08fab2eda7d5b7a383a3e62bdd`; runtime admitted `0bfd2fdc065d5e27c98f0e566d6d40e6ede99d77`. Source/dist unchanged between them.

- SwarmLab [real-package CI39383004370](https://github.com/heybeaux/swarmlab/actions/runs/39383004370) SUCCESS: frozen19-case experiment green against actual pinned Aegis, exact evaluations/manifests verified;24tamper rejections+positive. Neighbor64/65 CI success are regressions only.
- Aegis [release CI39382876674](https://github.com/heybeaux/aegis/actions/runs/39382876674) FAILURE: two unchanged benchmark determinism tests timed out at5000ms (observed9066ms and7518ms). Other package tests passed; build/typecheck passed. Local full1188tests/release green does NOT resolve cross-platform runtime overhead. The private-realm optimization corrected local initial failures, but **has not fixed the CI compatibility regression**.

Final status `pr-open-held-ci-regression`. Neither PR merged, no release improvement claimed. Experiment post-fix result green is bounded to this corpus; overall nightly landing is RED until matching overhead is reduced and unchanged tests pass on CI. Do not raise test timeouts, move frozen thresholds, count old suites as development, or rerun until lucky. Review general batched native matching / carefully scoped compiled-native caching, with unchanged oracle and before/after revalidation, as same-experiment follow-up; no speculative patch tonight.

Next *new* hypothesis (not selected/run): can an unbounded count of individually bounded regex rules/targets starve the overall evaluate call? Cumulative-work budget needs independent preregistration. Loader/preprocessing boundaries remain unproven. .acr unchanged, Territory not refreshed. Pre-existing primary checkout changes untouched; worktrees and all red artifacts retained.
