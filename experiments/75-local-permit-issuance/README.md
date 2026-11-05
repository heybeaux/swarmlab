# Experiment75 — Local permit issuance resurrection

Pre-registered design: [Spec81](../../specs/81-local-permit-issuance.md).

## RT-65 / exp75 — Spent local permits must not be recreated

Spec81 pre-registration `dee55d3`, frozen harness `c51ab2d`, precede observations.
New question: create AFTER destructive finalization, including restart, not
finalizer replay or outstanding duplicate creation. Real main Aegis
`9841b2c8a2dd1e71f48b6443ffe648bd9e69943d` runs `lpi-mw38eqx1-60473` and
`lpi-mw38er4w-60491`: **12/12 unsafe reissuances**, **2/2 stale-handle executions**,
2/20 complete scenarios pass. Initial lifecycle, consumption, host controls and
finalizer replay all20/20; infrastructure0. Observable outcomes repeat after
normalizing approval timestamps; raw traces preserved. Four fresh-after cases
execute but reuse old handles, and two stale-handle cases steal the new permit;
thus all6 fresh-approval identity/behavior controls fail their full contract.

Runtime `8162da4f7842a909fa155893bcec2cf4af12af4f`, SAME frozen20cases,
`lpi-mw38hk2d-67844`: unsafe reissuance **0/12**, stale execution **0/2**,
fresh approval6/6, scenario20/20, all thresholds pass. Successful consumption
publishes a per-grant nonce; local permit IDs bind it and an exclusive persistent
issuance marker survives ready-file removal. A fresh consumption gets a new
handle. Pending/approved/failed consumption cannot reset issuance. Legacy direct
callers retain an initial issuance only.12new tests; hook266pass; full release
1469tests and58historical gates pass. Exp74 unchanged24cases green as regression
ONLY. Source .acr unchanged, Territory not refreshed.

Three22-event traces include raw decisions, filesystem observations and package
source/dist manifests. Verifier recomputes checks and metrics, verifies source
bytes and fresh pinned-package execution, and rejects31tampers. For cross-run
equality only, opaque permit/nonce bytes, temporary paths and createdAt fields
are normalized while identity relationships remain; all other observations are
compared. No thresholds, scenario order or harness files changed after baseline.

Scope: protected local directory and serialized trusted host workflow. Retain
markers; safe compaction not implemented. Pre-upgrade grants lack history and
must be drained/reapproved. No shared-store remint guarantee, concurrent
consume/reapprove, fsync/power-loss proof, adversarial file-write defense, actual
side effect or deployment claim. Reserved holdout unused, no tuning. Next
hypothesis: shared create/take adapters forget issuance after destructive take;
can a per-consumption identity and durable create-once contract prevent remint
without denying fresh approvals? Must deduplicate and preregister separately.
CI and merge status are recorded only when observed, separately from local green.

Paired runtime [Aegis84](https://github.com/heybeaux/aegis/pull/84). Candidate
head1b383b6 includes docs only beyond executable pin8162da4. SwarmLab final
evidence verification:64claims150traces1364assertions. Remote CI pending.
