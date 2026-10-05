# Experiment 54 — Source freshness policy authority roster epoch binding

**Pre-registered:** 2026-10-04T06:38:00Z, before harness implementation or baseline execution.  
**Spec:** [`specs/60-source-freshness-policy-authority-roster.md`](../../specs/60-source-freshness-policy-authority-roster.md)  
**Seed:** `source-freshness-policy-authority-roster-v1`

Tests whether real Aegis rejects an internally unanimous policy-authority set when the authority roster itself is stale, forked, foreign, unauthenticated, malformed, or misbound. Exp-53 / RT-43 validates agreement under one caller-supplied roster; exp-54 binds that roster's own identity, epoch, canonical membership digest, authentication, and members at the consequential source-freshness action boundary. The frozen roster, metrics, thresholds, ownership boundaries, and exact commands are in Spec 60. No LLM judges success.

## Results

- Baseline real Aegis `5d8c4ed` — `sfpar-muuvkmb3`: reproducible red. All 15 roster-failure scenarios were allowed (`unsafeRosterMismatchAllowRate=1`, detection/API `0`, exact accuracy `0.375`); fixture and preservation controls were green.
- Candidate real Aegis `599a741` — `sfpar-muuvotrx`: green. Unsafe allow `0`; detection, exact accuracy, API availability, every secondary metric, fixture accuracy, and replay verification equal `1`.

The same frozen 24-scenario roster, seed, metrics, and thresholds were used before and after. Existing evidence checks are regression verification only.
