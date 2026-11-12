# Experiment 82 — Resume invalidation acknowledgement

See [Spec88](../../specs/88-resume-burn-ack.md) for the immutable design.

```sh
AEGIS_REPO=/absolute/path/to/built/aegis node experiments/82-resume-burn-ack/main.mjs
node experiments/82-resume-burn-ack/verify-receipts.mjs
node experiments/82-resume-burn-ack/test-verifier.mjs
```

## RT-72 / exp82 — A rejected burn is not confirmed invalidation

Spec88 pre-registration `a8d6b227d46aa4a7332b1850d0df8def161b4885`, frozen harness
`0a57408b15f0415eefbe06f1740c8c4a5ffc7978`. This new experiment tests acknowledgement semantics
at resumed invalidation, including a competing start; exp79 covered initial
finalization and exp81 explicitly excluded burn failures. Shared mechanical storage
and provenance utilities are reused; they are not the novel claim.

Baseline `63387b582721c5326780b7e936c226ff61c1597f` runs `rba-mwd8f50h-94937` and
`rba-mwd8f54q-94953` have identical raw responses: **8/16 false definitive reports**,
**16/24 cases pass**. Four false-burn cases retain a startable authorization; four
competing-start cases are already started by a separate valid caller. All independent
controls, approval consumption, fixture and state checks pass; infrastructure0.
Throws before/after burn already produce correct uncertainty.

Runtime `6cc58be3fac4276613d570009d0a202d269e8778`, unchanged harness/seeds/scenarios, run
`rba-mwd8h1rw-95860`: **0/16 false definitive reports**, **24/24 pass**.
Aegis now checks burn's boolean at resolve and begin: false returns indeterminate,
nonretryable, journal_unavailable / status_unavailable respectively. Successful burn
still reports invalid_snapshot. The fix does not persist revocation during a store
outage or prevent a clean adapter from starting retained authorization. Hosts must
quarantine and reconcile uncertainty; probes explicitly document this limitation.

14new unit tests (6fail before patch),48focused tests, full release1603tests and
58historical gates pass. Exp79all29 and exp81all30 pass as regressions only.
Red-red-green traces have source/dist manifests and content-addressed receipts;
independent rescoring and34tamper controls pass. CI builds the pinned real runtime,
requires fresh outcomes, checks raw equality and actual artifact hashes. A copied
tamper test initially assigned an existing value; fixed the test only. Frozen
experiment unchanged. PR/CI/merge outcomes live in nightly ledger.

Scope: deterministic Map storage contract, no external effect, production durability,
deployment, arbitrary dishonest adapter, or learned predictor claim. Holdout unused;
no .acr changes. Runtime PR: [91](https://github.com/heybeaux/aegis/pull/91).
Next hypothesis: claim commits then loses its acknowledgement; can recovery orphan
or unsafely reuse retained authorization? Deduplicate before pre-registration.
