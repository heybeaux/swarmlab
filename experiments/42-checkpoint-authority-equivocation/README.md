# Experiment 42 - Checkpoint authority equivocation

**Pre-registered:** 2026-09-18T06:44:00Z, before implementation or baseline execution.  
**Spec:** [`specs/48-checkpoint-authority-equivocation.md`](../../specs/48-checkpoint-authority-equivocation.md)  
**Seed:** `checkpoint-authority-equivocation-v1`

Tests the next authority-plane boundary after exp-41: multiple independently authenticated checkpoint authorities for the same operation. Exp-41 proves one independent lower bound. Exp-42 asks whether Aegis can detect conflicting same-operation histories across authorities before restoring terminal certainty, retry authority, or execute permission.

The harness has three arms: a single-checkpoint host control, a strict multi-authority fixture, and real built Aegis loaded from `AEGIS_REPO` plus `AEGIS_DIST` and `AEGIS_HOOK_DIST`. Ground truth is deterministic scenario data. No LLM judges success.

Green requires every equivocation scenario to fail closed, zero retry authority under equivocation, exact classifications for all sixteen frozen scenarios, public multi-authority API availability, preservation of legacy/single-anchor/current/terminal/compacted behavior, post-CAS equivocation safety, and ask/consume coverage. Exact thresholds, seeds, scenarios, commands, and Aegis ownership are frozen in Spec 48. `checkpoint-authority-equivocation-holdout-v1` is reserved and unused.

## Results - current Aegis red, patched Aegis green

Baseline real Aegis `4a30255dc8793f20afa877c7d794e5d663f266a6`, run `cae-mu6lbz2a`, detected `0/5` equivocation scenarios, restored retry or execute authority in `3/5`, reached exact resolution accuracy `5/16`, exposed no explicit multi-authority checkpoint resolver, and failed unavailable/absent/invalid quorum plus post-CAS equivocation safety. The strict multi-authority fixture was fully green.

Patched real Aegis `77883f6e02d4c3e68448cbb71619bef3f511d9e0`, run `cae-mu6lbz32`, detected `5/5`, restored no retry or execute authority, reached `16/16` exact accuracy, and made every API, preservation, safety, post-CAS, ask, and consume metric green. Aegis now feature-detects a plural checkpoint authority contract, validates authority identity and exact operation/history-digest shape, fails closed on duplicate or conflicting authorities, and exposes `resolveMultiAuthorityAnchoredExecutionEffect()` as the explicit public boundary. Single-anchor and legacy stores preserve exp-41 behavior.

Two non-admitted setup reruns happened while tightening the API-availability measurement: `cae-mu6l7lzn` (baseline) and `cae-mu6l9tu5` (candidate) proved the safety red/green shape but measured API availability from the store fixture instead of an explicit public Aegis boundary. They are preserved as traces but not used for the RT-33 claim.
