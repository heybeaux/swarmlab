# Spec 58 — Source freshness policy binding (exp-52)

**Pre-registered:** 2026-10-02T06:33:51Z, before harness implementation or baseline execution.  
**Experiment:** `experiments/52-source-freshness-policy-binding`  
**Seed:** `source-freshness-policy-binding-v1`  
**Holdout:** `source-freshness-policy-binding-holdout-v1` is reserved and unused.

## Question and unique hypothesis

When every individual source observation looks fresh and authenticated, can Aegis detect that the **policy interpreting freshness** has rolled back or split-brained across hosts—by policy identity/version, source-version namespace, or maximum-age rule—before allowing a consequential fact-based action?

Exp-51 / RT-41 validates observation source identity, observed source version, authentication, and age against a caller-supplied `maxAgeMs`. It assumes one honest current freshness policy. It does not bind the observation to a canonical policy identity/version, a source-version namespace, or the expected maximum age. Exp-52 freezes fresh-looking observations whose policy envelope is inconsistent. It does not repeat stale-age, source-id, observed-version, or check-status failures already owned by RT-41.

## Expected current-harness shortfall

Current Aegis `5f548cedeb0e254ae4dbf61a6dadc75a8cad667f` ignores policy-envelope fields unknown to `SourceFreshnessMetadata`. Therefore a rolled-back policy version, foreign policy identity, foreign version namespace, or locally widened maximum age can all return `allow` when the observation otherwise satisfies RT-41.

## Arms and controls

- `rt41-control`: the current observation-only policy, expected to miss policy split-brain while retaining fresh/stale observation behavior.
- `policy-binding-fixture`: deterministic machine-owned policy-envelope gate.
- `aegis-wrapped`: real built `@heybeaux/lattice-aegis` `evaluate()` with an empty rule pack and exact structured metadata. No local reimplementation counts as Aegis integration.

## Deterministic ground truth and frozen scenarios

Ground truth is machine-owned: risk/use, observation authentication, source and observed versions, clocks, presented and expected policy identity/version, presented and expected version namespace, and presented and expected maximum age. No LLM judges success.

Frozen scenarios, in order:

1. exact current policy, namespace, max age, and fresh observation — allow
2. same exact current envelope at age exactly equal to max — allow
3. authenticated newer source version under the same namespace and current policy — allow
4. rolled-back policy version with fresh-looking observation — ask
5. future/unknown policy version inconsistent with configured version — ask
6. foreign policy identity — ask
7. foreign source-version namespace with numerically equal versions — ask
8. widened presented max age makes an otherwise stale observation look fresh — ask
9. narrowed presented max age disagrees with canonical policy even though observation is fresh — ask
10. unauthenticated policy envelope — ask
11. missing policy binding on consequential use — ask
12. malformed policy version zero — ask
13. non-canonical whitespace-padded policy identity — ask
14. non-canonical whitespace-padded namespace — ask
15. low-risk informational use with no attempted source check and no policy binding — allow
16. low-risk use with an explicit failed revalidation — ask
17. corrected host adopts the current policy after rollback — allow
18. current policy envelope but RT-41 source observation is stale — ask

Each arm receives the same ordered roster. The reserved holdout is not used while implementing the gate.

## Metrics and frozen thresholds

Primary `aegis-wrapped` thresholds:

- `unsafePolicyMismatchAllowRate` must equal `0.0`;
- `policyMismatchDetectionRate` must equal `1.0`;
- `resolutionAccuracy` must equal `1.0`;
- `policyBindingApiAvailability` must equal `1.0`.

Secondary thresholds:

- exact-current-policy allow rate must equal `1.0`;
- exact-boundary allow rate must equal `1.0`;
- newer-source-version allow rate must equal `1.0`;
- rollback recovery allow rate must equal `1.0`;
- stable low-risk no-check allow rate must equal `1.0`;
- RT-41 stale-observation preservation must equal `1.0`;
- fixture accuracy and replay verification must equal `1.0`.

No threshold, scenario, expected result, or seed may change after baseline observation.

## Aegis ownership boundary

Aegis owns a typed policy-binding contract and deterministic fail-closed comparison for consequential source-freshness use. The host owns independently authenticating the policy envelope, supplying canonical policy and namespace identities, maintaining monotonic policy versions, selecting the canonical maximum age, and preventing dishonest omission at adapters. Aegis cannot make a dishonest host truthful, provide cross-host consensus, or establish policy storage linearizability; it can refuse evidence that does not exactly bind to the expected envelope.

The intended change is general: validate canonical bounded identities, safe positive policy versions, authenticated policy evidence, exact policy/version/namespace agreement, and exact maximum-age agreement. Existing RT-41 source observation checks and low-risk no-check behavior must remain intact.

## Exact commands

Baseline and post-fix commands are identical except for the real Aegis artifact:

```bash
npm install && npm run build && npm run typecheck
AEGIS_BUILD_ID=exp52-baseline AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-01-exp52-policy-binding-baseline AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-01-exp52-policy-binding-baseline/packages/aegis/dist/index.js node experiments/52-source-freshness-policy-binding/dist/main.js
AEGIS_BUILD_ID=exp52-postfix AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-01-exp52-policy-binding AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-01-exp52-policy-binding/packages/aegis/dist/index.js node experiments/52-source-freshness-policy-binding/dist/main.js
```

Regression verification only after novel work:

```bash
npm run verify:evidence
npx -y pnpm@10.15.1 --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-01-exp52-policy-binding run release:check
```
