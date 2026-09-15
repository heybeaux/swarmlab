# Experiment 39 — Terminal write attestation

**Pre-registered:** 2026-09-15T07:01:00Z, before implementation or baseline execution.  
**Spec:** [`specs/45-terminal-write-attestation.md`](../../specs/45-terminal-write-attestation.md)  
**Seed:** `terminal-write-attestation-v1`

Tests a distinct terminal boundary: `completeEffect()` / `failEffect()` returns a positive enum, but the exact submitted receipt is not durably visible. The frozen design compares a return-trusting control, deterministic readback-attestation fixture, and real built Aegis public completion/failure APIs across sixteen fixed scenarios. Retained journal state is machine-owned ground truth; no LLM judges success.

Green requires zero false-positive terminal certainty, wrong-receipt acceptance, and unverified positive results; accuracy/API availability/honest and idempotent preservation/negative-result preservation/unavailable-read safety/ask/consume coverage must all equal 1. Exact scenarios, commands, thresholds, holdout discipline, and ownership are frozen in Spec 45. `terminal-write-attestation-holdout-v1` is reserved and unused.
