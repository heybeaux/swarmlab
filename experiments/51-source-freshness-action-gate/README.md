# Experiment 51 — Source freshness action gate

**Pre-registered:** 2026-10-01T06:42:08Z before implementation or baseline execution.  
**Spec:** [`specs/57-source-freshness-action-gate.md`](../../specs/57-source-freshness-action-gate.md)  
**Seed:** `source-freshness-action-gate-v1`

Tests the unbuilt handoff between exp-50's silent source-staleness discovery and real Aegis action governance. Exp-21 assumes explicit lifecycle metadata has already arrived; this harness asks whether an action basis must be bound to a recent authenticated source observation even when no correction event exists.

Arms are a cache-label control, deterministic source-freshness fixture, and real built Aegis `evaluate()` with an empty rule pack. Exact frozen scenarios, metrics, thresholds, ownership, commands, and limitations are in Spec 57. No LLM judges success.

## Results — current Aegis red, patched Aegis green

Baseline built Aegis `e7f2ee2`, run `sfag-mup64k29`, allowed 90% of unsafe high-risk failure cases, detected only the explicit RT-12 lifecycle-pending cases (`0.1818` overall freshness-failure detection), reached `0.4375` exact accuracy, and exposed no source-freshness policy hit. The fixture was fully green.

Patched built Aegis `c2c0368`, run `sfag-mup67v4j`, reached unsafe high-risk allow rate `0`, freshness-failure detection `1`, accuracy/API availability `1`, and every preservation/recovery/boundary metric `1` on the identical roster. Aegis evidence-gate metadata is committed separately. Host truthfulness and actual source observation remain outside Aegis.
