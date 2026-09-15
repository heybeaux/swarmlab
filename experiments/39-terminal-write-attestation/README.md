# Experiment 39 — Terminal write attestation

**Pre-registered:** 2026-09-15T07:01:00Z, before implementation or baseline execution.  
**Spec:** [`specs/45-terminal-write-attestation.md`](../../specs/45-terminal-write-attestation.md)  
**Seed:** `terminal-write-attestation-v1`

Tests a distinct terminal boundary: `completeEffect()` / `failEffect()` returns a positive enum, but the exact submitted receipt is not durably visible. The frozen design compares a return-trusting control, deterministic readback-attestation fixture, and real built Aegis public completion/failure APIs across sixteen fixed scenarios. Retained journal state is machine-owned ground truth; no LLM judges success.

Green requires zero false-positive terminal certainty, wrong-receipt acceptance, and unverified positive results; accuracy/API availability/honest and idempotent preservation/negative-result preservation/unavailable-read safety/ask/consume coverage must all equal 1. Exact scenarios, commands, thresholds, holdout discipline, and ownership are frozen in Spec 45. `terminal-write-attestation-holdout-v1` is reserved and unused.

## Result — current Aegis red, patched Aegis green

Baseline Aegis `648cad14f7e409f52b73dc5660cd9d37f2ff3c33` trusted positive terminal store enums. Pinned run `twa-mu2biamp` produced false-positive terminal rate `1`, wrong-receipt acceptance `1`, unverified-positive rate `1`, accuracy `0.5`, and unavailable-read safety `0`; the deterministic fixture was green.

Aegis `74cde86aec956e9723332aec9aee7015493bc391` attests positive success and failure results against the exact durable retained receipt. The unchanged roster reran as `twa-mu2bkf8p`: every unsafe/error rate `0` and every accuracy/API/coverage/preservation/safety metric `1`.
