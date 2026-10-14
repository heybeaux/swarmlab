# Experiment63 — Rule-overlay coverage consent

Pre-registration before observations: [Spec69](../../specs/69-rule-overlay-coverage-consent.md).

New question: does unchanged severity hide classifier coverage loss through cascade overrides? Results pending; no green claim.

## RT53 — Rule-overlay coverage consent (exp63 / Spec69)

Pre-registration `c8bc120` preceded implementation and observations; pre-observation configuration correction `060e6b8` pins high/critical deny for every arm. Real fetched-main Aegis `4be84ed4aab018bee1b9a77b6012b9b97c966d1c` (`occ-mv7qlhb7`, repeat `occ-mv7qlhdk`) allowed **10/10** unconsented matcher/scope losses: rejection **0/10**, resolution **14/25**. Preceding base fixture and pinned-host control **10/10**; explicit reviewed allowances **3/3**. Scenario rows and complete package manifests identical across baseline runs.

Aegis runtime `bc879d6c7fd213b49ef355b64bd83196098ffa0e` compares enabled classifier kind/pattern/target/effective flags and case-sensitive tool-set containment at mergeLayers. Opaque matcher replacements and tool contractions require consent on THIS overlay; warning retains entire preceding effective rule. Flag order/empty equivalence, set-equivalent/expanded tools, metadata, disabled-base re-enable, explicit retunes and insertion order preserved. **Same unchanged harness/seed/scenarios** `occ-mv7qn439`: unsafe allow **0/10**, coverage rejection **10/10**, exact resolution **25/25**, all secondary metrics **1**. Three full replay-verified37-event traces plus source/dist manifests and SHA-256 receipts committed. Focused tests **13 red/6 pass ->19 green**; no thresholds moved.

This tests cascade authority BEFORE compilation, distinct from RT48 in-flight config drift and RT52 declared/cache binding. No regex-language inclusion proof: even safe opaque broadening needs explicit review. No post-merge alias isolation, sandbox execution, learned predictor or production incident claim. Host owns trusted overlays, intentional consent and safe action execution. Prior exp60/61/62 candidates remain unmerged and separate. Explicit authority tightening needs migration review; local evidence green is not remote CI/merge confirmation. Stored old evidence is regression, not novel work.

## Run
`npm install && npm run build` then `AEGIS_REPO=/path/to/real/aegis node experiments/63-rule-overlay-coverage-consent/dist/main.js`. Aegis must be built with compatible pnpm10 (`corepack pnpm@10.9.0`). Inspect receipt.green and all metrics; a diagnostic red has exit0 intentionally. CI validates actual desired state, not command exit alone. New PR CI must run this fresh package integration plus corpus verification.
