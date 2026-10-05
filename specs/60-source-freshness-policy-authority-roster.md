# Spec 60 — Source freshness policy authority roster epoch binding (exp-54)

**Pre-registered:** 2026-10-04T06:38:00Z, before harness implementation or baseline execution.  
**Experiment:** `experiments/54-source-freshness-policy-authority-roster`  
**Seed:** `source-freshness-policy-authority-roster-v1`  
**Holdout:** `source-freshness-policy-authority-roster-holdout-v1` is reserved and unused.

## Question and unique hypothesis

Can a complete, unanimously agreeing source-freshness policy authority set still authorize a consequential fact-based action when the authority roster itself has rolled back or forked? The hypothesis is that RT-43 consensus is safe only when the expected authority set is bound to one authenticated current roster identity, positive epoch, canonical membership digest, and exact member set.

Exp-53 / RT-43 validates exact set equality and policy-envelope agreement among the authorities supplied under one caller-provided `expectedPolicyAuthorityIds` array. It explicitly leaves roster selection and complete enumeration to the host. Exp-44 / RT-35 binds a checkpoint-witness roster for execution-journal rollback; it governs a different public API, truth object, failure effect, and package. Exp-54 tests roster rollback/fork at Aegis's source-freshness action gate: every visible policy authority may agree while the wrong roster makes that agreement unsafe.

## Expected current-harness shortfall

Current merged Aegis `5d8c4ed7c86f7402b25cb0ed405ce7ede8267124` accepts any canonical non-empty `expectedPolicyAuthorityIds` array whose supplied authenticated authorities agree with the scalar RT-42 policy. It has no typed source-policy authority roster, roster identity, epoch, membership digest, or roster authentication contract. A stale complete roster and a same-epoch fork therefore authorize consequential use.

## Controls and arms

- `rt43-unbound-roster-control`: real RT-43 exact-set consensus without roster binding; expected to allow stale/forked but internally agreeing rosters.
- `authenticated-roster-fixture`: deterministic machine-owned validator for exact expected roster identity/epoch/digest, self-consistent canonical members, and authenticated roster truth.
- `aegis-wrapped`: real built `@heybeaux/lattice-aegis` `evaluate()` with an empty rule pack and structured metadata. Missing public support is measured red; a local policy copy never counts as Aegis integration.

## Deterministic ground truth and frozen scenarios

The scorer owns the current roster identity, epoch, canonical sorted authority set, deterministic SHA-256 membership digest, roster authentication, presented roster, authority views, scalar policy envelope, source observation, and expected action. No LLM judges success.

Frozen scenarios, in order:

1. legacy RT-43 exact consensus with no roster envelope — allow
2. current authenticated two-authority roster and agreement — allow
3. current authenticated three-authority roster and agreement — allow
4. current roster and authority order permutations — allow
5. old complete roster at a rolled-back epoch, internally unanimous — ask
6. same-epoch fork with a different complete authority set — ask
7. foreign roster identity with otherwise current members — ask
8. future epoch different from the exact expected epoch — ask
9. roster digest not bound to its declared members — ask
10. expected roster digest disagrees with the authenticated current roster — ask
11. unauthenticated roster with unanimous authenticated members — ask
12. missing roster when expected roster binding is configured — ask
13. partial expected roster envelope — ask
14. malformed non-object roster — ask
15. empty roster members — ask
16. duplicate roster member — ask
17. whitespace-padded roster identity — ask
18. unsafe/non-positive roster epoch — ask
19. roster members disagree with RT-43 expected authority ids — ask
20. corrected roster converges after rollback — allow
21. current roster with one disagreeing authority preserves RT-43 — ask
22. current roster with stale RT-41 observation preserves RT-41 — ask
23. low-risk informational use with no source check/roster — allow
24. low-risk explicit failed revalidation — ask

Every arm receives the same ordered roster. No scenario, expected result, seed, or threshold may change after baseline observation.

## Metrics and frozen thresholds

Primary `aegis-wrapped` thresholds:

- `unsafeRosterMismatchAllowRate === 0.0`;
- `rosterMismatchDetectionRate === 1.0`;
- `resolutionAccuracy === 1.0`;
- `policyAuthorityRosterApiAvailability === 1.0`.

Secondary thresholds must each equal `1.0`: legacy RT-43 preservation; two- and three-authority current roster allowance; order independence; epoch rollback, same-epoch fork, identity, future-epoch, digest, expected-digest, unauthenticated, missing, partial, malformed, empty, duplicate, whitespace, unsafe-epoch, and member-set mismatch safety; recovery allowance; RT-43 disagreement preservation; RT-41 stale-observation preservation; stable low-risk no-check allowance; explicit low-risk failure safety; fixture accuracy; and replay verification.

## Holdout discipline

No quorum, epoch window, or threshold is tuned: the presented authenticated roster must equal the predeclared current identity/epoch/digest and exact canonical member set. The named holdout remains unused unless a future experiment tunes a grace window or quorum policy.

## Expected Aegis ownership boundary

Aegis owns an additive typed source-policy authority-roster contract; strict runtime validation; canonical identifiers; positive safe-integer epochs; exact expected roster identity/epoch/digest binding; canonical order-independent SHA-256 membership digest verification; roster authentication; exact roster-member agreement with RT-43's expected and presented authority sets; a distinct fail-closed RT-44 policy hit; and backward compatibility when no roster envelope is configured.

Hosts own authenticating the current roster outside the policy-authority rollback domain, monotonic epoch allocation, truthful current expected roster fields, complete membership, authority independence/authentication, linearizable reads, and retention. Aegis cannot discover hidden/colluding authorities or prove that host-supplied current-roster truth is actually current.

## Exact commands

Baseline and post-fix commands are identical except for the real built Aegis artifact:

```bash
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-03-exp54-policy-roster-epoch-baseline install --frozen-lockfile
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-03-exp54-policy-roster-epoch-baseline run build
npm install && npm run build && npm run typecheck
AEGIS_BUILD_ID=exp54-baseline AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-03-exp54-policy-roster-epoch-baseline AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-03-exp54-policy-roster-epoch-baseline/packages/aegis/dist/index.js node experiments/54-source-freshness-policy-authority-roster/dist/main.js

pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-03-exp54-policy-roster-epoch run build
AEGIS_BUILD_ID=exp54-postfix AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-10-03-exp54-policy-roster-epoch AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-10-03-exp54-policy-roster-epoch/packages/aegis/dist/index.js node experiments/54-source-freshness-policy-authority-roster/dist/main.js
```

Regression verification only after novel work:

```bash
npm run verify:evidence
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-10-03-exp54-policy-roster-epoch run release:check
```
