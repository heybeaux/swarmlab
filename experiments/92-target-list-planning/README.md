# Experiment92 — Target-list planning admission

[Pre-registration](../../specs/98-target-list-planning.md).

## RT-82 / exp92 — Bound list width before native matching

Spec98 pre-registration `ff95b54757ca3ebd946630c74b5d1a8daaa526c1`; frozen harness
`305900b5f9db09bf1c3a39ebc26bb8fd36cafedf`. Hypothesis: eager per-rule target-list planning can
exhaust the process before regex deadlines start. Exp67/68 only bound native
matching; exp70 bounds decoded command variants. This is a new planning boundary.

Current Aegis `d335c2e2998da045a26ac3585f1ea582bc514989`: runs `tlp-mwriuegy-6872` and `tlp-mwriuuht-7033` each
abort all six 200000-item/32-linear-rule cases with an explicit heap-out-of-memory
error after ready, under the predeclared256MB child heap. Six paired small-list
controls and eight ordinary compatibility controls pass; four overflow semantic
controls fail. Baseline14/24 correct; infrastructure0. Setup/snapshot allocation
completes before ready. Wide disabled/wrong-tool/empty-pack controls pass with the
same input cardinality. A process crash is not counted as an Aegis refusal.

Candidate `e1534ba0b536fc4bf78681990cbb84b9fa3fbdec`, run `tlp-mwrixhqd-8096`: **24/24 green, zero crashes**,
same frozen files, scenarios, seed, limits and thresholds. Aegis admits1024 strings
per relevant target before planning and reuses the prefix across rules and decoded
variants. Scalar content precedes fragments; no joining. Omitted coverage imposes
an independent ask floor with a diagnostic; genuine prefix/other-target/predictor
denies remain. No fabricated hits, caller mutation or retained cross-call budget.

17 new tests (16 fail against baseline),80 focused tests pass; complete release
check passes locally. Raw red/red/green traces, package source/dist manifests and
independent rescoring receipts retained.25 verifier tamper cases reject. CI and
merge outcomes are recorded separately in the nightly ledger. Historical release
gates/evidence checks are regression verification, not new experiments.

Limits: bounded child heap and synthetic public-API corpus; not a general memory
or latency guarantee. Individual string bytes, policy cardinality, arbitrary
hostile JS/getters/proxies, production deployment and trained predictors excluded.
1024 is a conservative fixed admission contract, not an empirically optimal limit.
Holdout unused; no tuning. No .acr edits or Territory refresh. Prior exp86/90 remain
separate. Next hypothesis: can oversized individual substring inputs consume
unbounded work outside the native regex VM? Deduplicate before selection.

Run: `AEGIS_REPO=/absolute/path/to/built/aegis node experiments/92-target-list-planning/main.mjs`

Replay: `node experiments/92-target-list-planning/verify-receipts.mjs`

Runtime PR: [Aegis100](https://github.com/heybeaux/aegis/pull/100).
