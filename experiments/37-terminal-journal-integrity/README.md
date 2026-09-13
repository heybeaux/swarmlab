# Experiment 37 — Terminal journal integrity

**Pre-registered:** 2026-09-13T06:34:00Z, before implementation or baseline execution.  
**Spec:** [`specs/43-terminal-journal-integrity.md`](../../specs/43-terminal-journal-integrity.md)  
**Seed:** `terminal-journal-integrity-v1`

Tests a read-integrity boundary not covered by RT-23 through RT-27: terminal state and its retained exact receipt may disagree because a host adapter, projection, migration, or replica exposed a torn record. The frozen design compares a state-only control, a deterministic coherence validator, and real built Aegis `resolveExecutionEffect()` across fourteen fixed scenarios. Ground truth is machine-owned record coherence; no LLM judges success.

Green requires zero false terminal certainty, unsafe retry, and classification error; accuracy/API availability/coherent terminal preservation/clean retry preservation/started fail-closed safety/ask/consume coverage must all equal 1. Exact commands and ownership are frozen in Spec 43. `terminal-journal-integrity-holdout-v1` is reserved and unused.

## Result — current Aegis red, patched Aegis green

Baseline Aegis `22d9ace239eaf0fa0376a4c9319dad2e8f5e893c` trusted terminal state without its matching receipt and allowed retry from one nonterminal record carrying a terminal fragment. Pinned run `tji-mtzfwl8k` measured false terminal certainty `1.000`, unsafe retry `0.500`, integrity error `0.714`, and resolution accuracy `0.286`; the coherence fixture was fully green.

Aegis `625be09` validates receipt-capable journal state and receipt as one envelope, reports incoherence as non-retryable `indeterminate/journal_inconsistent`, and applies the validator to resolve, begin, and terminal-ack readback. The unchanged roster reran as `tji-mtzg16x0`: every unsafe/error rate `0` and every accuracy/API/coverage/preservation metric `1`. Legacy coarse RT-23 stores without receipt APIs remain compatible.
