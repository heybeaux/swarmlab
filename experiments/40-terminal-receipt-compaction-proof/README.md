# Experiment 40 — Terminal receipt compaction proof

**Pre-registered:** 2026-09-16T06:32:47Z, before implementation or baseline execution.  
**Spec:** [`specs/46-terminal-receipt-compaction-proof.md`](../../specs/46-terminal-receipt-compaction-proof.md)  
**Seed:** `terminal-receipt-compaction-proof-v1`

Tests a new lifecycle boundary: a verified terminal receipt-bearing record was deliberately compacted, leaving only authoritative revision truth and an optional host-authenticated terminal proof. The frozen design compares record-only behavior, a strict compact-proof fixture, and real built Aegis across seventeen scenarios. Machine-owned records, revisions, and explicit proof verification are ground truth; no LLM judges success.

Green requires recovery of both valid compacted terminal outcomes, no acceptance of invalid proofs or stale retry authority, exact expected classifications, full public API availability, preservation of unpruned behavior, and ask/consume coverage. Exact scenarios, commands, thresholds, proof envelope, holdout discipline, and ownership are frozen in Spec 46. `terminal-receipt-compaction-proof-holdout-v1` is reserved and unused.

## Results

- Baseline real Aegis `6f24d453085738df23af5f0e3c8ad3f73bfcefd2`: `tcp-mu3q8xw5` — terminal proof recovery `0`, resolution accuracy `5/17`, compaction-proof API availability `0`; strict fixture green.
- Patched real Aegis `8c2cc749d1b413ca22c552dccd23305dcd64b160`: `tcp-mu3qbgoq` — recovery/accuracy/API and every preservation/safety/coverage metric `1`; false proof acceptance and stale retry authority `0`.

Aegis now exposes an additive compact-proof store contract and resolver while the ordinary resolver also detects the capability. Proofs must be host-authenticated and exactly bind operation, permit, approval, terminal outcome, receipt digest/failure code, and current authoritative terminal revision. Missing, malformed, unverified, misbound, stale, future, or unavailable proof truth never restores retry authority.
