# Experiment 57 — Async source-observation expiry

[Spec63](../../specs/63-async-source-expiry.md), preregistration180db76.


### RT-47 — Unchanged source observations expire during async checkpoint I/O (exp-57)

Pre-registration `180db76` froze20 scenarios and integer monotonic-clock ground truth before
implementation/output. Unlike exp56 input aliasing, input and policy remain unchanged throughout.
Real origin/main Aegis `1550e6ed8a660febee30ce6fe291f41b87bf1bf1` allowed all12 expiry/clock hazards
(`ase-muz5zo5h`, repeat `ase-muz5zoav` with identical scenario rows), reached8/20 exact accuracy,
and never sampled elapsed lifetime. The independent fixture was perfect; checkpoint truth remained valid.

Runtime `aeb1abf434d0789b1770ffc956ddb6c96aa987c0` adds optional monotonic-clock injection (real `performance.now` default),
private entry sample/function capture, inclusive remaining-budget comparisons after read/observe/read,
invalid/regressing/throwing-clock refusal, early no-observe and post-observe no-read discipline,
and deny-floor preservation. SAME frozen harness/seed/scenarios reran as `ase-muz63pn3`:
unsafe allow0/12, detection1, exact accuracy20/20 and every secondary metric1. All65events
replay exactly; trace manifests bind source and complete real built Aegis artifact, not a local policy copy.

Hosts still own trustworthy initial source timestamps, units/clock, authentic persistence and exact
immediate action after return. This does not re-observe sources, detect changes inside a valid window,
validate colluding clocks, cover pre-invocation latency/rules-options mutation or close post-return races.
No predictive calibration or production-database claim. Reserved holdout unused; no policy tuned.

## Evidence hashes

- `ase-muz5zo5h.jsonl`: `sha256:98a376994d728961ce264e06dc7bad8b73907ef352843b58ea9fe9bed9451160`
- `ase-muz5zoav.jsonl`: `sha256:0acbb365f207bbf73f1904f929119de628f504503f880da4a8d0296d5024750a`
- `ase-muz63pn3.jsonl`: `sha256:3b037c7e84638b81c294afd47f9422c311342096b4f2e6a8b68705179b257134`

## Run

```bash
npm install && npm run build && npm run typecheck
AEGIS_REPO=/path/to/built/aegis AEGIS_DIST=/path/to/built/aegis/packages/aegis/dist/index.js node experiments/57-async-source-expiry/dist/main.js
```

Inspect score/action/state/write counts, not merely exit0. Pure evaluate control and independent lifetime fixture are explicitly NOT Aegis integration. Existing exp55/56 reruns are regression-only and not pinned in this claim.
