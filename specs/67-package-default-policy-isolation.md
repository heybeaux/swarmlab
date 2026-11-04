# Spec 67 — Package-default policy isolation (exp61 / RT51)

Pre-registered 2026-10-12T06:35:16.354949+00:00 BEFORE implementation, experiment output or Aegis edits.
Fetched origin/main Aegis 4be84ed4aab018bee1b9a77b6012b9b97c966d1c; SwarmLab ded948b.

## Hypothesis, importance and dedup
An unrelated consumer editing exported DEFAULT_SEVERITY_TABLE, DEFAULT_PREDICTION_THRESHOLDS or DEFAULT_SAFE between invocations silently changes another consumer's implicit policy. This turns package templates into ambient authorization state and can weaken a deterministic critical floor, suppress valid predictor escalation or add an unsafe fast path. Expected shortfall: default public APIs use the same exported references, even with no explicit host override.
All existing specs/READMEs/claims/synthesis, roadmap, current Aegis docs/cards/tests and recent ledgers inspected (163-file hash manifest in nightly artifacts); unlanded Spec66/exp60 reviewed via fetched remote. Specs24–31 built/landed. Exp60 numeric contract is reserved prior work, not cherry-picked. RT48 compares mutable configuration DURING one await; RT49 detaches OUTPUT metadata; RT50 validates malformed NUMBERS. RT51 tests VALID exported template mutations BEFORE a separate call, across synchronous evaluate, strict async evaluation and safe-command's Set. Different question, temporal mechanism, metrics and ownership policy. No existing package-default noninterference experiment found.

## Frozen contract and ownership
Aegis owns stable implicit package policy: severity critical deny/high ask/medium ask/low allow; predictor deny>=.8, ask>=.4; default safe allowlist documented in safe-command.ts. Exported names/types and explicit override APIs remain compatible. Exported templates remain caller-editable (including Set.add/delete/clear); editing a template MUST NOT change implicit policy. Passing it explicitly as severityTable/predictionThresholds/allowlist intentionally applies the host policy. Do not freeze caller data, swallow explicit overrides or change hook fail-open semantics. Results preserve hit identity/order/dedup/reason and entry floor; strict allow uses authenticated current checkpoint and injected zero monotonic clock (no latency confound).
Aegis owns separating internal defaults from editable public recipes in BOTH pure and strict public boundaries; host/Lattice owns distributing and explicitly selecting overrides. This is not a sandbox against arbitrary process compromise, getter/proxy/prototype attacks, predictor calibration, malformed numeric data, in-flight mutation, action execution or receipt tamper detection. Hosts relying on undocumented ambient mutation must migrate to existing explicit options; flag that behavior change in PR, hold if owner review needed.

## Frozen design / scenarios / ground truth
Seed package-default-policy-isolation-v1, reserved holdout package-default-policy-isolation-holdout-v1 UNUSED (no fitting/tuning). Fresh built-module instance per scenario+arm isolates intentional writes. No random/sleeps/LLM judgment. Oracle is literal expected actions/booleans and stored initial caller values, never a local Aegis policy implementation.
Nine hazards, in order:
1 critical->allow, critical matched rule: default deny, explicit edited recipe allow.
2 high->allow, high rule: default ask, explicit allow.
3 medium->allow, medium rule: default ask, explicit allow.
4 low->deny, low rule: default allow, explicit deny.
5 denyAtOrAbove .8->1, valid prediction .9/confidence.8/source awm: default deny, explicit ask.
6 askAtOrAbove .4->.7, valid prediction .5: default ask, explicit allow.
7 DEFAULT_SAFE.add('dangerous-op'), command dangerous-op: default false, explicit true.
8 DEFAULT_SAFE.delete('ls'), command ls: default true, explicit false.
9 DEFAULT_SAFE.clear(), command echo safe: default true, explicit false.
Seven controls: unchanged critical deny+ls true; explicit custom severity critical allow; explicit custom thresholds ask.2/deny.6 with p.3 ->ask; explicit custom Set dangerous-op->true; empty command->false; ls; dangerous-op combinator->false; catastrophe word-boundary->false. All safe-only scenarios still test pure+strict legacy allow; action-only scenarios still test safe ls true.
Every scenario checks both evaluate and evaluateWithSourcePolicyRosterCheckpoint actions, safe-command boolean, exact strict reads2/observes1 for allow otherwise no I/O, unchanged caller options/rules/call, and editable template writes/retention. Valid roster epoch2 digest over two authenticated authorities, freshness age10/maxAge100, clock constant0; host callbacks never mutate policy. Explicit custom overrides use fresh caller-owned objects/Set.
Arms: real-aegis uses implicit defaults unless explicit-custom control; captured-host-control captures public defaults BEFORE writes and explicitly supplies copies (mitigation demonstration, NOT improvement); explicit-template-control intentionally supplies edited exported templates (customization compatibility, NOT improvement). Expected edited actions/booleans above only for explicit-template-control hazards. Controls share literal expectations across arms.

## Frozen metrics and thresholds
Primary real-aegis globalDefaultInfluenceRate ==0 (9 hazards), resolutionAccuracy ==1 (16 full check sets), unsafeImplicitAuthorizationRate ==0 (6 weakening hazards: critical/high/medium, ask-threshold, deny-threshold below required deny, safe-add).
Secondary pureActionAccuracy==1, strictActionAccuracy==1, safeClassificationAccuracy==1, strictIOAccuracy==1, callerOwnership==1, templateEditCompatibility==1, customOverrideCompatibility==1. Both controlAccuracy==1. Baseline repeat rows identical; full event replay equality; exact Aegis SHA/tracked dirty state, dist/source/full artifact and frozen harness SHA256 bound to each trace. No moving scenarios/thresholds after output. Baseline green => honest null/no patch. Red => smallest general default isolation change + focused regressions; no special case for command or scenario.

## Exact baseline/post-fix commands
From /Users/beauxwalton/projects/worktrees/swarmlab-2026-10-11-exp61:
```bash
npx --offline pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-11-exp61 install --frozen-lockfile
npx --offline pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-11-exp61 run build
npm install && npm run build && npm run typecheck
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-11-exp61 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-11-exp61/packages/aegis/dist/index.js node experiments/61-package-default-policy-isolation/dist/main.js
# Repeat identical invocation before Aegis edits; after warranted commit+build repeat same invocation.
```
Then regression ONLY: npm run verify:evidence; in Aegis npx --offline pnpm@10.15.1 run release:check (build/typecheck/all tests/evidence gate). Exp58 defaults/config and exp59 output ownership relevant unchanged regressions; exp55 source checkpoint and exp57 clock when shared effective defaults path changes. Exp15/16/17 not novel or required here. No source .acr change planned; no Territory refresh unless cards change. Linked PRs, CI+mergeability gate; pending/held PRs unlock and exit honestly.
