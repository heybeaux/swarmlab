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

## Result

- Baseline real Aegis `7e73b0656a0d7edb3300c149398aa5281b94a05c`: `rcd-mucazy99`
  was reproducibly red (`detection=0.3333`, `authority restoration=0.5556`, `accuracy=0.6`,
  `strict API availability=0`).
- Patched real Aegis `4f2760b2c848beea0e5187f4a1d075c177067d33`: exact rerun
  `rcd-mucbcbk3` was green (`detection=1`, `authority restoration=0`, `accuracy=1`, strict API
  availability and every preservation/safety/recovery/coverage metric `1`).
- The fix adds explicit strict resolve/begin boundaries and Aegis-created continuity context while
  preserving generic legacy API behavior. Intermediate setup/debug traces are not admitted evidence.
