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

## Results - current Aegis red, patched Aegis green

Baseline real Aegis `8eb1c32dadf2a73e8e382a6657f8ca2096341ada`, run `cwo-mu80pubb`,
detected `0/5` witness-omission scenarios, restored retry or execute authority in `3/5`,
reached exact resolution accuracy `4/14`, exposed no explicit witness-set resolver, and failed
unavailable, absent, invalid, and post-CAS witness-set safety. The strict witness-set fixture was
fully green.

Patched real Aegis `c24b37c4786331c2fd0ecbe147a87952afa4f6dc`, run `cwo-mu80u7bx`,
detected `5/5`, restored no retry or execute authority, reached `14/14` exact accuracy, and made
every API, preservation, safety, post-CAS, ask, and consume metric green. Aegis now feature-detects
an optional `readEffectRevisionWitnessSet()` contract, validates required authority identities and
minimum quorum, fails closed on absent/unavailable/malformed/incomplete witness sets, and exposes
`resolveWitnessSetAnchoredExecutionEffect()` as the explicit public boundary.

One intermediate post-fix rerun, `cwo-mu80s96a`, went green against the runtime commit before the
RT-34 evidence-gate metadata was committed. It is preserved as a trace but not used as the final
claim run.
