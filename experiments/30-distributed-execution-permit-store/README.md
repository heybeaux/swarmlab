# Experiment 30 — Distributed execution-permit store

Pre-registered design: [Spec 36](../../specs/36-distributed-execution-permit-store.md).

This bounded deterministic experiment asks whether real Aegis can enforce global one-shot execution-permit semantics when two hosts do **not** share a filesystem. It compares independent local directories, an atomic shared-store fixture control, and the real built Aegis public API. The locked seed is `distributed-execution-permit-store-v1`; the holdout seed remains unused.

Baseline and post-fix commands, seven frozen scenarios, metrics, thresholds, and ownership boundaries are in Spec 36. This README was committed before the harness was implemented or any result observed.

## Results

Baseline real Aegis `108e49261d94d396a536e44196fd88d695d53610`, run `dps-mttq7j53`, was reproducibly red: cross-host replay, concurrent duplicate execution, invalid-burn replay, duplicate create, and store-unavailable execution rates were each `1`; distributed accuracy was `0.286`; public shared-store API availability was `0`. Ask and consume coverage were both `1`, and the shared-store fixture was green, attributing the failure to Aegis's local-only permit storage rather than a broken fixture.

Aegis candidate `1c79f8d00e1108fcf477c3a3fe734cfc788caed5` adds a host-provided async transactional store contract and shared create/finalize APIs while retaining the local API. Exact-roster rerun `dps-mttq9s83` was green: every unsafe rate `0`, legitimate block `0`, distributed accuracy/API/ask/consume coverage `1`. Both traces contain 32 events and replay-verify. Aegis cannot make a non-atomic adapter safe; the host must supply the promised atomic operations.
