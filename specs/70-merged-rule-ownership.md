# Spec 70 — Merged rule reference ownership (exp64)

## Pre-registration / novelty
Question: does a returned cascade own its policy values, or can caller-owned input objects and returned rules silently edit each other after mergeLayers returns? This is pre-compilation, between synchronous calls: no predictor callback, await, compiled-cache corruption, or new weakening overlay is involved. Expect aliasing for new ids and nested accepted overlays. Rules are documented JSON data; no source doc promises live linkage to caller objects. This matters because editing an editable policy recipe should require an explicit re-merge/reload, not silently change an already constructed effective cascade.

All remote specs/experiment READMEs/claims/roadmap, recent ledgers, and pending exp60–63 designs inventoried. Receipt honesty18/context recall19 and remaining original roadmap queue already implemented. Distinct from RT48 in-flight config, RT49 Evaluation metadata, RT51 implicit defaults, RT52 cache binding and RT53 matcher overlay consent. Pending PRs are not included or cherry-picked. Inventory stored in nightly artifacts.

## Required behavior / owner boundary
Preserve public mergeLayers(Rule[][]):MergeResult, identity by exact rule.id, stable first-id insertion order, duplicate id collapse, later field precedence, whole-overlay rejection/warnings, disable/severity consent rules, no deletion, optional fields, empty layers. Result rules including match/appliesTo/references own their values, separate from inputs, other results and other returned rules that share original nested data. Neither caller inputs nor result values are frozen/mutated by merge. Explicit edits to result remain supported and affect subsequent loadPack/evaluate of THAT result; explicit remerge after editing inputs creates an updated result. Input scope is valid plain-data typed Rules (including frozen inputs), not proxies/getters/functions/cycles/invalid regex, arbitrary extension schema, or a partial-overlay typing migration. loadPack may still bind compiled Rule to supplied result; this experiment does NOT promise immutability or isolation after explicit result edits or direct loader use. Host owns authenticity/intentional policy edits, reloading, execution and provenance; Aegis owns value isolation at synchronous cascade construction.

## Frozen scenarios / arms / oracle
Seed merged-rule-ownership-v1. Holdout merged-rule-ownership-holdout-v1 reserved UNUSED: no tuning. No clocks, sleeps or LLM; hazardous strings are evaluated, never executed.
Base `policy.protected`: high substring `DANGER`, target command, appliesTo Bash, enabled true, references [CWE-77]. Severity high maps deny. Alternate low severity maps allow. Hardcoded expected independent snapshots and actions are ground truth.
12 hazards:
1 new-top: mutate producer severity/enabled/id after merge; output unchanged and protected deny.
2 new-match: mutate producer pattern after merge; output unchanged and protected deny.
3 new-scope: mutate producer appliesTo after merge; output unchanged and protected deny.
4 new-references: mutate producer references; output unchanged (metadata, not unsafe action denominator).
5 overlay-top: accepted same-severity descriptive overlay then mutate its severity/enabled; output unchanged deny.
6 overlay-match: accepted same matcher overlay then mutate its nested pattern; output unchanged deny.
7 overlay-scope: accepted same-scope overlay then mutate its scope; output unchanged deny.
8 inherited-references: accepted overlay omits optional references then mutate base refs; output unchanged.
9 rejected-base: reject severity downgrade then mutate retained producer base nested pattern; output unchanged deny and warning retained.
10 consumer-to-input: edit every returned Rule field; both original layers unchanged and still mutable.
11 sibling-results: two merge calls with same input; edit first output nested pattern/scope/refs; second unchanged deny, original unchanged.
12 shared-nested-rules: distinct ids share original match/appliesTo/references; edit one returned rule; other and original unchanged, other still denies.
9 controls:
empty layers; stable insertion/dedup with id __proto__; accepted severity tightening; unconsented downgrade whole-overlay rejection; explicit downgrade consent; deeply frozen caller inputs; explicit output edit changes its subsequent evaluation; explicit remerge after source edit updates only new result; independent warning arrays across calls.
Arms real-aegis and detached-boundary-control. Both use actual public mergeLayers -> loadPack -> evaluate. Control clones each input Rule before merge and clones each result Rule independently afterwards. It is declared an isolation diagnostic, not replacement policy/Aegis improvement. Same hardcoded snapshots/action checks, no arm forces success.

## Metrics / thresholds
Primary aegisProducerDriftRate = producer hazards1–9 incorrect snapshot /9 must eq0; aegisUnsafeAllowRate = hazards1,2,3,5,6,7,9,11,12 returning allow /9 must eq0; aegisResolutionAccuracy = all21 rows pass /21 must eq1. Secondary aegisConsumerIsolation = hazards10–12 all checks pass eq1; aegisControlAccuracy = controls9 pass rate eq1; aegisCallerOwnership = all mutable callers remain writable/unfrozen eq1; detachedControlAccuracy = all21 pass eq1. Every required row check counts, not just action. Repeat baseline twice with identical row bodies/metrics (timestamps/runIDs differ); preserve red. Control failure is fixture/infrastructure, not policy red. If baseline meets ALL thresholds record honest-null, no patch. No thresholds/design changes after observation.

## Commands (same harness/seeds/scenarios before and after)
From the SwarmLab worktree:
`npm install --ignore-scripts && npm run build && npm run typecheck`
From Aegis worktree:
`pnpm install --frozen-lockfile && pnpm --filter @heybeaux/lattice-aegis build`
Baseline twice (Aegis HEAD must equal origin/main 4be84ed4aab018bee1b9a77b6012b9b97c966d1c):
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-14-exp64 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-14-exp64/packages/aegis/dist/index.js node experiments/64-merged-rule-ownership/dist/main.js`
Postfix: rebuild real Aegis from committed patch and run EXACT same command once; preregistered controls/thresholds unchanged. Record Git SHA, dirty state, full source/dist SHA256 manifests, harness/scenario hash, trace/run IDs and full replay equality. An experiment exit0 only means evidence written; inspect all thresholds separately.
Regression only AFTER novel work: focused tests, full pnpm release:check, SwarmLab build/typecheck/verify:evidence. New live gate CI should inspect actual rows/manifests and execute same harness against pinned real patched Aegis. A static measured-score catalogue is historical evidence, not executable runtime verification.
