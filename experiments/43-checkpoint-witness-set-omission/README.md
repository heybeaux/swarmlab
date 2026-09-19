# Experiment 43 - Checkpoint witness-set omission

**Pre-registered:** 2026-09-19T06:35:00Z, before implementation or baseline execution.  
**Spec:** [`specs/49-checkpoint-witness-set-omission.md`](../../specs/49-checkpoint-witness-set-omission.md)  
**Seed:** `checkpoint-witness-set-omission-v1`

Tests the next authority-plane boundary after exp-42. Exp-42 detects conflicts among checkpoint
authorities that are visible to Aegis. Exp-43 asks whether Aegis can detect when the host exposes
only a safe-looking subset of the required witnesses, hiding an omitted authority that would have
shown a later or conflicting same-operation history.

The harness has three arms: a visible-subset host control, a strict witness-set fixture, and real
built Aegis loaded from `AEGIS_REPO` plus `AEGIS_DIST` and `AEGIS_HOOK_DIST`. Ground truth is
deterministic scenario data. No LLM judges success.

Green requires every witness-omission scenario to fail closed, zero retry authority under omission,
exact classifications for all fourteen frozen scenarios, explicit witness-set API availability,
preservation of complete-witness/legacy/current/terminal/compacted behavior, post-CAS omission
safety, and ask/consume coverage. Exact thresholds, seeds, scenarios, commands, and Aegis
ownership are frozen in Spec 49. `checkpoint-witness-set-omission-holdout-v1` is reserved and
unused.

Results will be written here after the baseline and post-fix runs. Red baseline traces remain
admitted evidence even if the Aegis patch later goes green.

