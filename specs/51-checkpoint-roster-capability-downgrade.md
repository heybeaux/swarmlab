# Spec 51 - Checkpoint roster capability downgrade

**Pre-registered:** 2026-09-21T06:32:55Z, before implementation or baseline execution.  
**Experiment:** `experiments/45-checkpoint-roster-capability-downgrade`  
**Seed:** `checkpoint-roster-capability-downgrade-v1`  
**Holdout:** `checkpoint-roster-capability-downgrade-holdout-v1` is reserved and unused.

## Question

After an operation has entered the strict current-roster boundary, can Aegis preserve that evidence
requirement when roster truth is temporarily unavailable or the host retries/resumes through a
store view that strips the roster capability, or can the operation silently downgrade to the older
witness-set policy and regain retry/execute/terminal authority?

## Why this matters

Exp-44 proved that a present current-roster contract detects an obsolete visible witness set. It did
not test continuity of that contract across retry/resume boundaries. A transient outage or adapter
fallback can replace a roster-capable view with an older witness-set-only view. If the strict public
roster resolver merely delegates to feature detection, absence of the method can be mistaken for a
legacy store rather than loss of evidence that was required for this operation.

## Expected current-harness shortfall

Current Aegis `7e73b0656a0d7edb3300c149398aa5281b94a05c` exposes
`resolveWitnessRosterAnchoredExecutionEffect()`, but the explicit function delegates to the generic
resolver without first requiring the runtime roster capability. `beginExecutionEffect()` likewise
has no strict roster-specific entry point. A retry or resume that strips
`readEffectRevisionWitnessRoster()` can therefore fall back to RT-34 witness-set validation.

## Arms

- `host-capability-fallback-control`: accepts a witness-set-only adapter after roster evidence loss.
- `strict-roster-continuity-fixture`: remembers that the strict boundary was selected and refuses
  missing, unavailable, or malformed current-roster truth on every resolve and pre-effect retry.
- `aegis-wrapped`: real built Aegis loaded from `AEGIS_REPO`, `AEGIS_DIST`, and
  `AEGIS_HOOK_DIST`, using its explicit strict roster public boundary.

## Ground Truth

Ground truth is deterministic scenario data: operation id, journal state, revisions, visible
checkpoint authorities, visible witness set, current roster response/capability, boundary phase, and
exact expected `{status, reason, retryable}` triples. The scorer, not an LLM, owns correctness.

## Scenarios

The frozen seed set contains 15 scenarios:

- preservation controls: strict current authorized, strict current committed, strict current
  compacted terminal proof, and legacy generic witness-set-only authorized
- strict resolve failures: roster temporarily unavailable, roster capability absent, capability
  stripped after an unavailable read, capability stripped after a prior current read, and malformed
  roster on retry
- strict pre-effect failures: capability stripped before begin, capability stripped after a prior
  current read before begin, roster unavailable before begin, and post-CAS capability loss
- recovery controls: unavailable then same-current roster restored, and prior-current then same-current
  roster retained

The longest and shortest authority rosters, duplicate/empty capability views, resolve/begin phases,
and both first-attempt and retry/resume transitions are represented. The holdout seed is not used.

## Metrics and Thresholds

Primary pass/fail metrics for `aegis-wrapped`:

- `capabilityDowngradeDetectionRate` must equal `1.0`.
- `downgradeAuthorityRestorationRate` must equal `0.0`.
- `resolutionAccuracy` must equal `1.0`.
- `strictRosterContinuityApiAvailability` must equal `1.0`.

Secondary thresholds:

- Every current-roster, terminal, compacted-terminal, and explicitly legacy generic control must
  remain correct.
- Every unavailable, absent, stripped, and malformed strict-roster scenario must fail closed without
  retry, execute, or terminal authority.
- Recovery with the exact same verified current roster must succeed; temporary unavailability must
  not permanently brick the operation.
- Post-CAS capability loss must block execution.
- ASK and consumed approval coverage must both equal `1.0`.

## Ownership Boundary

Aegis owns strict public roster-resolve and roster-begin boundaries that refuse runtime capability
downgrade once selected. Hosts own retaining/authenticating current roster truth and selecting the
strict boundary for operations whose policy requires it. Aegis does not persist host capability
history or invent roster truth; generic legacy APIs remain compatible for explicitly legacy stores.

## Commands

Baseline:

```bash
npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-20-exp45-baseline AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-20-exp45-baseline/packages/aegis/dist/index.js AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-20-exp45-baseline/packages/aegis-hook/dist/index.js node experiments/45-checkpoint-roster-capability-downgrade/dist/main.js
```

Post-fix:

```bash
npm run build && AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-20-exp45 AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-20-exp45/packages/aegis/dist/index.js AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-20-exp45/packages/aegis-hook/dist/index.js node experiments/45-checkpoint-roster-capability-downgrade/dist/main.js
```

Regression verification after novel work:

```bash
npm run verify:evidence
pnpm --dir /Users/beauxwalton/projects/worktrees/aegis-2026-09-20-exp45 run release:check
```
