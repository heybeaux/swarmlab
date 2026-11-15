# Exp85 — Prepare ownership isolation

Design: [Spec91](../../specs/91-prepare-ownership-isolation.md).

Run with `AEGIS_REPO=/absolute/path/to/built/aegis node experiments/85-prepare-ownership-isolation/main.mjs`.
Replay with `node experiments/85-prepare-ownership-isolation/verify-receipts.mjs`.


## RT-75 / exp85 — A lost rejection is not proof of operation ownership

Spec91 pre-registration `df6b7f408ab3b8c890e63bb26ec761dc6a213f06`; frozen harness
`76596463362635ab43935806884190c6dbd53484`. New cross-permit fault composition: a correctly rejected
prepare loses its response, while another permit owns the requested operation.
Prior exp83/84 tested failure and contention within the same permit; exp80 tested
strict issuance validation. Same approval/different issuance is explicitly covered.

Baseline `42234abfcb6becc04846d546f82bb0038ac6e673`, runs `poi-mwhiqyj3-35930` and
`poi-mwhiqynn-35946`, identical raw observations: **12/24 collision
isolation failures**, including **4 actual burns of unclaimed victim authorization**.
The frozen `foreignMutationRate` metric includes attempted claim/burn/begin as well
as changed state; it is not a count of successful mutations. Owner recovery20/24;
collision decision20/24; same-owner controls4/6; overall16/30. Approval and storage
fixture checks all pass; infrastructure0. Challenger recovery already24/24.

Candidate `faf961ed15cecb5bc2d838342ff44c7d9c6e9529`, same frozen design, run `poi-mwhiu7cn-37309`:
**0/24 isolation failures**, owner recovery24/24, controls6/6, **30/30 pass**.
After ambiguous prepare, Aegis now reads and validates the retained record's exact
operation/permit/approval binding before claim or burn. A coherent foreign record
returns retryable not_taken, unchanged. Unavailable/malformed readback returns
nonretryable uncertainty without mutation; missing operation returns not_taken.
Acknowledged prepare keeps its existing path. Drift seen during the new read is
retained even if repaired during claim.

18 new unit tests; initial17 produced10 baseline failures. Focused99/99 pass.
One old test expected execute even when ambiguous prepare ownership read was down;
updated to assert uncertainty, an untouched claim marker and subsequent recovery.
This compatibility change is intentional and pre-registered. Exp80/83/84 pass as
regressions only. Full release:1655tests and58/58 historical gates, serial workers
with unchanged25ms regex budget. SwarmLab evidence verification passes;31 verifier
tamper cases reject and positive control accepts. Red-red-green traces, exact
source/dist manifests and receipts are committed; CI builds pinned real Aegis and
compares fresh raw outcomes and actual artifact hashes. PR/CI status is recorded
separately in the nightly ledger.

Limits: deterministic contract fixture, not production database or external-effect
proof. Host must preserve immutable operation-to-permit bindings, authenticated
fresh reads and atomic transitions. No hostile adapter, deletion/rebinding,
post-return protection, deployment or learned predictor claim. Holdout unused.
Source .acr unchanged; no Territory refresh. Next hypothesis: can caller input drift
while beginEffect awaits its CAS grant stale authority after the storage start?
Deduplicate against exp81 before pre-registering; no claim made here.

Runtime PR: [Aegis94](https://github.com/heybeaux/aegis/pull/94).
