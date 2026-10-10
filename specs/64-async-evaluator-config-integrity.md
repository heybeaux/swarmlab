# Spec 64 — Async evaluator configuration integrity (exp-58)

Pre-registered 2026-10-09T06:34:29.122464+00:00 BEFORE implementation, baseline output or Aegis edits.
Baseline current origin/main Aegis `1550e6ed8a660febee30ce6fe291f41b87bf1bf1`; SwarmLab `6b2d169`.

## Hypothesis and novelty

An unchanged valid ToolCall and authentic checkpoint are insufficient when caller-owned compiled rules or evaluator options change during awaited host I/O. Entry-time authorization can become stale against a now more restrictive rule/severity/prediction configuration. Worse, simultaneous input mutation and configuration weakening can erase the original critical deny floor. Aegis RT46 snapshots only ToolCall and rereads live configuration for mutation classification; it explicitly excludes rules/options. RT47 (exp57, existing unlanded candidate, NOT tonight's novelty) measures elapsed lifetime with unchanged configuration. No existing spec/experiment/evidence claim tests evaluator configuration drift. The 154-file dedup index/corpus covers all specs, experiment READMEs, claims, current tests/docs/cards plus prior exp57. Exp26 tests approval envelopes, not in-flight evaluator configuration. Unique mechanism: mutable compiled rule array/nested rule/RegExp and mutable EvaluateOptions during one awaited gate invocation. RT48 reserved for this experiment, preserving prior exp57/RT47 IDs.

## Frozen arms, oracle, scenarios and holdout

Seed `async-evaluator-config-integrity-v1`; reserved `async-evaluator-config-integrity-holdout-v1` unused (no policy fitting or thresholds tuned). No LLM judges. Three arms: real pure-evaluate `entry-only-control` before scripted callback; independent `config-integrity-fixture` using declarative scenario expected actions (not Aegis integration); `aegis-wrapped` calls real built exported evaluateWithSourcePolicyRosterCheckpoint. Dist/source/harness SHA and full artifact manifest recorded.

Every scenario starts unchanged fresh source (age10/maxAge100), valid authenticated roster epoch2, matching checkpoint. Fresh isolated call/rules/options per arm. Baseline has no elapsed clock; candidate does NOT change time behavior. Four configuration tightening modes at each of first read, observe, final read: `add-critical-rule` (array append matching critical rule), `enable-critical-rule` (nested enabled flips), `severity-tighten` (low matched rule severityTable low allow->deny), `prediction-tighten` (nested pFailure .1->.9). Expected deny in all12. Additional two hazards: at first/final read disable an entry critical rule AND change command from safe to danger; expected deny under captured original rule. This is a distinct original-floor check under joint mutation, not exp56 repeated. Fourteen hazards total.

Seven controls: unchanged allow; equivalent deep-cloned nested config allow; initial critical deny/no I/O; initial predictor ask/no I/O; first read outage ask/no observe; pure evaluate legacy unchanged allow; transient config mutate-and-restore ABA allow (scope limit). Total21 fixed ordered scenarios. No additional scenarios after output.

Oracle: listed expected action, early hazard observes0, observe hazard final reads1, original caller mutation remains unfrozen/unmodified, checkpoint epoch/digest unchanged. Fixture only establishes deterministic ground truth, never counts as integration.

## Frozen primary metrics and thresholds

Wrapped `unsafeConfigAllowRate == 0`, `configFailureDetectionRate == 1`, `resolutionAccuracy == 1`.
Secondary `currentDenyPreservation == 1`, `entryDenyPreservation == 1`, `earlyNoObserve == 1`, `postObserveNoRead == 1`, `unchangedAllowance == 1`, `equivalentAllowance == 1`, `initialFloorPreservation == 1`, `legacyPreservation == 1`, `unavailableSafety == 1`, `transientAbaScopeControl == 1`, `callerOwnership == 1`, `noCheckpointRegression == 1`, `fixtureAccuracy == 1`. Full event replay equality required. Baseline repeat scenario rows identical. Thresholds will not change.

## Ownership and general change contract

Aegis owns a private entry-time configuration snapshot (compiled RegExp allowed; plain-data options), observable equality after every awaited boundary including rejected I/O, explicit RT48 ask floor not overridable by severityTable, and strictest original/config-current deny classification. No observe after early drift, no further read after observe drift. Never freeze/modify caller config. Same public API and synchronous evaluate behavior. Comparison includes array/nested rule, regex source/flags and options/prediction/thresholds/preprocess/rule versions; RegExp lastIndex is not policy (supported compiled flags are stateless). Unsnapshotable config fails closed. Host owns authentic source/checkpoint, initial valid config, plain-data config/trusted regex, immediate exact action execution. Proxies/getters, function overrides, transient ABA, malicious adapter, hidden source changes, latency expiry and post-return races unproven. Another package's config distribution is host-owned; Aegis still guards its own awaited decision boundary.

## Exact commands (same harness/config/scenarios before/after)

From `/Users/beauxwalton/projects/worktrees/swarmlab-2026-10-08-exp58`:
```bash
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-08-exp58-baseline install --frozen-lockfile
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-08-exp58-baseline run build
npm install && npm run build && npm run typecheck
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-08-exp58-baseline AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-08-exp58-baseline/packages/aegis/dist/index.js node experiments/58-async-evaluator-config-integrity/dist/main.js
# Repeat above exact baseline invocation once; compare scenario rows.
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-08-exp58 run build
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-08-exp58 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-08-exp58/packages/aegis/dist/index.js node experiments/58-async-evaluator-config-integrity/dist/main.js
```
Post-novel regression only: npm run verify:evidence, focused Aegis tests, pnpm run release:check, exp55/56 same roster if config/input path affected. Exp57 remains prior unlanded work; no elapsed time improvement claim tonight.
