# Experiment 45 - Checkpoint roster capability downgrade

**Pre-registered:** 2026-09-21T06:32:55Z, before implementation or baseline execution.  
**Spec:** [`specs/51-checkpoint-roster-capability-downgrade.md`](../../specs/51-checkpoint-roster-capability-downgrade.md)  
**Seed:** `checkpoint-roster-capability-downgrade-v1`

Tests the next authority-plane boundary after exp-44. Exp-44 detects obsolete roster content while
the current-roster API is present. Exp-45 asks whether the explicit strict-roster boundary remains
strict when retry/resume uses an adapter view where roster truth is unavailable or the roster method
has disappeared entirely.

The harness has three arms: host capability-fallback control, strict roster-continuity fixture, and
real built Aegis loaded from `AEGIS_REPO`, `AEGIS_DIST`, and `AEGIS_HOOK_DIST`. Ground truth is
machine-owned deterministic scenario data. No LLM judges success.

Green requires every strict capability-loss scenario to fail closed, zero restored authority under
downgrade, exact classification for all fifteen frozen scenarios, explicit strict resolve and begin
API availability, preservation of legacy/current/terminal/compacted behavior, safe recovery when the
same current roster returns, post-CAS downgrade safety, and ASK/consume coverage. Exact thresholds,
seed, scenario roster, commands, and ownership are frozen in Spec 51.
`checkpoint-roster-capability-downgrade-holdout-v1` is reserved and unused.
