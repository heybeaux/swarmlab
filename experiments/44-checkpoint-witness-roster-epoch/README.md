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

## Results - current Aegis red, patched Aegis green

Baseline real Aegis `c2fc0f1f1fb41e4c0e8ac59db8f1705530878b0e`, run `wre-mu9gc5je`,
detected `0/7` roster-split scenarios, restored retry/execute/terminal authority in `5/7`,
reached exact resolution accuracy `4/16`, exposed no explicit witness-roster resolver, and failed
unavailable, absent, invalid, and post-CAS roster-split safety. The strict roster-epoch fixture was
fully green.

Patched real Aegis `569b11b61edd0579b7755b8af796f98fe56476a3`, run `wre-mu9genkw`,
detected `7/7`, restored no retry/execute/terminal authority, reached `16/16` exact accuracy, and
made every API, preservation, safety, post-CAS, ask, and consume metric green. Aegis now
feature-detects an optional `readEffectRevisionWitnessRoster()` contract, validates a positive
roster epoch plus self-checking roster digest, compares current roster truth with the visible
witness set and checkpoint authorities, fails closed on absent/unavailable/malformed/stale roster
truth, and exposes `resolveWitnessRosterAnchoredExecutionEffect()` as the explicit public boundary.

One intermediate post-fix rerun, `wre-mu9gcc38`, went green against uncommitted runtime code before
the Aegis commits were created. It is preserved as a trace but not used as the final claim run.
