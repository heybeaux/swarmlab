# Spec69 — Rule-overlay coverage consent (exp63 / RT53)

Pre-registered 2026-10-14T06:34:23.361583+00:00 BEFORE implementation, any experiment observation or Aegis edit.
Fetched Aegis main `4be84ed4aab018bee1b9a77b6012b9b97c966d1c`, SwarmLab `ded948b57f04338965ddb5bdd6deda6c2e3917fa`.

## Hypothesis / novelty
An overlay can keep severity/enabled unchanged yet silently remove a protected tool-call set by changing pattern, flags, kind, target or appliesTo. Real mergeLayers only checks disabling/severity; its strictness promise does not cover classifier coverage. This tests AUTHORITY to replace a rule at cascade construction, not RT48 in-flight drift, RT52 declared/cache consistency, RT51 defaults, RT50 numeric validity, or exp22 repository merge races. Inventory of all specs/README/claims/synthesis, docs/cards and unmerged exp60–62 inspected; specs24/25 and roadmap experiments already built. No earlier mergeLayers coverage consent experiment. Prior unmerged PRs remain separate.

## Frozen contract / behavior boundaries
Keep public mergeLayers(Rule[][]):MergeResult and insertion order, loadPack and evaluate interfaces. New IDs add; no delete semantics. Disabled overlays/severity downgrade continue requiring explicit allowDowngrade:true ON THIS OVERLAY (not inherited). Additionally, for an enabled effective base:
- opaque match definition changes (kind/pattern/target/effective flags) require explicit consent, since JS-regex language inclusion is not reliably decidable here;
- semantically identical allowed regex flags in a different order and absent vs empty are equivalent;
- appliesTo may freely retain/expand the exact case-sensitive tool set, or replace it with '*'; losing a tool or replacing '*' with a finite set needs consent;
- unchanged match, descriptive edits, severity escalation and enabling a disabled rule remain allowed; disabled base has no matcher coverage to protect (existing severity/disable checks still apply).
Reject unconsented overlay wholesale with existing warning shape and keep effective preceding base, not necessarily builtin. Consent is not durable authorization inherited by later layers. Inputs are valid typed plain-data Rule objects; no partial-rule typing migration, getters/proxies, post-merge alias protection, invalid regex or sandbox execution claim. Aegis owns conservative consent checks; host owns overlay provenance, deliberate allowDowngrade review, valid rule packs and safe execution.

## Frozen scenarios / deterministic ground truth
Seed `overlay-coverage-consent-v1`, holdout `overlay-coverage-consent-holdout-v1` reserved UNUSED (no tuning). No LLM or sleeps. Commands are strings, never executed. Real built Aegis public mergeLayers -> loadPack -> evaluate. Hardcoded expected merge result/warning/action for each scenario; pre-layer base is independently evaluated to confirm protected call and fixture, same stimuli in all runs.
10 coverage hazards, fixed order: regex-pattern-narrow, substring-pattern-narrow, regex-remove-i, target-command-to-content, regex-to-substring, appliesTo-drop-Bash, wildcard-to-finite, severity-escalation-plus-narrow, prior-explicit-consent-not-inherited, intermediate-base-retained. Each preceding effective base DENIES its protected command; unconsented replacement must be rejected, warn1 and still DENY.
14 controls, fixed order: unchanged, description-only, severity-tighten, tools-expand, tools-wildcard, tools-reorder-duplicate, regex-flags-reorder, empty-flags-equivalent, explicit-pattern-consent, explicit-scope-consent, new-rule-addition, disabled-base-retune, explicit-severity-consent, silent-severity-downgrade. Expected warning0 except final severity downgrade warning1; explicit retune may ALLOW and is intentional, not a hazard escape. Controls pin exact effective rule ID/description/match/appliesTo/severity and action; disabled/new baseline calls may allow.
Additional conservative control: opaque-regex-broadening-without-proof (pattern expansion that really catches more strings). Reject/warn1 despite safe observed stimulus; no general semantic-inclusion proof promised. Total25 scenarios.
Arms: real-current-cascade, pinned-effective-base control for10 hazards (simulates host declining unreviewed overlays and calls real evaluate, not an Aegis fix). Expected table is a machine-owned oracle, not an LLM judge or fake Aegis runtime.

## Metrics / thresholds (immutable)
Primary: aegisUnsafeCoverageLossRate=hazards returning allow /10 MUST equal0; aegisCoverageRejectionRate=hazards with exactly1 correct-ID warning and exact retained preceding base /10 MUST equal1; aegisResolutionAccuracy=all25 exact field/action/warning checks /25 MUST equal1.
Secondary: pinnedBaseControlAccuracy=10/10 MUST1; aegisControlAccuracy=15/15 MUST1; aegisInputOwnership=all inputs JSON unchanged MUST1; protectedBaseFixtureAccuracy=10/10 initial base deny MUST1; explicitConsentAccuracy=3/3 intentional allowances plus exact output MUST1. Baseline failure is diagnostic, not failure to run; runner exits nonzero for broken fixture/replay, prints inspectable threshold verdict for real policy.

## Exact commands (same baseline / post-fix)
From Aegis dated worktree: `pnpm install --frozen-lockfile && pnpm --filter @heybeaux/lattice-aegis build`.
From SwarmLab dated worktree: `npm install && npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-13-exp63 node experiments/63-rule-overlay-coverage-consent/dist/main.js`.
Repeat exact node invocation twice for baseline reproducibility, once post-patch (same seed/scenarios/harness hash). AEGIS_REPO points to fetched-main worktree at baseline and committed patch at post-fix; trace captures exact HEAD, dirty state, full dist/source manifests, run ID. Pre-registration commit/time recorded in nightly ledger before outputs. Then SwarmLab build/typecheck/verify:evidence; Aegis focused/full release:check. Old evidence is regression ONLY.

## Landing and uncertainty
Full replay equality, content-addressed receipts and committed traces; preserve red. Small general Aegis policy fix only after reproducible red. No speculative inclusion algorithm or special fixture names. Changing formerly accepted matcher retunes is a deliberate authority tightening; hold for migration/owner review if necessary. No improvement claim without same real-package before/after. PR CI required before merge; no CI workflow in current SwarmLab main is NOT executable green.
