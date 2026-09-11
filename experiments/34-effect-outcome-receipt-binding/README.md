# Experiment 34 — Effect-outcome receipt binding

**Pre-registered:** 2026-09-11T03:34:45Z, before baseline execution.  
**Spec:** [`specs/40-effect-outcome-receipt-binding.md`](../../specs/40-effect-outcome-receipt-binding.md)  
**Seed:** `effect-outcome-receipt-binding-v1`

Tests whether an operation ID alone is sufficient authority to mark a started effect committed. RT-23/24 retained and fenced effect state, but their raw host store still accepted `commitEffect(operationId)` without binding the terminal write to the permit, approval, or verified desired-state receipt.

The frozen design has three arms (`operation-id-control`, `bound-receipt-fixture`, `aegis-wrapped`) and eight deterministic scenarios: valid receipt, duplicate exact receipt, wrong permit, wrong approval, wrong operation, unverified receipt, missing receipt digest, and unavailable terminal store. Fixture-owned completion truth provides the oracle; no LLM judges success.

## Result — RT-24 baseline red, receipt-bound Aegis green

Baseline Aegis `6c78a98` had no public completion boundary. Pinned baseline `erb-mtweqq7o` was red: false-executed rate `6/8`, misbound commits `3/8`, unverified commits `2/8`, indeterminate-store execution `1/8`, completion accuracy `2/8`, and API availability `0`. The bound-receipt fixture remained fully green.

Aegis `4107b2e` adds `completeExecutionEffect()`, `ApprovalExecutionEffectReceipt`, and a receipted terminal-store contract. It requires exact permit/approval/operation binding, a strict SHA-256 receipt digest, and `verified:true`; the store atomically persists the first receipt and distinguishes exact replay from conflict. Exact same roster reran as `erb-mtweqxk3`: every false/misbound/unverified/indeterminate-execution/legitimate-block rate `0`; accuracy, API availability, ask/consume coverage, and idempotent completion safety `1`.

Aegis validates attribution and evidence presence. The host still owns independent desired-state inspection and the truth of `verified`; a lying host can still lie.
