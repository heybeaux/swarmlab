# Experiment 30 — Distributed execution-permit store

Pre-registered design: [Spec 36](../../specs/36-distributed-execution-permit-store.md).

This bounded deterministic experiment asks whether real Aegis can enforce global one-shot execution-permit semantics when two hosts do **not** share a filesystem. It compares independent local directories, an atomic shared-store fixture control, and the real built Aegis public API. The locked seed is `distributed-execution-permit-store-v1`; the holdout seed remains unused.

Baseline and post-fix commands, seven frozen scenarios, metrics, thresholds, and ownership boundaries are in Spec 36. This README was committed before the harness was implemented or any result observed.
