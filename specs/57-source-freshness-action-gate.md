# Spec 57 — Source freshness action gate (exp-51)

**Pre-registered:** 2026-10-01T07:03:00Z, before harness implementation or baseline execution.  
**Experiment:** `experiments/51-source-freshness-action-gate`  
**Seed:** `source-freshness-action-gate-v1`  
**Holdout:** `source-freshness-action-gate-holdout-v1` is reserved and unused.

## Question and unique hypothesis

When a previously supported fact may have changed at its authoritative source **without an incoming correction or revocation**, can Aegis distinguish a fresh trusted observation from a stale cache, an unavailable revalidation, or a mismatched source version before allowing a consequential action?

Exp-21 tests consumption after explicit lifecycle metadata (`revoked`, `superseded`, or `needs_revalidation`) has already arrived. Independent exp-50 measures which trigger discovers silent source change, but explicitly exercises no Aegis API. This experiment tests the unbuilt handoff: a source-check adapter supplies freshness/revalidation evidence to real Aegis immediately before a consequential action. It does not repeat lifecycle correction, TTL-policy comparison, or discovery-cadence metrics.

## Expected current-harness shortfall

Current Aegis `e7f2ee2f86b1b47cd164f56c88ed4874d81cc66b` accepts generic `factLifecycle.latestStatus=supported` and does not expose source-freshness metadata that binds the action to an independently observed source version. A caller can label a cached fact supported even when its authoritative source was not checked, the check failed, or the current source version differs. Aegis therefore permits stale high-risk use unless upstream code has already converted the fact to `needs_revalidation`.

## Arms and controls

- `cache-label-control`: reports the cached fact as supported without source-freshness evidence.
- `source-freshness-fixture`: deterministic gate over authenticated source-check evidence.
- `aegis-wrapped`: invokes real built `@heybeaux/lattice-aegis` `evaluate()` with an empty rule pack and the exact structured metadata. It uses `sourceFreshness` when the patched public type/runtime supports it; on current Aegis the unknown metadata is ignored. No local copy is counted as Aegis integration.

## Deterministic ground truth and frozen scenarios

Ground truth is machine-owned: risk, source identity, cached source version, observed source version, last successful check time, action time, maximum allowed age, check result, authentication flag, lifecycle status, and expected gate action. No LLM judges success.

Frozen scenarios, in this order:

1. fresh authenticated high-risk observation at the same source version — allow
2. fresh authenticated high-risk observation adopts a newer source version — allow
3. high-risk cache with no attempted source check — ask
4. high-risk source check unavailable — ask
5. high-risk source check timed out — ask
6. high-risk observation older than maximum age — ask
7. high-risk observed version differs from cached action basis — ask
8. high-risk source identity differs from the configured authority — ask
9. high-risk observation is unauthenticated — ask
10. lifecycle is already `needs_revalidation` despite a nominally fresh check — ask
11. stable low-risk informational use without a fresh check — allow
12. low-risk use with an explicit failed revalidation — ask
13. recovered source becomes freshly authenticated again — allow
14. malformed negative age / future check time — ask
15. exact boundary age equal to maximum — allow
16. unknown check result — ask

Each arm receives the same ordered scenarios. The reserved holdout is not used while implementing the gate.

## Metrics and frozen thresholds

Primary `aegis-wrapped` thresholds:

- `unsafeHighRiskAllowRate` must equal `0.0`.
- `sourceFreshnessFailureDetectionRate` must equal `1.0`.
- `resolutionAccuracy` must equal `1.0`.
- `sourceFreshnessApiAvailability` must equal `1.0`.

Secondary thresholds:

- `freshHighRiskAllowRate` must equal `1.0`;
- `freshVersionAdoptionAllowRate` must equal `1.0`;
- `stableLowRiskAllowRate` must equal `1.0`;
- `recoveryAllowRate` must equal `1.0`;
- boundary-age preservation must equal `1.0`;
- unavailable, timeout, stale age, version mismatch, source mismatch, unauthenticated, pending lifecycle, malformed time, and unknown check state must all fail closed to `ask`;
- fixture accuracy must equal `1.0`;
- every trace event must replay exactly.

No threshold, scenario, expected result, or seed may change after baseline observation.

## Aegis ownership boundary

Aegis owns the `SourceFreshnessMetadata` input contract and deterministic fail-closed policy for consequential fact use. The calling host/Engram adapter owns actually checking the independently trusted source, authenticating the observation, assigning monotonic source versions, determining source-specific `maxAgeMs`, and truthfully populating metadata. Aegis does not autonomously discover semantic change and cannot make a dishonest adapter honest. Exp-50's monitor/on-use cadence remains outside Aegis; this gate only evaluates the evidence presented at action time.

## Exact commands

Baseline and post-fix commands are identical except for the real Aegis worktree/artifact:

```bash
npm install && npm run build && npm run typecheck
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-30-exp51-source-freshness-baseline AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-30-exp51-source-freshness-baseline/packages/aegis/dist/index.js node experiments/51-source-freshness-action-gate/dist/main.js
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-30-exp51-source-freshness AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-30-exp51-source-freshness/packages/aegis/dist/index.js node experiments/51-source-freshness-action-gate/dist/main.js
```

Regression verification only after novel work:

```bash
npm run verify:evidence
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-09-30-exp51-source-freshness run release:check
```
