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

The same frozen 18-scenario roster ran against real built Aegis in both arms:

- **Baseline:** Aegis `403727ca4bab8435cfff47865ad666ce14099cd7`, run `dsrc-mujg8jlt` — reproducible red. The fixture was fully green, while real Aegis had no lifecycle-compaction API: failure detection `0`, restored authority `1`, resolution accuracy `0`, API availability `0`, and every secondary metric `0`.
- **Post-fix:** Aegis `87e8dba462d6116619d117f1df845a6701032553`, run `dsrc-mujg9oha` — green. Failure detection `1`, restored authority `0`, resolution accuracy `1`, API availability `1`, and every secondary metric `1`.

Aegis now exposes an additive compact retirement checkpoint shape and exact tombstone-to-checkpoint CAS contract. Checkpoint digests bind the omitted permit and approval identities with operation, outcome, receipt digest, and terminal revision; verification, exact readback, late terminal classification, begin blocking, and lost/unavailable proof fail-closed behavior are all enforced.

Existing evidence checks are regression verification only, not novel evidence. Hosts still own checkpoint independence/authentication, linearizable replacement, cross-host visibility, retention, and physical GC; this deterministic adapter experiment does not certify a production database or prescribe a TTL.
