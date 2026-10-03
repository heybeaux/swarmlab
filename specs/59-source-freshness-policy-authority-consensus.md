# Spec 59 — Source freshness policy authority consensus (exp-53)

**Pre-registered:** 2026-10-03T06:34:20Z, before harness implementation or baseline execution.  
**Experiment:** `experiments/53-source-freshness-policy-authority-consensus`  
**Seed:** `source-freshness-policy-authority-consensus-v1`  
**Holdout:** `source-freshness-policy-authority-consensus-holdout-v1` is reserved and unused.

## Question and unique hypothesis

When each source observation is fresh and each policy view is independently authenticated, can Aegis detect that multiple expected freshness-policy authorities equivocate at the same policy revision before allowing a consequential fact-based action?

Exp-52 / RT-42 compares one presented policy envelope with one canonical expected envelope. It explicitly leaves cross-host consensus out of scope. Exp-42 and exp-49 test plural authorities for execution-journal and compact-retirement lifecycle truth, not the policy that defines whether an external fact observation is fresh enough to authorize a consequential action. Exp-53 freezes a distinct public input, decision boundary, and safety consequence: plural source-freshness policy views and unsafe action allowance.

## Expected current-harness shortfall

Current Aegis `19ab9dc5060702b6f5512bd8707853a0fe8b1340` validates only scalar RT-42 policy fields. It has no typed plural policy-authority evidence, expected authority roster, duplicate/omission validation, or cross-authority consensus check. Conflicting authority records are therefore ignored and fresh-looking consequential actions remain allowed.

## Controls and arms

- `rt42-single-policy-control`: current one-envelope policy, expected to miss plural equivocation while preserving RT-42 behavior.
- `authority-consensus-fixture`: deterministic machine-owned exact-roster and exact-envelope consensus gate.
- `aegis-wrapped`: real built `@heybeaux/lattice-aegis` `evaluate()` with an empty rule pack and exact structured metadata. Missing public support is measured red; no local Aegis policy copy counts as integration.

## Deterministic ground truth and frozen scenarios

Ground truth is machine-owned: action risk/use, authenticated observation, scalar canonical policy envelope, expected authority roster, authority identities, authentication bits, and each authority's policy identity/version/namespace/maximum age. No LLM judges success.

Frozen scenarios, in order:

1. legacy exact scalar policy with no plural configuration — allow
2. two expected authenticated authorities exactly agree — allow
3. three expected authenticated authorities exactly agree — allow
4. authority order permutation with exact agreement — allow
5. same-version policy identity equivocation — ask
6. same-version source-version namespace equivocation — ask
7. same-version maximum-age equivocation — ask
8. policy revision equivocation — ask
9. one authority agrees with a rolled-back scalar envelope while another retains current truth — ask
10. expected authority omitted — ask
11. unexpected authority injected — ask
12. duplicate authority identity — ask
13. unauthenticated authority — ask
14. missing authority set with expected roster configured — ask
15. empty authority set with expected roster configured — ask
16. malformed non-array authority set — ask
17. malformed whitespace-padded authority identity — ask
18. malformed unsafe policy revision — ask
19. corrected authorities converge after split-brain — allow
20. agreed plural policy with stale RT-41 observation — ask
21. low-risk informational use with no source check or plural policy — allow
22. low-risk explicit failed revalidation — ask

Every arm receives the same ordered roster. The reserved holdout is unused while implementing the gate.

## Metrics and frozen thresholds

Primary `aegis-wrapped` thresholds:

- `unsafeAuthorityDisagreementAllowRate === 0.0`;
- `authorityDisagreementDetectionRate === 1.0`;
- `resolutionAccuracy === 1.0`;
- `policyAuthorityConsensusApiAvailability === 1.0`.

Secondary thresholds must each equal `1.0`: legacy RT-42 preservation, two-authority agreement, three-authority agreement, order independence, identity/namespace/max-age/revision conflict detection, rollback conflict detection, omitted/unexpected/duplicate/unverified/missing/empty/malformed safety, recovery allowance, RT-41 stale-observation preservation, stable low-risk no-check allowance, fixture accuracy, and replay verification.

No threshold, scenario, expected result, roster, or seed may change after baseline observation.

## Holdout discipline

No quorum cutoff is tuned: every configured authority is required to agree and the exact expected roster must be present. The named holdout remains unused unless a future experiment introduces quorum tuning.

## Expected Aegis ownership boundary

Aegis owns an additive typed plural source-policy authority contract, strict runtime shape validation, canonical identities, safe positive revisions, independently authenticated records, exact expected-roster set equality, duplicate rejection, order independence, exact agreement with the scalar canonical policy envelope, and a distinct fail-closed policy hit before consequential use.

Hosts own authority independence and authentication, truthful and complete enumeration, choosing the expected roster, linearizable reads, and retaining authorities outside one rollback domain. Aegis cannot detect hidden or colluding authorities and does not provide distributed consensus merely by validating supplied evidence. Legacy scalar RT-42 calls remain compatible when plural consensus is not configured.

## Exact commands

Baseline and post-fix commands are identical except for the real built Aegis artifact:

```bash
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-02-exp53-policy-authority-baseline install --frozen-lockfile
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-02-exp53-policy-authority-baseline run build
npm install && npm run build && npm run typecheck
AEGIS_BUILD_ID=exp53-baseline AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-02-exp53-policy-authority-baseline AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-02-exp53-policy-authority-baseline/packages/aegis/dist/index.js node experiments/53-source-freshness-policy-authority-consensus/dist/main.js

pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-02-exp53-policy-authority run build
AEGIS_BUILD_ID=exp53-postfix AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-02-exp53-policy-authority AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-02-exp53-policy-authority/packages/aegis/dist/index.js node experiments/53-source-freshness-policy-authority-consensus/dist/main.js
```

Regression verification only after novel work:

```bash
npm run verify:evidence
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-02-exp53-policy-authority run release:check
```
