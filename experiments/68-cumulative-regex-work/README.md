# Exp68 — Cumulative regex work

Pre-registration: [Spec74](../../specs/74-cumulative-regex-work.md). New cumulative-call boundary, not exp67 per-match replay. Design and thresholds frozen before implementation/output; results pending.


## RT58 / exp68 — cumulative native regex work (Spec74)

Pre-registration `f5dbc19f35af2e894d5ced702eb422aa59be0a4a` before implementation/output. Twenty independent loader-accepted patterns consume100ms each on actual input, not loader probes. This is a NEW cumulative-work boundary explicitly outside RT57/exp67. Repeated real-main `27375f6a04cd9403725499d75ac046d8d6e33986` baselines `crw-mvhqnt5r-74169` / `crw-mvhqo3nm-74077`:8/8hazards killed by1500ms parent watchdog;13compatibility+8linear controls pass, no infrastructure failure. Parent kill is NOT Aegis refusal. Red traces retained.

Runtime `fee7bd9ab4d71d399c5f243b0c110aeb6833b616` rerun `crw-mvhqqvjv-84114`, exact21scenarios+8linear same seeds/thresholds: watchdog1→0, cumulative safety0→1, resolution13/21→21/21; all controls/recovery/ownership pass. Default250ms total caps native batch AND retry allowance across rules/targets/decoded variants; per-match limit remains. Unknown is independent ask even all-allow severityTable, never a match; previously proven regex and separate substring/predictor deny remain. Later native matches may be unknown. No fixture-specific rule count/pattern policy. 19focused +25RT57 regression tests passed; full release before catalogue1211tests,52/52historical evidence. Final exact-head checks/CI tracked in nightly ledger; no merge asserted here.

Source/dist/full typed traces and hashes in receipts; verifier recomputes roster/checks/scores, binds exact package and admitted green evaluations,39tamper rejections +disk/virtual positives. Holdout reserved unused, no tuning. Scope NOT preprocessing/job-plan/loader/compilation/memory, arbitrary JS or absolute evaluate time bound. Host owns input/policy provenance and execution. Source .acr unchanged, no Territory refresh. Existing held PRs untouched. Next new question (not selected/run): can decode-then-rescan variant expansion consume unbounded preprocessing work before native matching begins? Needs independent preregistration.

## Reproduce
`AEGIS_REPO=/path/to/built/pinned/aegis node experiments/68-cumulative-regex-work/main.mjs`
`node experiments/68-cumulative-regex-work/verify-receipts.mjs`
Fresh actual package: verifier `--run /path/to/output.log --since <integer-ms> --sha <exact40hex>`. Merely exit0 is insufficient: inspect typed decisions and verified metrics.

Final local release candidate `fb842ea66be1666ca771195b5923c2bdcb096aa0` (runtime/source/dist unchanged from admitted fee7bd9) passed build+typecheck+1212tests (628+216+22+86+203+57),53/53stored evidence. Initial catalogue count assertion expected52 vs53; corrected explicit count, red log retained, not runtime regression. SwarmLab core build+forcedtypecheck and verify:evidence52claims114traces1049assertions pass. Exp67 on candidate19/19 passed as REGRESSION ONLY, not novelty. Paired Aegis PR74: https://github.com/heybeaux/aegis/pull/74. Fresh exact-head package verification and CI required before merge.
