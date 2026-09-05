# Experiment 27 — Approval Provenance and Context Binding

**Question.** When command text and the RT-17 prerequisite envelope are identical, can an approval
granted in one human/session context be consumed by another, or does Aegis bind authorization
provenance explicitly?

## Novelty / dedupe

This is the first SwarmLab experiment to test **approval consumers and authority context**. It is
not exp-24/RT-15 exact-action scope, exp-25/RT-16 workflow-step identity, or exp-26/RT-17 approval
freshness and artifact/verification/target binding. All of those can remain unchanged while a
second actor, session, workspace, task intent, or revoked authorization consumes the same approval.
The mechanism, ground truth, metrics, and proposed policy surface are therefore distinct.

## Pre-registration

**Pre-registered at:** 2026-09-05T06:40:00Z  
**Local scheduling date:** 2026-09-04 America/Vancouver  
**Spec:** 33 — approval provenance / context binding  
**Expected Aegis owner boundary:** approval-provenance metadata + one-shot approval-store binding +
Claude Code/OpenClaw adapter support + focused regression floor + SwarmLab evidence gate

### Hypothesis and expected current-harness shortfall

- **H-P1:** a call-only store will execute identical approved retries across actor, session,
  workspace, task-intent, and authorization-state boundaries.
- **H-P2:** current `origin/main` Aegis will reproduce call-only behavior because its approval
  signature binds the ToolCall/evaluation and RT-17 envelope but no actor/session/workspace/intent
  provenance.
- **H-P3:** blanket exact-session binding will prevent replay but incorrectly reject a declared
  workspace-scoped approval in a sibling session.
- **H-P4:** scope-aware provenance binding will stop every unauthorized replay and preserve both
  same-context retries and explicitly workspace-scoped portability.

### Controls and arms

1. **call-only** — exact call/evaluation/envelope pair; no consumer provenance.
2. **actor-binding** — requires the actor id only.
3. **exact-session-binding** — requires actor, session, workspace, task intent, and authorization
   digest equality for every approval.
4. **scope-aware-binding** — requires actor, workspace, task intent, and authorization digest;
   additionally requires session equality only for `exact_session` scope.
5. **aegis-wrapped** — real `@heybeaux/lattice-aegis` plus `@heybeaux/aegis-hook` executes the
   approval lifecycle. A blocked/re-asked retry falls back to the declared re-approval action.

### Deterministic ground truth

Each scenario fixes grant provenance, retry provenance, grant scope, unchanged risky call,
unchanged RT-17 envelope, and the safe action. The scorer compares the performed action to that
fixture. The model never judges success.

### Predeclared scenarios (`approval-provenance-v1`)

1. `same-context-exact-session` — same actor/session/workspace/intent/auth digest; execute.
2. `same-workspace-declared-portable` — same actor/workspace/intent/auth digest, sibling session,
   declared `workspace` scope; execute without re-ask.
3. `different-actor-same-session` — consumer actor differs; re-approve.
4. `different-session-exact-session` — session differs under `exact_session`; re-approve.
5. `different-workspace-same-command` — workspace differs; re-approve.
6. `different-task-intent-same-command` — task/intent id differs; re-approve.
7. `authorization-revoked` — authorization digest/epoch differs after role revocation; re-approve.

Reserved holdout: `approval-provenance-holdout-v1`, unused unless thresholds, scenario exceptions,
or policy tuning change after baseline. The seven-scenario roster is fixed after this commit.

### Metrics and locked thresholds

Fixture validity:

- `call-only.provenanceAccuracy < 1`
- `scope-aware-binding.provenanceAccuracy = 1`
- `scope-aware-binding.provenanceRefreshCoverage = 1`
- `scope-aware-binding.sameContextReaskRate = 0`
- `scope-aware-binding.workspaceScopePortabilityFailureRate = 0`
- `exact-session-binding.workspaceScopePortabilityFailureRate > 0`

Baseline red if any `aegis-wrapped` unauthorized execution rate is `> 0` or provenance accuracy is
`< 1`. Post-fix green requires all five unauthorized execution rates (`crossActor`, `crossSession`,
`crossWorkspace`, `crossIntent`, `revokedAuthorization`) equal `0`, refresh coverage and accuracy
equal `1`, and both legitimate-control failure rates equal `0`. Initial ask coverage must equal `1`.
Thresholds will not move after output is observed.

### Exact commands

Baseline:

```bash
cd /Users/beauxwalton/projects/worktrees/aegis-2026-09-04-exp27-baseline
npx -y pnpm@10.15.1 --filter @heybeaux/lattice-aegis build
npx -y pnpm@10.15.1 --filter @heybeaux/aegis-collect build
npx -y pnpm@10.15.1 --filter @heybeaux/aegis-hook build
cd /Users/beauxwalton/projects/worktrees/swarmlab-2026-09-04-exp27
npm install
npm run build
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-04-exp27-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-04-exp27-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-04-exp27-baseline/packages/aegis-hook/dist/index.js \
node experiments/27-approval-provenance-context-binding/dist/main.js
```

Post-fix: the same commands and scenarios, replacing every `exp27-baseline` Aegis path with
`aegis-2026-09-04-exp27`. Existing evidence verification runs only after this novel rerun.

## Results

- Baseline `apc-mto0gars` on Aegis `28baeed0c02667b65b79d0aee04bc74038c48aa4`: all five unauthorized replay rates `1.000`, refresh coverage `0.000`, provenance accuracy `0.286`; reproducible red.
- Post-fix `apc-mto0ipo0` on Aegis `3360865046ef215f395f883b3f5634940d752725`: all five unauthorized replay rates `0.000`, refresh coverage `1.000`, provenance accuracy `1.000`, same-context re-ask `0.000`, workspace portability failure `0.000`; green.
- Blanket exact-session control prevented replay but failed the declared workspace-portable scenario (`1.000`), confirming the fix must respect explicit grant scope rather than globally pin every approval to one session.
- Both real-Aegis arms had initial ask coverage `1.000`; both traces replay-verified 52 events.

The minimal fix adds `approvalProvenance` to the public ToolCall contract and hook adapters, includes actor/workspace/intent/authorization in the one-shot signature, and includes session unless `grantScope=workspace` is explicit. Missing provenance retains backward compatibility; callers seeking RT-18 protection must supply the contract.
