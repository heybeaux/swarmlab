# Exp72 — Interactive process input review boundary

## RT-62 / exp72 — Interactive process input is not a complete command

[Spec78](../../specs/78-process-input-boundary.md), preregistration12edf6f, frozen796b77e.
Fetched main32391a41c4d09cdad2e4aa083382b222d78976c2 reproduced two red runs
`pib-mvowbjbg-97970` / `pib-mvowbjgw-97989`: reviewCoverage0/18,
identityCoverage0/18, directBoundaryAccuracy0. All9compatibility controls and
destructive-command positive-control checks pass; independent deny, ownership
and recovery remain1. This is a new action-boundary policy, NOT empirical shell
execution or a claim that these27 fixtures exhaust terminal behavior.

Actual runtime97108ecec292dc2642c3f87692e57b2ff49c7a92, same27cases
`pib-mvowdfh8-1211`: review/identity/directBoundary/control/deny/ownership/recovery
and resolution all1, infrastructure0. No threshold tuning or holdout use.
Source/dist/package hashes, full raw JSONL and sidecars committed; companion
verifier recomputes raw checks, binds identities/timestamps/artifacts, rejects26
forgeries; CI runs fresh exact pinned package and checks observable equality.

General fix: classify OpenClaw process.write/send-keys/paste/submit as ProcessInput;
independent ask floor cannot be configured away by optimistic prediction or
severity. No fabricated rule hits, genuine deny wins. Bind action/sessionId and
raw input fields via detached digest into approvalSignature/actionKeyFor.
Do NOT map fragments to independently safe Bash commands: benign/empty text,
EOF or submit may complete existing buffered input. Read/management controls
unchanged. Host owns input validation, authenticated process/session, buffered
terminal state and exact approved execution. No terminal emulator, safe-fragment
exemption, actual approval consumption, automatic plugin rollout, calibrated
prediction or production-safety claim.

Regression-only: focused17tests pass; full local release1225tests
(628+216+22+86+217+56), historical52/52. SwarmLab core build/forcedtypecheck
and changed ESM syntax pass; verify:evidence53claims117traces1073assertions.
Candidate evidence bookkeeping initially lacked required change field; typecheck
red retained in execution log, corrected before commit. Final release rerun/checks
reported in nightly ledger. RT62 stays pending/outside landed catalogue.
Prior Aegis78 remains OPEN/CIred at unchanged core clock test; no lucky rerun,
prior branch absorption or unrelated repair. .acr unchanged; Territory skipped.

Linked PRs/CI status are recorded after observation. No merge claimed here.
Next distinct question: binding payload/session strings does not attest immutable
process-generation identity; can a recycled session handle replay approval?
This requires host authenticated generation evidence, NOT another input-fragment
variant. Queue path/argv cumulative work remains separate/unselected.

Commands: `AEGIS_REPO=/path/to/built/aegis node experiments/72-process-input-boundary/main.mjs`; `node experiments/72-process-input-boundary/verify-receipts.mjs`; `node experiments/72-process-input-boundary/test-verifier.mjs`.

### Observed exact-head PR CI / linked delivery
[Aegis80](https://github.com/heybeaux/aegis/pull/80), head7cb6ce641fae04919c5ae10f3a0903ac55cdeecd:
[releaseCI40282693478](https://github.com/heybeaux/aegis/actions/runs/40282693478) SUCCESS, CLEAN/MERGEABLE.
[SwarmLab63](https://github.com/heybeaux/swarmlab/pull/63), initial evidence head2f1f8a2:
[actual-package exp72CI40282698361](https://github.com/heybeaux/swarmlab/actions/runs/40282698361) SUCCESS;
all other registered workflow checks SUCCESS. Fresh actual source/dist/evaluation
equality and26tamper rejections observed in CI, not inferred from exit0.
Final local release after evidence bookkeeping:1226tests(628+216+22+86+217+57),
build/typecheck and historical52/52 green. Independent read-only review no blockers;
its prose mistakenly says honest-null for baseline: actual classification is
**reproducible-red**. Review does not certify approval-store consumption, terminal
state or session-generation authenticity. Current runtime PR includes no prior
held branch. Prior78/79 unchanged; current normal CI passed without rerunning.
Final docs-head checks and merge/main status must still be observed; nightly ledger
owns final status. Candidate catalogue promotion remains separate from corpus
proof; static historical52/52 is not a fresh execution of RT62.

### Final compatibility red and correction (same experiment, no threshold change)
Final independent observable-interface probe found existing `appliesTo:['process']`
critical content policy denied a paste on main but only asked on candidate97108ec.
This was a genuine policy-scope regression, missed by initial reviewer; not hidden
by corpus green or prior CI. Corrected3acbacc keeps legacy process-scoped rules
applicable to ProcessInput while preserving input-specific and unrelated scopes.
Two focused regressions added:19focusedtests; full local1228tests
(628+217+22+86+218+57), historical52/52 green. Same frozen27-case harness now
admits `pib-mvowplbp-32581` at `3acbacc4a9954992605c6136347371940ac6dac2`, all metrics unchanged green.
Former green `pib-mvowdfh8-1211` remains committed/superseded in receipts; raw reds
and frozen scenarios/oracle/child/main unchanged. Final exact-head CI must be
observed again; earlier green CI does NOT certify this corrective commit.
