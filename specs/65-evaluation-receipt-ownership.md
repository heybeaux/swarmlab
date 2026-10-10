# Spec 65 — Evaluation receipt reference ownership (exp-59 / RT-49)

Pre-registered 2026-10-10T06:33:56.484488+00:00 BEFORE implementation, execution or Aegis edits.
Baseline fetched origin/main: Aegis 1550e6ed8a660febee30ce6fe291f41b87bf1bf1, SwarmLab 6b2d169.

## Hypothesis / novelty
Returned Evaluation metadata aliases caller-owned prediction and ruleVersions. Producer mutation AFTER return can rewrite a historical decision receipt; consumer mutation of a returned result can poison a later evaluation sharing the same options. This is a general ownership gap across pure and async public APIs. It does not assert that action changes retrospectively or that mutable results are tamper-proof.
All roadmap specs 24–31 already built. Exp57/RT47 (elapsed freshness) and exp58/RT48 (configuration during await) are prior unlanded candidates and reserved, not tonight's novelty. RT46 observes ToolCall mutation during await. RT49 concerns output-to-input and sibling-result aliasing AFTER return, including pure evaluate, without host I/O races. 158-file corpus includes all specs, experiment READMEs, CLAIMS, synthesis, docs/cards and unlanded specs57/58. No matching question/mechanism/metric/policy found. Existing permit/journal alias tests concern different objects and authority boundaries. Independent audit requested before run.

## Frozen design, oracle and scenarios
Seed `evaluation-receipt-ownership-v1`; reserved holdout `evaluation-receipt-ownership-holdout-v1` unused because no fitted/tuned parameters. No LLM scoring. Arms: `real-aegis` uses exported APIs in the real built package; `detached-receipt-control` executes identical real APIs but explicitly copies metadata at the consumer boundary (control, NOT Aegis improvement); `ownership-oracle` emits declarative expected checks (NOT integration).
Eight modes, in order: pure-allow (pFailure .1 => allow), pure-ask (.5 => ask), pure-deny (.9 => deny), async-allow (valid authenticated roster/checkpoint => allow), async-initial-deny (.9 => deny), async-offline (read throws => ask), async-no-roster (ordinary ToolCall => ask), async-input-change (first read appends harmless command text => RT46 ask). Same plain prediction fields and versions ['policy@1'] each time. Each mode runs producer then consumer mutation: 16 hazards.
Producer: after return, mutate opts.prediction.pFailure to .01 if initial .9/.5, else .95; confidence .2; source prior; versions[0]='policy@2', append 'overlay@2'. Serialize Evaluation before/after and check equality; independently inspect exact prediction/version values from time of return. Consumer: perform identical writes to returned prediction/versions, verify opts unchanged, re-evaluate clean ORIGINAL call with same opts and rules; expected followup actions allow/ask/deny per original pFailure. No adapter output decides truth: oracle is declarative original actions + deep equality of captured plain values.
Five controls: defaults (undefined prediction, empty independent versions/matches); frozen caller prediction/versions accepted without freezing result; matched-rule isolation (mutating output hit leaves compiled rule and next hits unchanged, mutating rule leaves prior hit unchanged); sibling results (two outputs with same opts, mutate first and keep second exact); explicit direct-result mutation remains possible (scope control, no immutability claim). Total21 fixed scenarios, no timing sleeps.

## Metrics / thresholds (frozen)
Primary real-Aegis `receiptDriftRate == 0` (8 producers), `crossCallContaminationRate == 0` (8 consumers), `resolutionAccuracy == 1` (21 scenario check sets). Secondary `provenanceIsolationRate == 1` (16 hazards), `matchesIsolation == 1`, `defaultsCompatibility == 1`, `frozenCompatibility == 1`, `siblingIsolation == 1`, `callerOwnership == 1`, `explicitMutationScopeControl == 1`, `entryActionAccuracy == 1`. Detached control and oracle accuracy1 required. Repeated baseline scenario rows identical. Full event replay equality; exact Aegis Git SHA, dirty state, dist/source hashes, artifact manifest and frozen harness hash recorded. No threshold changes after output.

## Required behavior / ownership
Aegis owns independent typed prediction/ruleVersions/matches metadata for each Evaluation result across synchronous and wrapped return paths, preserving action/reason/decidedBy/rule order/dedup and API signatures. Optional prediction undefined stays undefined; defaults are fresh each call. Frozen caller data supported. Never freeze or modify caller objects; don't freeze result or change publicly mutable TS interface. One result must not mutate caller config or siblings. Copy public contract fields, not arbitrary host objects; no getter/proxy/extension data or malformed input promise.
Host owns immediate desired-state execution, durable receipt persistence and signatures, authentic checkpoint, and not directly altering a returned receipt before persisting. This is reference isolation, NOT tamper detection, immutable receipts, approval binding, prediction validation, latency expiry or transactional execution. No ownership ambiguity: metadata is constructed in Aegis; adapters can defensively copy but cannot fix package-level aliasing.

## Exact commands
From `/Users/beauxwalton/projects/worktrees/swarmlab-2026-10-09-exp59`:
```bash
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-09-exp59 install --frozen-lockfile
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-09-exp59 run build
npm install && npm run build && npm run typecheck
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-09-exp59 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-09-exp59/packages/aegis/dist/index.js node experiments/59-evaluation-receipt-ownership/dist/main.js
# Repeat exact invocation once BEFORE source changes; compare scenario rows.
# After warranted Aegis patch commit and build, run exact same invocation again.
```
Red/null based on inspected metric values, not exit0. Red warrants minimal copy-at-construction patch and focused regression tests; null warrants no patch. Post-novel regressions: npm run verify:evidence and pnpm run release:check (includes all static checks/tests). Unchanged exp55/56 can be relevant neighbour regressions only; no nightly novelty credit. Linked PRs; CI/mergeability required before merge; pending checks exit safely. Prior exp57/58 unlanded work is preserved, not merged or silently certified tonight.
