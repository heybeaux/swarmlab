# Experiment 33 — Concurrent effect-start fencing

**Pre-registered:** 2026-09-11T03:29:39Z, before baseline execution.  
**Spec:** [`specs/39-concurrent-effect-start-fencing.md`](../../specs/39-concurrent-effect-start-fencing.md)  
**Seed:** `concurrent-effect-start-fencing-v1`

Tests whether RT-23's `not_executed/retryable` resolution is enough to safely start an effect when two crashed/resuming hosts race. It is not: an observation that the effect has not started is not itself exclusive authority to start it.

The frozen design has three arms (`resolution-only-control`, `atomic-start-fixture`, `aegis-wrapped`) and seven deterministic scenarios: single resume, concurrent two-host resume, stale original caller, duplicate same-host start, invalid authority, unavailable start store, and already-committed effect. Exact execution counts provide ground truth; no LLM judges success.

## Result — RT-23 baseline red, fenced Aegis green

Baseline Aegis `72d800a` exposed the retained effect journal but no governed start fence. Pinned baseline `cesf-mtwekmqk` was red: duplicate-effect rate `4/7`, indeterminate-start execution `1/7`, start accuracy `3/7`, API availability `0`, and idempotent-start safety `5/7`. Ask/consume coverage stayed `1`, and the atomic-start fixture was fully green.

Aegis `6c78a98` adds `beginExecutionEffect()`: it validates permit and operation binding, revalidates fresh authority, burns invalid authorization, and invokes the host's atomic `authorized → started` compare-and-set immediately before the effect. Losing concurrent callers are blocked; unavailable start state is explicitly indeterminate and never executable. The unchanged roster reran as `cesf-mtweks7l`: every duplicate/unauthorized/indeterminate-execution/legitimate-block rate `0`; accuracy, API availability, ask/consume coverage, and idempotent safety `1`.

The boundary is operationally important: hosts must call `beginExecutionEffect()` immediately before acting. Treating a read-side `not_executed` result as permission recreates the race this API closes.
