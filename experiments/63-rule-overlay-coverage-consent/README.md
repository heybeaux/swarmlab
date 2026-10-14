# Experiment63 — Rule-overlay coverage consent

Pre-registration before observations: [Spec69](../../specs/69-rule-overlay-coverage-consent.md).

New question: does unchanged severity hide classifier coverage loss through cascade overrides? Results pending; no green claim.

## RT53 — Rule-overlay coverage consent (exp63 / Spec69)

Pre-registration `c8bc120` preceded implementation and observations; pre-observation configuration correction `060e6b8` pins high/critical deny for every arm. Real fetched-main Aegis `4be84ed4aab018bee1b9a77b6012b9b97c966d1c` (`occ-mv7qlhb7`, repeat `occ-mv7qlhdk`) allowed **10/10** unconsented matcher/scope losses: rejection **0/10**, resolution **14/25**. Preceding base fixture and pinned-host control **10/10**; explicit reviewed allowances **3/3**. Scenario rows and complete package manifests identical across baseline runs.

Aegis runtime `bc879d6c7fd213b49ef355b64bd83196098ffa0e` compares enabled classifier kind/pattern/target/effective flags and case-sensitive tool-set containment at mergeLayers. Opaque matcher replacements and tool contractions require consent on THIS overlay; warning retains entire preceding effective rule. Flag order/empty equivalence, set-equivalent/expanded tools, metadata, disabled-base re-enable, explicit retunes and insertion order preserved. **Same unchanged harness/seed/scenarios** `occ-mv7qn439`: unsafe allow **0/10**, coverage rejection **10/10**, exact resolution **25/25**, all secondary metrics **1**. Three full replay-verified37-event traces plus source/dist manifests and SHA-256 receipts committed. Focused tests **13 red/6 pass ->19 green**; no thresholds moved.

This tests cascade authority BEFORE compilation, distinct from RT48 in-flight config drift and RT52 declared/cache binding. No regex-language inclusion proof: even safe opaque broadening needs explicit review. No post-merge alias isolation, sandbox execution, learned predictor or production incident claim. Host owns trusted overlays, intentional consent and safe action execution. Prior exp60/61/62 candidates remain unmerged and separate. Explicit authority tightening needs migration review; local evidence green is not remote CI/merge confirmation. Stored old evidence is regression, not novel work.

## Run
`npm install && npm run build` then `AEGIS_REPO=/path/to/real/aegis node experiments/63-rule-overlay-coverage-consent/dist/main.js`. Aegis must be built with compatible pnpm10 (`corepack pnpm@10.9.0`). Inspect receipt.green and all metrics; a diagnostic red has exit0 intentionally. CI validates actual desired state, not command exit alone. New PR CI must run this fresh package integration plus corpus verification.

CI portability: root npm ci includes historical absolute file dependencies into unrelated stack checkouts. The new executable CI therefore uses a pinned isolated TypeScript/Node-types toolchain to build/typecheck core+exp63, replay-verifies the ENTIRE static evidence corpus and exp63 receipts, and freshly reruns exp63 against the exact committed real Aegis runtime. Full-repo build/typecheck are additionally verified locally; no unrelated stack dependencies are rewritten.

RT53 linked candidates: [Aegis69](https://github.com/heybeaux/aegis/pull/69) / [SwarmLab52](https://github.com/heybeaux/swarmlab/pull/52). Local1144 tests + Aegis stored50/50; SwarmLab49 claims105 traces983 assertions; exact clean-worktree CI rehearsal green. Remote CI pending; NOT merged; migration review required. Stored gate range is50 cases throughRT53 with50–52 absent, not53/53 or certification of prior candidates.

### Same-experiment observable evidence-verifier audit

Independent verification reproduced false acceptance: bare `--latest` certified the existing committed green as fresh; missing secondary metrics and altered action/effective-rule rows were accepted when stored self-check booleans stayed green. This is evidence tooling, NOT a new nightly experiment or an Aegis policy defect. The original three traces and all thresholds remain unchanged.

Receipt verification now pins the frozen scenario/harness contract, requires the complete exact metric set, independently recomputes row field checks and all eight metrics, rejects duplicate/omitted or relabeled scenarios, and inspects every live source/dist hash. New `run-and-verify.mjs` requires exactly one newly produced receipt and checks its exact ID against prior IDs and invocation start; bare `--latest` fails closed. Fifteen verifier regressions cover stale-run acceptance, altered trace checks and live artifact mismatch. The exact unchanged experiment reran green in a clean real-Aegisbc879d6 worktree; audit trace remains non-admitted. Core/experiment build/typecheck, full evidence corpus, and all15 verifier tests green. Runtime still byte-identical to bc879d6; no thresholds tuned, no `.acr` changes, migration hold retained.
