# Experiment 51 — Source freshness action gate

**Pre-registered:** 2026-10-01T07:03:00Z before implementation or baseline execution.  
**Spec:** [`specs/57-source-freshness-action-gate.md`](../../specs/57-source-freshness-action-gate.md)  
**Seed:** `source-freshness-action-gate-v1`

Tests the unbuilt handoff between exp-50's silent source-staleness discovery and real Aegis action governance. Exp-21 assumes explicit lifecycle metadata has already arrived; this harness asks whether an action basis must be bound to a recent authenticated source observation even when no correction event exists.

Arms are a cache-label control, deterministic source-freshness fixture, and real built Aegis `evaluate()` with an empty rule pack. Exact frozen scenarios, metrics, thresholds, ownership, commands, and limitations are in Spec 57. No LLM judges success.
