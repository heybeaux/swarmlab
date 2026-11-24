# Experiment94 — Execution authority lease

## RT-84 — Authority freshness must survive shared finalization I/O (exp94)

[Spec100](../../specs/100-execution-authority-lease.md) pre-registration `3d39e61b32c320156087ba7f342b4a87e2b15229`;
frozen four-file harness `428ed31b8adf3ec59649a27d6b50eae937e77714`. This tests a missing opt-in
execution-authority lease, not a pre-existing promise that permits have TTLs.
An unchanged authenticated snapshot can age out during asynchronous take/prepare/claim.
Approval consumption expiry (exp26), field drift (exp78), and source-observation age
(exp57) do not cover this shared execution finalization boundary.

Real Aegis `9c06ee809849a3c60e15160388636f93ab04918d`, two runs `eal-mwudugof-50960, eal-mwuduv3y-51571`:
24/26 hazardous lease calls authorized, 8/34 complete scenarios correct; both store
recovery cases authorized too late. All34 paired no-lease controls, approval and fixture
checks pass, infrastructure0. Candidate `33322aa6e30e7c74a3b13da90c6409bcc56aded3`, run `eal-mwudxv3v-54112`:
**34/34 correct, unsafe execution0/26, both late recoveries blocked**, identical
seeds, scripts and thresholds. Inclusive deadlines still allow. Aegis captures an
optional trusted-host deadline/clock and retains expiry/failure across awaited
boundaries and lost prepare acknowledgements, burning consumed grants. No-option
behavior stays compatible. Raw red/red/green traces and package manifests retained.

36new tests (28fail against baseline),57focused tests and full1816test release check
plus58historical evidence gates pass locally. Existing suites are regression evidence.
30verifier tamper controls reject; replay recomputes outcomes, not just score labels.
CI and merge status are separate observations in the nightly ledger and PRs.

Boundary: host must provide authentic deadline/clock on EVERY invocation/retry and
execute immediately after allow. No persisted permit expiry, automatic approval-TTL
inheritance, local/journal API guarantee, cross-host clock validation, post-return race
closure, trained predictor or deployment claim. Holdout reserved unused, no tuning.
No .acr changes; Territory refresh unnecessary. Next unanswered hypothesis: does an
immutable invalid authority snapshot durably invalidate retained effect authorization
when a claim fails before returning its record? Deduplicate against exp79/83/84 first.

Run: `AEGIS_REPO=/absolute/path/to/built/aegis node experiments/94-execution-authority-lease/main.mjs`

Replay: `node experiments/94-execution-authority-lease/verify-receipts.mjs`

Verifier controls: `node experiments/94-execution-authority-lease/test-verifier.mjs`

Runtime PR: [Aegis101](https://github.com/heybeaux/aegis/pull/101).
