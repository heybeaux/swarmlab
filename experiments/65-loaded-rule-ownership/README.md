# Exp65 — Loaded rule validation-snapshot ownership

Pre-registered 2026-10-16T06:33:14.295120+00:00 before harness implementation or baseline observation. [Spec71](../../specs/71-loaded-rule-ownership.md) freezes all18 scenarios, controls, metrics/thresholds, real public Aegis API, ownership and commands. No mergeLayers use; distinct validation/compile lifetime boundary. No result observed yet.

## RT55 — Loaded rule validation-snapshot ownership (exp65 / Spec71, 2026-10-15)

Pre-registration `43750dd5e7d0e222d651d228e0801376b46bbdcc` preceded implementation and all output.
New question: can editing the original JSON recipe silently retune a **loaded**
policy without reload? This experiment never calls mergeLayers; exp64 explicitly
left direct loader binding unproven. It is not compiled-output tamper (pending
RT52), in-flight config (RT48), overlay consent (RT53) or receipt metadata (RT49).

Real fetched Aegis `524098ef690c701e51bd809902484c9915affd85`:
`lro-mvalf27u` and `lro-mvalf2al`, identical deterministic row bodies, producer
snapshot drift **9/9**, unsafe allow **8/8**, exact scenario accuracy **3/18**,
consumer isolation **0**, compatibility **3/6**. Detached input diagnostic was
**18/18**, demonstrating a reference-lifetime gap rather than a broken fixture.
These red traces are preserved. Nine producer edits include metadata/cache
binding evidence even when action stays deny; they do not inflate unsafe counts.

Runtime `35f332ebca7ea7a5c58f069574345a3768c6c29f` clones each Rule **before**
validation/compilation, individually (one pack-wide clone would retain aliases
between sibling ids). Same frozen harness/18 scenarios/seed, `lro-mvalgz7p`:
drift **0/9**, unsafe allow **0/8**, accuracy **18/18**, all secondary metrics **1**.
Independent input/output mutations, repeated loads, shared nested source values,
frozen input, explicit reload/output edits, regex flags and all targets tested.
Focused tests **13 red/7 pass ->20 green**. Thresholds unchanged, no tuning,
reserved holdout unused. Every trace fully replayed,38 events, complete source/
dist manifests and hashes in receipts.json. Pinned candidate `1831c858da1583ac9e6ecbc323942caa2bf2c84b`
reran as `lro-mvalkmbs`, same18/18 rows, actual artifacts checked.

Regression-only: full release:check **1166/1166 tests** (628core+172Aegis+
22collect+86label+203hook+55bench), stored evidence **51/51**. First release
found one stale explicit catalogue-id expectation missing RT55 (not runtime
failure); red log retained, corrected and full release rerun green. SwarmLab
focused build/typecheck, verify:evidence **50claims108traces1001assertions**.
Static measured-score catalogue is historical, not a substitute for live checks.
Verifier requires exact scenario/check keys/denominators, recomputes snapshots
and metrics, binds embedded run id/log/filename, timestamps and actual source/
dist files. Live rows of BOTH arms must exactly equal admitted green bodies.
Tamper tests:16 rejections plus positive accepted; CI executes the frozen design
against the exact pinned package SHA. CI/merge status recorded only once observed.

Host owns policy provenance, deliberate compiled edits and execution. Producer
recipe edits now require explicit reload; existing repository consumers parse
JSON and retain compiled outputs, with no live recipe linkage reliance found.
Loaded outputs remain mutable. Not immutable policy, arbitrary getter/proxy/
function/extension-data support, cache-tamper enforcement, atomic execution,
production safety certification or calibrated prediction. Source .acr unchanged;
Territory not refreshed. Pending RT50–53 branches not imported or certified.

### Linked PRs / observed executable CI
Paired [Aegis71](https://github.com/heybeaux/aegis/pull/71) candidate `1831c858da1583ac9e6ecbc323942caa2bf2c84b`,
[SwarmLab55](https://github.com/heybeaux/swarmlab/pull/55) initial head `a2c33a6`. SwarmLab executable exp65 CI
[38862709129](https://github.com/heybeaux/swarmlab/actions/runs/38862709129)
**SUCCESS**, fresh real-package run `lro-mvaloro5` **18/18**; actual source/dist
manifest and full both-arm row equality verified,16 tamper controls rejected.
Existing exp64 workflow [38862709134](https://github.com/heybeaux/swarmlab/actions/runs/38862709134)
**SUCCESS** as regression only. Aegis release CI pending at this documentation
write; no merge inferred. Final head/checks/merge tracked in nightly ledger;
CodeRabbit SUCCESS alone is not review approval.
