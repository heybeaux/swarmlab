# Experiment 47 - Durable strict-roster policy retirement

**Pre-registered:** 2026-09-25T06:36:00Z, before implementation or baseline execution.  
**Spec:** [`specs/53-durable-strict-roster-retirement.md`](../../specs/53-durable-strict-roster-retirement.md)  
**Seed:** `durable-strict-roster-retirement-v1`

RT-37 proved exact active marker continuity but intentionally left lifecycle and retention host-owned.
This experiment asks the next distinct question: whether an exact terminal-bound retirement
transition can reclaim active marker state while retaining enough tombstone truth to classify late
retries and prevent ABA/reselection authority.

The three arms are naive delete-on-terminal, a deterministic retirement-tombstone fixture, and the
real built Aegis hook public API. Machine-owned exact lifecycle outcomes judge success; no LLM does.
The 16 frozen scenarios, metrics, thresholds, holdout discipline, ownership boundary and exact
baseline/post-fix commands are in Spec 53. The holdout seed is reserved and unused.

**Status:** pre-registered; no baseline result observed yet.
