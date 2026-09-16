# Experiment 40 — Terminal receipt compaction proof

**Pre-registered:** 2026-09-16T06:32:47Z, before implementation or baseline execution.  
**Spec:** [`specs/46-terminal-receipt-compaction-proof.md`](../../specs/46-terminal-receipt-compaction-proof.md)  
**Seed:** `terminal-receipt-compaction-proof-v1`

Tests a new lifecycle boundary: a verified terminal receipt-bearing record was deliberately compacted, leaving only authoritative revision truth and an optional host-authenticated terminal proof. The frozen design compares record-only behavior, a strict compact-proof fixture, and real built Aegis across seventeen scenarios. Machine-owned records, revisions, and explicit proof verification are ground truth; no LLM judges success.

Green requires recovery of both valid compacted terminal outcomes, no acceptance of invalid proofs or stale retry authority, exact expected classifications, full public API availability, preservation of unpruned behavior, and ask/consume coverage. Exact scenarios, commands, thresholds, proof envelope, holdout discipline, and ownership are frozen in Spec 46. `terminal-receipt-compaction-proof-holdout-v1` is reserved and unused.
