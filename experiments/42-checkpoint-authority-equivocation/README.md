# Experiment 42 - Checkpoint authority equivocation

**Pre-registered:** 2026-09-18T06:44:00Z, before implementation or baseline execution.  
**Spec:** [`specs/48-checkpoint-authority-equivocation.md`](../../specs/48-checkpoint-authority-equivocation.md)  
**Seed:** `checkpoint-authority-equivocation-v1`

Tests the next authority-plane boundary after exp-41: multiple independently authenticated checkpoint authorities for the same operation. Exp-41 proves one independent lower bound. Exp-42 asks whether Aegis can detect conflicting same-operation histories across authorities before restoring terminal certainty, retry authority, or execute permission.

The harness has three arms: a single-checkpoint host control, a strict multi-authority fixture, and real built Aegis loaded from `AEGIS_REPO` plus `AEGIS_DIST` and `AEGIS_HOOK_DIST`. Ground truth is deterministic scenario data. No LLM judges success.

Green requires every equivocation scenario to fail closed, zero retry authority under equivocation, exact classifications for all sixteen frozen scenarios, public multi-authority API availability, preservation of legacy/single-anchor/current/terminal/compacted behavior, post-CAS equivocation safety, and ask/consume coverage. Exact thresholds, seeds, scenarios, commands, and Aegis ownership are frozen in Spec 48. `checkpoint-authority-equivocation-holdout-v1` is reserved and unused.
