# Exp86 — Strict wrapper authority lifetime

[Pre-registration](../../specs/92-strict-wrapper-authority.md).


## RT-76 / exp86 — Strict wrappers must preserve the inner authority boundary

Spec92 preregistration `6c3fdd3dc02b6c8686bde6c60ee6eeb0564d23ee`; frozen harness
`ddf35271689f01de3b2a2e7d0f2c458f777bac3c`. The queued begin-CAS race was deduplicated against
exp81. This new experiment targets strict wrappers' additional policy/roster I/O,
explicitly excluded by exp81: entry repair before inner capture and revocation
AFTER inner permission. Two tools, three public APIs, 34 deterministic cases.

Baseline `d9d50b0fab3ae76cbe53457d5ef3c7a05bd359ef`, runs `swa-mwiy8ld3-80948` and
`swa-mwiy8lib-80964` have identical raw outcomes: **22/22 unsafe permissions**
(execute OR retryable), preflight invalidation0/16, postflight fence0/6,
**12/34 scenarios pass**. Positive controls12/12; independent lifecycle, actual
consumption, storage fixture and input ownership all pass; infrastructure0.
Candidate `f3de18171b11d39edf52d14a1eadc7e27c53e8e8`, run `swa-mwiycahy-81995`, unchanged design:
**0/22 unsafe permissions**, preflight16/16, postflight6/6, **34/34 pass**.

Aegis carries a private entry binding through strict preflight, generic journal
resolve/begin and strict postflight. Drift observed after marker/roster calls is
sticky even when later restored. Generic invalidation checks burn acknowledgement;
postflight refusal retains started state, without claiming external cancellation.
Equivalent nested replacements remain valid. No public signature changes.

Focused119/119 tests pass, including28 new wrapper tests. Exp81/82 pass as
regressions only. Full release/CI status is recorded in the nightly ledger and
linked PRs; no green CI claim is inferred from local output. Committed source/dist
manifests, red-red-green traces and independent receipts support replay; CI builds
the pinned real package and compares raw outcomes and artifact bytes.

Limits: deterministic contract fixture, no production database or external effects,
hostile adapter, unseen ABA inside a callback, elapsed approval lifetime, or
post-return mutation guarantee. Host owns truthful fresh authority and durable
atomic storage. Holdout unused; .acr unchanged, no Territory refresh.
Next hypothesis: can durable strict policy selection bind/readback drift publish
a marker for a different permit than the call's original handle? Deduplicate first.

Run: `AEGIS_REPO=/absolute/path/to/built/aegis node experiments/86-strict-wrapper-authority/main.mjs`.
Replay: `node experiments/86-strict-wrapper-authority/verify-receipts.mjs`.
Verifier controls: `node experiments/86-strict-wrapper-authority/test-verifier.mjs`.

Local regression completion: full release passes1683tests and58/58 historical gates;
SwarmLab verifier75claims/183traces/1724assertions, receipt verifier33tamper
rejections and positive accepted. Fresh live validation matches the pinned raw
response and complete current artifact bytes. Additional live-validation traces
are retained but are not part of the three-run red-red-green receipt.

**Merge hold:** optional hook lint exits2 with53 TypeScript test diagnostics. A
detached origin/main worktree produces the exact same53diagnostics; candidate
adds none. Required release build/typecheck/tests pass. Pipeline README forbids
merging with failing local checks, so leave PRs open; do not fix unrelated tests
or misrepresent this pre-existing failure as an exp86 regression.

Runtime PR: [Aegis95](https://github.com/heybeaux/aegis/pull/95). CI and final status remain in nightly ledger.
