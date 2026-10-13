# Exp62 — Compiled rule binding integrity

Pre-registered design: [Spec68](../../specs/68-compiled-rule-binding-integrity.md). No results yet.

 (same baseline/repeat/postfix)
From `/Users/beauxwalton/projects/worktrees/swarmlab-2026-10-12-exp62`:
```bash
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-12-exp62 install --frozen-lockfile
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-12-exp62 run build
npm install && npm run build && npm run typecheck
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-12-exp62 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-12-exp62/packages/aegis/dist/index.js node experiments/62-compiled-rule-binding-integrity/dist/main.js
# repeat unchanged once before Aegis patch; same invocation after warranted patch commit + rebuild
```
Baseline red warrants minimal boundary validation plus focused tests. Baseline null => no patch, honest-null. Post-novel regression only: npm run verify:evidence; full Aegis pnpm release:check; relevant exp58 async config and exp59 receipt regression runs, not novelty. Preserve previous main CI failure uncertainty. Linked PRs, clean mergeability/real CI pass required; pending exit safely. No .acr change planned, Territory refresh only if changed.

## RT52 — Compiled rule binding integrity (exp62 / Spec68)

Pre-registration761fafa and pre-observation arithmetic clarification f68b60f froze60 scenarios before implementation/output. Real fetched origin/main Aegis4be84ed baseline `crbi-mv6b9cr1` and repeat `crbi-mv6b9ctl` have identical scenario rows: unsafe invalid allow6/16 (0.375), diagnostic0/32, accuracy28/60, caller ownership56/60; valid controls28/28 and independent deny16/16 stayed green. Strict gate avoided most but not all invalid-cache I/O (14/16). This is declared-policy/cache divergence AT invocation, unlike RT48 configuration changes DURING awaits.

Aegis runtime `bdaace056ac4cbce8a04fc2966702e26e472dd85` validates normalized source/flags binding and allowed stateless dialect for enabled tool-applicable regex caches; skips invalid matcher and adds explicit RT52 ask floor that severity options cannot weaken. Keeps independent deny/prediction, equivalent flag order, stateless lastIndex, disabled/foreign/nonregex controls and signatures. An existing RT48 unit expectation exposed deny-to-ask regression when a critical cache changed mid-await; rather than running unbound policy or rewriting the test, RT48 now conservatively refuses indeterminate critical coverage as deny. Unchanged exp58/59 regression runs green.

SAME frozen harness `crbi-mv6bfvgw` is60/60, unsafe allow0, detection1, ownership1, no-I/O1 and all secondary metrics1. Full122-event serialized replay/complete artifact and trace receipts pinned. Producer-repair control60/60 demonstrates host mitigation, NOT Aegis improvement. Two initial comparator-diagnostic runs are preserved unadmitted; JSON serialization omitted undefined from replay while in-memory deep equality retained it. Corrected before admitted repeated baseline; no thresholds changed.

Candidate only at this documentation commit; CI/merge status recorded separately, not assumed. No calibration, in-process adversary, proxy/getter/subclass, schema-wide validation, ReDoS budget redesign or post-return atomic execution claim. Reload rules via loadPack after edits; loader still owns ReDoS admission. No .acr change, Territory skipped. Reserved holdout unused; no parameter tuning.

### Landing status (2026-10-13 UTC)

Linked [Aegis68](https://github.com/heybeaux/aegis/pull/68) / [SwarmLab51](https://github.com/heybeaux/swarmlab/pull/51), both clean/mergeable. Aegis head5aa989a GitHub executable release-check [38358788952](https://github.com/heybeaux/aegis/actions/runs/38358788952) SUCCESS; local release1153 tests (628+160+22+86+203+54) and stored50/50. SwarmLab local build/typecheck/evidence49 claims105 traces986 assertions green, but repo has NO GitHub Actions workflows. CodeRabbit success on both explicitly means review skipped, not executable CI. Independent read-only review found no blocker; numerical/prose audit corrections recorded in nightly artifacts (ownership56/60, four pure stateful cases including mixed; snapshot explains strict stateful deny). **Both PRs remain OPEN, held for missing executable SwarmLab CI coverage**; not a merged/production improvement claim. No thresholds moved. Prior RT50/51 draft holds remain independent.

### Same-experiment interface hardening (2026-10-13 UTC)

Independent observable-boundary probes found an RT52 candidate-introduced regression: invalid low cache + separate valid critical nonmatch returned deny instead of origin/main ask at first read/observe/final read/rejected I/O. Fixed by requiring invalid binding and critical severity on the SAME applicable enabled entry (commit86333e0), then preserving explicit RT52 evidence alongside RT48 on low-cache refusals (runtime `93d2e8c73cfadff03e42b97f4d160fbe850cadc1`). Old tests unchanged;15 focused regressions added. This is same RT52 hardening, not a new experiment/claim, and thresholds/seeds/roster untouched.

Fresh baseline audit crbi-mv6c1axe matches all120 admitted baseline arm rows and artifact manifest; final hardened crbi-mv6c7fo8 matches all120 original green rows and frozen harness hash, all122 events replay. Supplemental traces are non-admitted; content-addressed audit receipts committed separately. Final full release green1168 tests (628+175+22+86+54+203), stored50/50; unchanged exp55–59 inspected green. SwarmLab fresh build/typecheck/evidence49claims105traces986assertions green. Aegis68 CI must certify updated head; original CI cannot be inherited. Paired PRs68/51 stay OPEN held for absent executable SwarmLab CI. No source cards changed/Territory refresh, no other nightly novelty counted.
