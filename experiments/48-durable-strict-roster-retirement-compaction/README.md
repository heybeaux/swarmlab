# Experiment 48 - Durable strict-roster retirement compaction

**Pre-registered:** 2026-09-26T06:42:00Z before implementation or baseline output.  
**Spec:** [`specs/54-durable-strict-roster-retirement-compaction.md`](../../specs/54-durable-strict-roster-retirement-compaction.md)

This experiment tests a lifecycle seam not covered by terminal-receipt compaction or full strict-roster
retirement: whether a full retired policy tombstone may be atomically replaced by independently
authenticated compact lifecycle proof while keeping late retries non-authoritative.

Frozen arms, 18 scenarios, metrics, thresholds, seed, ownership boundary and exact commands are in
Spec 54. No LLM judges success. `aegis-wrapped` must use the built real hook public API; API absence
is a measured baseline failure, not permission to simulate Aegis policy locally.

## Results

Pre-registered; no output observed yet.
