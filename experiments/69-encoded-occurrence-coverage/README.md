# 69 — Encoded occurrence coverage

[Spec75](../../specs/75-encoded-occurrence-coverage.md) is preregistered design.
Run: `AEGIS_REPO=/path/to/aegis node experiments/69-encoded-occurrence-coverage/main.mjs`.
Verify stored receipts: `node experiments/69-encoded-occurrence-coverage/verify-receipts.mjs`.
Fresh live verification requires `--run <log> --since <integer-ms> --sha <exact40hex>`;
then `node experiments/69-encoded-occurrence-coverage/test-verifier.mjs <log>`.
No LLM scorer. Actual exported extraction/load/evaluate, not reimplemented policy.

## RT-59 — Later encoded payloads must not disappear (exp69 / Spec75)

Pre-registration `4394497` (setup-only package-manager correction `5deb644`)
preceded all harness/output. Frozen four-file design `3ed0466`:22 scenarios,
fixed seed, no tuning/LLM judge. Novel boundary is occurrence completeness,
not exp67/68 native matching deadlines. Real fetched Aegis
`27375f6a04cd9403725499d75ac046d8d6e33986` baseline
`eoc-mvj64lpu-32367` / `eoc-mvj64ml5-32409` has10/10
later-payload misses,10/10 direct plaintext controls deny, exact extraction8/22,
resolution8/22. Four compatibility cases share the extraction gap (danger-first
loses a safe second payload; high-first loses critical second; preprocess-off/
wrong-tool actions correct but extraction incomplete);8other controls green.
All repeated observable rows identical; ownership/recovery1, infrastructure0.
Red results retained, not hidden by claiming all compatibility controls passed.

Runtime `5061c96bae57cf0084ba69721e2dd908899510b0` enumerates all supported
base64 occurrences using per-call global iterators; original first, legacy
family priority, source order within family, trim/dedup and one-layer grammar
preserved. Same frozen design `eoc-mvj66nj2-36850`: later miss0,
exact extraction/resolution22/22, every secondary1, infrastructure0. Full
24-event replay and source/dist manifests/content addresses in receipts.json.
17 focused regressions; full release1209 tests (628+214+22+86+203+56), historical
catalogue53/53. Live candidate audit +27tamper rejections/actual+virtual positives
verify exact decision/array bodies, package pin, freshness and actual files.

Host owns policy/input authenticity and execution. This is not recursive shell
interpretation, new grammar, arbitrary encoding support, preprocessing CPU/memory
bounds or production certification. Public options/default false retained.
No .acr edits/Territory refresh; prior primary changes untouched, pending exp68
not imported or certified. Holdout reserved/unused. Regression-only checks
are not novel evidence. Linked PR/CI and merge status recorded only as observed.

Paired runtime candidate [Aegis75](https://github.com/heybeaux/aegis/pull/75),
exact executable CI pin `f230eb62419977b3ee0d45b4b127740846b5d725`. Remote checks not yet observed;
no merge inferred.

Paired evidence [SwarmLab59](https://github.com/heybeaux/swarmlab/pull/59); source `.acr` unchanged.
Local Aegis release/build/typecheck1209tests+53historical gates and SwarmLab
52claims114traces1049assertions green. Actual remote checks pending at this
documentation commit. Red/red/green design and all22cases unchanged.
