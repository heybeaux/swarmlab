# Experiment78 — Shared finalization input integrity

[Pre-registration Spec84](../../specs/84-finalization-input-integrity.md).

## RT-68 / exp78 — Authority cannot be repaired inside a pending finalization

Spec84 pre-registration `562701c717c6b723f3701f1eaab8dcbae607eaa7` and frozen harness
`3f73dc80d5695f46fcb03bb22d6b9ae530d40b8a` preceded observations. This tests consumed-permit
finalization across storage awaits; exp56/58 tested evaluator call/config changes,
exp31 take acknowledgement loss, exp77 creation recovery. No renamed regression.

Real baseline `2e7d4dd7d8e301713fb4169f9dc4e73d93e6bd98` runs `fii-mw7iok3w-26732` and
`fii-mw7ioxsi-27340` have identical raw46rows. **22/22 invalid-to-valid repairs
execute**, mutation blocking8/30; full scenarios24/46. All unchanged/equivalent/
ABA, revocation, outage, replay, storage and real approval-consumption controls
pass. Infrastructure0. The caller can repair revoked, unchecked, structurally
invalid, wrong-digest, revoked-link or wrong-process-generation authority while
simple take/reconciled claim is pending; old code validates only the live object.

Runtime `63cbf6fafdd97b8eb14973006da2899b73b970b3`, same frozen46cases, `fii-mw7irbzf-35786`:
**0/22 repair executions**, mutation blocking30/30, **46/46green**. Both public
finalizers capture private entry permit/snapshot data and require equality before
returning executable authority. Reconciliation also remembers drift observed after
prepare and still claims/burns the record. Equivalent data remains valid; callers
are neither mutated nor frozen. No fixture-specific policy or new approval rule.

21new regression tests:15fail/6pass baseline,21pass candidate; focused92pass.
Full release1535tests and58historical gates pass. The static catalogue is not
execution of RT68. Relevant exp77 compatibility regression28/28green. Source.acr
unchanged; Territory not refreshed. Three admitted48-event traces plus source/dist
manifests and hashes committed. Replay recomputes metrics from raw outcomes;
32tamper cases rejected; fresh local actual-package validation passed. CI executes
the pinned real package and requires fresh raw equality, not merely exit0.

Host owns authentic fresh authority and atomic durable storage. This establishes
plain-data input consistency at observed boundaries, not database durability,
external effects, post-return safety, elapsed-time expiry, malicious storage,
getters/proxies or transient ABA detection. Effect-journal entrypoints remain
outside this experiment. Holdout reserved unused; no statistical generalization.
Exact-head CI/merge status is recorded independently in the nightly ledger.

Next hypothesis: can effect-journal finalization authorize or persist an authorized
operation after caller authority changes during prepare/claim? Distinct durable
state transition and resume implications must be deduplicated before registration.

Run `AEGIS_REPO=/absolute/path/to/built/aegis node experiments/78-finalization-input-integrity/main.mjs`.
Replay: `node experiments/78-finalization-input-integrity/verify-receipts.mjs`.
Tamper tests: `node experiments/78-finalization-input-integrity/test-verifier.mjs`.
Inspect `passed` and scores; the runner preserves red and does not use exit status as success.

Linked runtime: [Aegis PR](https://github.com/heybeaux/aegis/pull/87); executable pin63cbf6f, docs-only head89d56bd.
