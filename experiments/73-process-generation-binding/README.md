# Experiment 73 — Process-generation approval binding

Design: [Spec79](../../specs/79-process-generation-binding.md).

## RT-63 / exp73 — Approval belongs to a process lifetime, not a recycled handle

[Spec79](../../specs/79-process-generation-binding.md) preregistered `70bf3dc`, frozen harness `402fe74`, before baseline observations. Actual Aegis `72f9692331486e426c41167596b5898fb90fe5b7` runs `pgb-mw1eg181-9165` and `pgb-mw1eg1cm-9181` produced identical observable rows: **12/12 hazardous retries consumed approvals**, valid-retry accuracy6/6, identity isolation0/2, retained approval recovery0/8. No infrastructure failures; deny, ownership and benign recovery controls passed.

Same frozen20cases against actual candidate `01b4360b912724e313ffbde995987b82fa1c94a8`, run `pgb-mw1ei87x-16013`: unsafe consumption **0/12**, rejection12/12, valid retries6/6, identity isolation2/2, retained approval recovery8/8; all frozen thresholds green. No scenario, seed, threshold or oracle tuning. Both arms and raw filesystem observations are retained; source/dist/package and trace digests are committed. Separate verifier recomputes scores, binds run identity and actual package files, requires fresh pinned-package execution and rejects28 tamper controls. Reused trace/provenance infrastructure is not experiment novelty; actual one-shot target lifetime consumption is.

Aegis now accepts trusted top-level OpenClaw processTarget(hostId,sessionId,generationId,verified), rejects params-only authority, checks target/session equality, detaches fields and binds valid target to approval and predictor identities. ProcessInput consumption requires valid authenticated host evidence before touching the receipt. Generationless grants cannot become usable; invalid cross-generation retries retain the original grant. Nonprocess approvals remain compatible. **Host migration required:** integrations must resolve immutable process generations outside model-controlled params; unsupported hosts stay paused even after approval. The assertion verified:true is a trusted-adapter contract, not cryptographic authentication.

This demonstrates approval-consumption isolation only. It does NOT deploy an OpenClaw plugin, attest a real process registry, execute terminal actions, fence generation changes after consumption, or extend effect-permit finalization. Host owns authenticated identity and atomic execution. Next distinct hypothesis: can process replacement after approval consumption bypass the execution-permit boundary? Preregister and test that boundary separately. No production-safety or predictor calibration claim.

Regression-only: focused30 tests including15 new, full release1243 tests (628+217+22+86+233+57), build/typecheck and historical52/52 stored evidence green. Exp72 rerun27/27 green after novel work. The52-case static catalogue is not an execution of RT63. Existing root evidence before adding RT63:53claims117traces1073assertions; final count recorded below. .acr unchanged, Territory refresh unnecessary. PR/CI/merge status must be observed independently and is tracked in nightly ledger.

## Reproduce

Build the real Aegis checkout with pnpm10.9.0 (CI version), then from SwarmLab:
```
AEGIS_REPO=/absolute/path/to/aegis node experiments/73-process-generation-binding/main.mjs
node experiments/73-process-generation-binding/verify-receipts.mjs
node experiments/73-process-generation-binding/test-verifier.mjs
```
`main.mjs` always writes the observed result including red; inspect its passed/summary fields. The verifier and pinned CI enforce thresholds. Baseline and candidate package SHAs and full receipt digests are in receipts.json. To verify a fresh candidate result, pass --run RESULT_JSON --sha EXACT_PIN --since START_MILLIS --repo AEGIS_REPO. The pin must equal the admitted candidate.

Linked delivery: [Aegis81](https://github.com/heybeaux/aegis/pull/81) / [SwarmLab64](https://github.com/heybeaux/swarmlab/pull/64). Runtime pin01b4360b912724e313ffbde995987b82fa1c94a8; local green is not remote CI. Final exact-head checks and merge status are recorded in the2026-11-03 nightly ledger.
