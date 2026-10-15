# Exp64 — Merged rule reference ownership

Pre-registration [Spec70](../../specs/70-merged-rule-ownership.md). Frozen21 scenarios and thresholds; real public Aegis mergeLayers/loadPack/evaluate. Baseline and results not yet observed.

## RT54 — Merged rule reference ownership (exp64 / Spec70, 2026-10-14)

New pre-registered question: can caller-owned rule recipes edit already-constructed
cascade policy between synchronous merge and compilation? Pre-registration `4e5c4c8`;
21 frozen scenarios, no tuning or LLM judge. Distinct from in-flight RT48, receipt
metadata RT49, defaults RT51, compiled-cache RT52 and overlay consent RT53.

Real Aegis `4be84ed` baseline `mro-mv96376j` / `mro-mv9637ag` identical rows:
producer drift **8/9**, unsafe allow **8/9**, exact resolution **8/21**;
consumer isolation **0**, compatibility controls **7/9**, caller ownership **1**.
Independent detached-boundary diagnostic **21/21** on both baselines; it is a
control, not replacement Aegis. These red traces remain committed.

Runtime patch `f27427879984856bad36731788376dbc74702aaa` clones each effective Rule independently at
merge return. Separate cloning is important: cloning the whole array preserves
shared nested identities across distinct rule ids. Same unchanged harness/seeds,
`mro-mv966i1f`: producer drift **0/9**, unsafe allow **0/9**, resolution **21/21**,
all secondary metrics **1**,46-event full replay; manifests pin real package.
Focused frozen tests **16 red/4 pass ->20 green**. Thresholds unchanged.

Host owns provenance, deliberate policy edits and reloading; result remains
editable. Direct loadPack binding, live immutability/atomic execution, getters or
proxies are not claimed. Stored scores are historical regression evidence,
not runtime verification. Full regression and remote CI/PR status will be recorded
below when actually observed. Prior exp60–63 candidates remain separate/unmerged.

### Regression verification (not new evidence)
Full Aegis release:check at `edb9f55`: build/typecheck **1145/1145 tests**
(628core,152Aegis,22collect,86label,203hook,54bench), static measured evidence **50/50**.
Initial evidence catalogue update exposed one stale expected report banner, not a
runtime regression: corrected RT49->RT54 expectation; preserved red log, full rerun
green. SwarmLab build/typecheck and verify:evidence **49claims105traces980assertions**.
Fresh same-harness `mro-mv96dcb4` on clean final candidate **21/21**, actual source/dist
manifest audited. Frozen red+green46-event receipts verified; no thresholds moved.
Baseline frozen/remerge compatibility controls fail on real old Aegis7/9, whereas
the detached diagnostic is21/21, distinguishing general ownership gap from fixture
failure. Holdout remains unused. No source .acr changes; Territory not refreshed.

### Linked PRs and observed GitHub CI
Aegis [PR70](https://github.com/heybeaux/aegis/pull/70), candidate
`edb9f557fc776b5710360a453f0df0146f3b977b`: release-check
[38694629492](https://github.com/heybeaux/aegis/actions/runs/38694629492) **SUCCESS**.
SwarmLab [PR53](https://github.com/heybeaux/swarmlab/pull/53), evidence
`b973bd8db231b4168191a773f9f0e06f463192a2`: portable replay + pinned real-package
[38694637393](https://github.com/heybeaux/swarmlab/actions/runs/38694637393) **SUCCESS**.
Both inspected CLEAN/MERGEABLE; CodeRabbit success is review-skipped, **not review
approval**. No protections bypassed. Final documentation commit will get its own CI;
merge/main SHA/status recorded in the nightly ledger, not inferred here.
