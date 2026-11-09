# Experiment79 — Journal authorization drift

Design: [Spec85](../../specs/85-journal-authorization-drift.md).

```sh
AEGIS_REPO=/absolute/path/to/aegis node experiments/79-journal-authorization-drift/main.mjs
node experiments/79-journal-authorization-drift/verify-receipts.mjs
node experiments/79-journal-authorization-drift/test-verifier.mjs
```

## RT-69 / exp79 — Rejected journal authority must stay rejected on resume

Spec85 preregistration60649da preceded implementation. The original strict-issuance
setup9fa55a2 failed unchanged controls: journal permit validation derives legacy
IDs. Diagnostic runs jad-mw9avnrp-23305 and jad-mw9avq50-23476 remain committed,
not admitted as drift evidence. Amendment3551e7b switched only issuance setup to
the real four-argument API already used by journal tests, before Aegis edits.
Scenarios, thresholds and hypothesis unchanged; no remint-safety claim.

Baseline `104113f41774a874680fc334841a6ce2a12f3012` runs `jad-mw9axhn7-30518` and
`jad-mw9axpq5-30959` have identical raw29responses. **13/13 repaired/drifting
authorizations remain resumable and startable**; durable invalidation4/17; overall
16/29cases pass. Direct revocation, unchanged, equivalent replacement, lost prepare
ack, claim recovery, burn-failure uncertainty, fixture, consumption and replay
controls pass. No infrastructure failures. Exp78 excluded journal retention;
exp32/33 did not inject authority drift during initial journal finalization.

Candidate `889660ade10cf42c16978dfc3f302d31c3e76589`, SAME amended frozen29cases,
`jad-mw9b1cmu-47983`: **0/13 unsafe resumes**, durable invalidation17/17,
**29/29pass**. Journal finalization now captures entry permit/snapshot, remembers
drift observed after prepare, claims and durably burns invalid authorization.
A fresh adapter with clean authority sees authorization_burned and cannot start.
Burn failure remains indeterminate, not a false claim of persisted invalidation.

19new regression tests (15initially red) pass; 104focused tests pass. One test
fixture correction modeled a SINGLE lost acknowledgement instead of throwing on
every replay; first focused candidate run103/104 is retained in nightly artifacts.
An extra green invocation from the Aegis directory produced a noncanonical trace
path; retained but not admitted. Exact preregistered invocation supplied green above.
Frozen red-red-green receipts include source/dist and harness hashes; verifier
recomputes scores and fresh CI requires exact raw equality with the pinned package.
Full release and evidence regression results, PR CI and merge are tracked separately.

Boundary: deterministic Map contract, no production database, external effect or
deployment proof. Host supplies authentic fresh plain data and durable atomic
storage; failed burn requires quarantine/reconciliation. No claim-after-commit
loss recovery, malicious store, transient between-observation ABA, post-return
mutation or resume/start input-drift guarantee. Holdout unused. No .acr change.
Next hypothesis: strict issuance handle compatibility across journal lifecycle;
the setup diagnostics are motivation, not a completed second nightly experiment.

Linked runtime: [Aegis88](https://github.com/heybeaux/aegis/pull/88). Local regression verification: release1554tests +58historical gates; exp78all46pass; evidence68claims162traces1511assertions. New receipt verifier36tamper rejections and fresh actual-artifact match. Remote CI/merge recorded separately in nightly ledger.
