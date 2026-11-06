# Experiment76 — Shared issuance capability negotiation

Design: [Spec82](../../specs/82-shared-issuance-capability.md).

## RT-66 / exp76 — Shared storage must negotiate issuance lifetime

Spec82 pre-registration0730d79, corrected frozen harness235afbc precede Aegis
changes. This extends the ownership boundary from local issuance to independent
hosts sharing a transactional store: capability refusal and CREATE acknowledgement
loss are new mechanisms, not a reseeded local replay. Original Specs24/25 built.

Real main `2c3a68d20b0fc7dd033eeba717567a04748fdb02`, runs `sic-mw4nuqxc-64932` and
`sic-mw4nur18-64948`: identical raw28responses; **8/8 unsafe remint
scenarios**, **2/2 stale handles execute**, fresh approval0/6, capability refusal0/6,
create failure handling0/4. Initial lifecycle, consumption, fixture controls,
replay and legacy behavior all pass; infrastructure0. Two earlier diagnostic
runs used the wrong approval event field in the oracle; retained with original
harness commit28cc942, not admitted. Only that field lookup was corrected before
repeating baseline. No metric threshold, scenario, seed or host operation changed.

Real runtime `dad07662ae7f7b88386b88844a576ef2afd7679b`, SAME corrected frozen28cases,
`sic-mw4nxfb6-71023`: **0/8 remints**, **0/2 stale executions**,
fresh6/6, refusal6/6, failure handling4/4, all28/28 green. Optional strict issuance
requires a bounded nonblank host consumed-grant identity and createOnce storage
capability. Separate handle namespace, durable atomic issuance marker contract,
no capability downgrade and literal true acknowledgement. Legacy four-argument
calls intentionally remain compatible and are NOT remint-safe.

Aegis owns capability enforcement and identity binding. Host owns authentic
per-consumption IDs and durable atomic marker+ready publication across all hosts;
take must retain markers. The deterministic shared Map fixture tests this
contract, not a production database. Strict/legacy modes must not mix for the
same grant. Lost creation acknowledgement stays blocked; lost-handle recovery
and marker compaction remain unimplemented. No actual side effects, deployment,
network partition, malicious host/storage or durability claim. Holdout unused.

Three admitted30-event traces include calls, decisions, storage operations,
records, finalizer results, source/dist manifests and hashes. Verifier recomputes
all scores, requires exact raw response equality on fresh pinned-package CI,
and rejects34tamper controls; actual local fresh artifact check passed.21new
unit tests red before/green after; focused50 pass. Regression-only: Aegis
release build/typecheck1490tests and58historical gates pass; exp74 and75 all
thresholds green. Historical58-case catalogue is not execution of RT66.
Source .acr unchanged, no Territory refresh. PR/CI/merge recorded separately.
Next new hypothesis: can creation acknowledgement loss be recovered safely by
issuance identity without handing two hosts executable authority? Deduplicate
against take reconciliation before preregistering; no such recovery claim here.

Run `AEGIS_REPO=/absolute/path/to/aegis node experiments/76-shared-issuance-capability/main.mjs`, then `node experiments/76-shared-issuance-capability/verify-receipts.mjs`. The harness saves red results and does not use exit0 as the oracle; inspect/verify the result.

Linked runtime: [Aegis85](https://github.com/heybeaux/aegis/pull/85).
Executable pin dad0766; docs-only head3efa656. Final local evidence65claims,
153traces,1406assertions verified. Remote CI and merge tracked in nightly ledger.
