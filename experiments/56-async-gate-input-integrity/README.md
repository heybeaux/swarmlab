# Experiment 56 — Async source-policy gate input integrity

Pre-registered 2026-10-07T06:34:32.734030+00:00 before implementation or baseline observation.

[Spec 62](../../specs/62-async-gate-input-integrity.md) freezes hypothesis, 18 scenarios, controls, deterministic scorer, metrics/thresholds, seed/holdout, ownership and exact commands. Both real-Aegis arms invoke the same exported async checkpoint gate. No LLM judges success.

Results pending.

## Before / after

- Baseline real Aegis `f37864f`: pinned runs `agii-muxqic7t` and `agii-muxqic9t`. Both allow 12/12 changed-input cases; input mutation detection 0; exact accuracy 6/18; fixture 18/18. Early mutations incorrectly still call observe. Critical command drift incorrectly allows.
- Candidate: see pinned trace below. Same exported API, same compiled experiment, 18 frozen scenarios and thresholds, no LLM judgments or scenario tuning.
- Guard scope: observable changes during await; equivalent copied input allowed. Transient mutate-and-restore is an intentionally passing scope-limit control, NOT detection proof. Host/action atomicity after return and mutable rules/options are unproven.

Pinned candidate `agii-muxqm4fw` on Aegis `21f34fbedcfb8f48bbe3f61522e530de7595d563`: unsafe allow 0, mutation detection 1, resolution accuracy 1, all secondary metrics 1. Each 59-event trace passed full replay equality. Private snapshots/after-await guards address the demonstrated class, not individual fixture command names.
