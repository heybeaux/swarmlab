# Experiment 83 — Claim failure invalidation

Immutable design: [Spec89](../../specs/89-claim-failure-invalidation.md).

```sh
AEGIS_REPO=/absolute/path/to/built/aegis node experiments/83-claim-failure-invalidation/main.mjs
node experiments/83-claim-failure-invalidation/verify-receipts.mjs
node experiments/83-claim-failure-invalidation/test-verifier.mjs
```



## RT-73 / exp83 — Claim transport failure must not erase invalidation

Spec89 pre-registration `4c329472a7c3cbdc06ceb8aceb23c24d01fa01ca`; frozen harness
`a5ce3b812312a88b74ea69886bd0b71ee8b9692d`. Exp79's successful-claim drift checks and unchanged
claim-before-commit control did not cover this failure composition. Exp83 injects
before/after-commit claim exceptions across observed authority/handle drift, then
probes recovery using original identity and clean authority through a new adapter.

Baseline `23e33e098ad24b04aed8291b654c953af2165073`, runs `cfi-mwenvqdn-58549` and
`cfi-mwenvqib-58565`, has identical raw responses: **16/16 unsafe recoveries**,
durable invalidation0/16, **16/32 scenarios pass**. Independent no-fault lifecycle,
real approval consumption, fixture and actual-state checks all pass; infrastructure0.
Unchanged/equivalent claim failures and failed-burn uncertainty controls already pass.

Runtime `43e4a82a71311a320e42555b9e24ef5cb3fc37de`, same frozen32cases, run
`cfi-mwenxju0-59624`: **0/16 unsafe recoveries**, invalidation16/16, **32/32pass**.
Finalization now retains observed drift when claim rejects and attempts durable burn.
Confirmed burn means definitive invalid_snapshot; false/throwing burn remains
indeterminate. The exception itself never grants execute. Before-commit valid
recovery can finalize; after-commit valid recovery resolves then uses begin CAS.

16new unit tests (12baseline failures),49focused tests pass. Exp79all29 and
exp82all24 pass as regressions only. Full release passes1619tests and58historical
gates with one worker and the unchanged25ms regex budget. Two default-concurrency
attempts failed probes in different unchanged builtin rules; isolated e2e27/27passed.
Both failed logs and serial pass remain in nightly artifacts. CI runs the unchanged
default release command; consult linked PR checks and nightly ledger for status.
SwarmLab verifier passes72claims,174traces,1628assertions. Independent raw rescoring,
complete source/dist manifests, pinned receipts and34tamper checks pass. Dedicated
CI builds the exact runtime and checks fresh raw results, not exit code alone.

Scope: deterministic storage contract, no external effect, production durability,
deployment, learned predictor or hostile-adapter claim. Failed burns still require
host quarantine; clean recovery in those arms demonstrates that limitation.
Immutable invalid inputs without drift, unseen ABA, claim returning undefined,
elapsed expiry and post-return mutation are outside this design. Holdout unused;
no .acr changes. Runtime PR: [Aegis92](https://github.com/heybeaux/aegis/pull/92).
Next hypothesis: can a competing claim that returns undefined discard observed
invalidation and leave retained authorization startable? Deduplicate before design.
