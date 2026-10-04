# Experiment 54 — Source freshness policy authority roster epoch binding

**Pre-registered:** 2026-10-04T06:38:00Z, before harness implementation or baseline execution.  
**Spec:** [`specs/60-source-freshness-policy-authority-roster.md`](../../specs/60-source-freshness-policy-authority-roster.md)  
**Seed:** `source-freshness-policy-authority-roster-v1`

Tests whether real Aegis rejects an internally unanimous policy-authority set when the authority roster itself is stale, forked, foreign, unauthenticated, malformed, or misbound. Exp-53 / RT-43 validates agreement under one caller-supplied roster; exp-54 binds that roster's own identity, epoch, canonical membership digest, authentication, and members at the consequential source-freshness action boundary. The frozen roster, metrics, thresholds, ownership boundaries, and exact commands are in Spec 60. No LLM judges success.

Results are intentionally blank until this pre-registration is committed and the new harness runs.
