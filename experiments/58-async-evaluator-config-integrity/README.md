# Exp-58 — Async evaluator configuration integrity

Pre-registration: [Spec 64](../../specs/64-async-evaluator-config-integrity.md). 21 frozen scenarios, seed `async-evaluator-config-integrity-v1`; real Aegis public async evaluator, no local policy copy.

Baseline red and candidate local green (CI pending). Run with AEGIS_REPO and AEGIS_DIST as specified in the frozen spec.

## Evidence

- Pre-registration b0378e0604dc41ee1ad8f3d61c8d76cbfe975533, before implementation/output.
- Baseline origin/main1550e6e: `aci-mv0ldq1x` and `aci-mv0ldq3x`, identical63 arm rows. Unsafe allow12/14, detection2/14, accuracy7/21.
- Candidate `2dfc4929a9a8f94b28875b69cad577ebe0822fce`: `aci-mv0lgl6y`, unsafe allow0, detection/accuracy/current-deny/entry-deny and all secondary metrics1. Full68-event replay.
- Fixture accounting corrected once before admitted baseline; non-admitted diagnostics aci-mv0ldbg2/aci-mv0ldbiq retained locally. Same21 frozen scenarios and thresholds; real output unchanged.
- Complete artifact and harness SHA256 manifests are inside each trace header. CLAIMS.json RT48 pins all48 score assertions. Holdout unused: no tuning.
- Prior exp57/RT47 remains unlanded; not represented as tonight's novelty. See frozen spec for owner boundaries and commands.

## Regression-only verification

SwarmLab build/typecheck and verify:evidence:46 claims/96 traces/881 assertions. Aegis full release:check:1087 tests, evidence47/47 (RT47 intentionally not included: prior unlanded exp57). Focused29/29, including12 new. Exp55/56 same roster fully green, audit traces not admitted. Initial release failed only an explicit evidence-ID list expectation; corrected catalogue assertion, not runtime or thresholds, full rerun green. CI/PR status recorded below when observed.
