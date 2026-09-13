# Experiment 37 — Terminal journal integrity

**Pre-registered:** 2026-09-13T06:34:00Z, before implementation or baseline execution.  
**Spec:** [`specs/43-terminal-journal-integrity.md`](../../specs/43-terminal-journal-integrity.md)  
**Seed:** `terminal-journal-integrity-v1`

Tests a read-integrity boundary not covered by RT-23 through RT-27: terminal state and its retained exact receipt may disagree because a host adapter, projection, migration, or replica exposed a torn record. The frozen design compares a state-only control, a deterministic coherence validator, and real built Aegis `resolveExecutionEffect()` across fourteen fixed scenarios. Ground truth is machine-owned record coherence; no LLM judges success.

Green requires zero false terminal certainty, unsafe retry, and classification error; accuracy/API availability/coherent terminal preservation/clean retry preservation/started fail-closed safety/ask/consume coverage must all equal 1. Exact commands and ownership are frozen in Spec 43. `terminal-journal-integrity-holdout-v1` is reserved and unused.
