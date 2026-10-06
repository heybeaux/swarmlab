# Experiment 55 — Durable source-policy roster checkpoint

Pre-registered 2026-10-06T06:33:47.975514+00:00, before implementation or baseline observation.

Spec: [61](../../specs/61-source-policy-roster-checkpoint.md). Frozen 22 scenarios test cross-call monotonic roster history, not exp-54 per-call equality. Seed, controls, metrics, thresholds, ownership and commands are frozen in Spec 61. No LLM judges success.

## Results

- Baseline `sprc-muwb2jz7` / repeat `sprc-muwb2k1q` on real Aegis `c8fe1b0`: unsafe allow 12/13; detection 1/13; exact accuracy 10/22; API unavailable. Fixture green.
- Candidate `sprc-muwb77jk` on committed Aegis `86d68cd30c08a26e7ad8e18918770aa069d3f8c7`: unsafe allow 0; all other frozen metrics 1; fixture green; full 71-event replay equality checked.

Both use identical 22 scenarios, seed, scorer and thresholds. Built artifact/harness content hashes are in trace headers. Host checkpoint persistence/authentication and final-read-to-action atomicity remain host-owned; ordinary evaluate is deliberately unchanged.
