# Experiment 44 - Checkpoint witness roster epoch

**Pre-registered:** 2026-09-20T06:32:39Z, before implementation or baseline execution.  
**Spec:** [`specs/50-checkpoint-witness-roster-epoch.md`](../../specs/50-checkpoint-witness-roster-epoch.md)  
**Seed:** `checkpoint-witness-roster-epoch-v1`

Tests the next authority-plane boundary after exp-43. Exp-43 detects omitted required witnesses
when the witness-set policy is trustworthy. Exp-44 asks whether Aegis can detect when that policy
itself is obsolete or split-brained: the visible authorities and visible witness set are complete
for an old roster, but independently retained current roster truth says membership or quorum has
advanced.

The harness has three arms: a legacy old-roster host control, a strict roster-epoch fixture, and
real built Aegis loaded from `AEGIS_REPO` plus `AEGIS_DIST` and `AEGIS_HOOK_DIST`. Ground truth is
deterministic scenario data. No LLM judges success.

Green requires every roster-split scenario to fail closed, zero retry authority under roster split,
exact classifications for all sixteen frozen scenarios, explicit witness-roster API availability,
preservation of current-roster/legacy/current/terminal/compacted behavior, post-CAS roster-split
safety, and ask/consume coverage. Exact thresholds, seeds, scenarios, commands, and Aegis
ownership are frozen in Spec 50. `checkpoint-witness-roster-epoch-holdout-v1` is reserved and
unused.
