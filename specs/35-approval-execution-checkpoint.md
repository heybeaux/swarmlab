# Spec 35 — Approval Execution Checkpoint & Revocation TOCTOU (exp-29)

> New experiment. Scope: `experiments/29-approval-execution-checkpoint/`. Tests whether authority
> remains current between Aegis approval consumption and the moment a host initiates the side effect.

## Question

After Aegis validates and consumes an exact delegated approval, can an authorization epoch rotate,
a delegation link be revoked, or the effective chain change before the side effect starts while the
host still treats the earlier `allow` decision as sufficient authority?

## Novelty / dedupe

RT-17 checks approval age and prerequisite drift **at consumption**. RT-18 binds actor/session/
workspace/intent/authorization provenance **at consumption**. RT-19 validates a supplied current,
verified, attenuating delegation chain **at consumption**. None issues a single-use execution permit
or rechecks the authoritative approval/delegation snapshot at the later side-effect boundary. This
experiment moves the race boundary rather than renaming or reseeding exp-26–28. Its question,
state-transition mechanism, checkpoint/replay metrics, and policy hook are new.

## Hypotheses

- **H-R1:** a pre-execution check alone is vulnerable to check/use races: an `allow` remains usable
  after the authorization digest or delegation chain changes.
- **H-R2:** current Aegis `origin/main` has no second-phase execution checkpoint, so a host following
  its consumed decision executes post-consumption revocation/rotation scenarios.
- **H-R3:** a general single-use execution permit, finalized against a fresh authority snapshot
  immediately before initiating the effect, can reject stale authority without blocking stable root,
  direct-delegate, or bounded-delegate controls.
- **H-R4:** an execution permit itself must be atomic and one-shot; replaying a previously finalized
  allow decision must not execute twice.

## Deterministic setup and arms

Each scenario performs a real `ask → approve → retry/consume` through built Aegis. The fixture then
applies a predeclared authority transition between approval consumption and a deterministic side-
effect counter. Ground truth is the current in-memory authority state plus the scenario's fixed
`shouldExecute`; no LLM judges success.

1. `precheck-only` — executes whenever approval consumption allowed, with no second phase.
2. `snapshot-only` — reuses the consumption-time snapshot at execution (negative control).
3. `execution-checkpoint` — ideal deterministic fixture: one-shot permit plus fresh-state equality.
4. `aegis-wrapped` — real built `@heybeaux/lattice-aegis` and `@heybeaux/aegis-hook`; if Aegis
   exposes an execution-checkpoint API, the host must use it, otherwise its consumed decision is the
   only available authority.

## Predeclared scenarios and holdout

Seed/scenario family: `approval-execution-checkpoint-v1`.

1. stable non-delegated root authority (execute);
2. stable verified direct delegation (execute);
3. stable verified bounded grandchild delegation (execute);
4. authorization digest rotates after consumption (block/refresh);
5. direct delegation is revoked after consumption (block/refresh);
6. an intermediate bounded-chain link is revoked after consumption (block/refresh);
7. effective consumer changes after consumption (block/refresh);
8. chain authority expands after consumption (block/refresh);
9. execution checkpoint is missing/malformed (block/refresh);
10. a finalized execution permit is replayed after one successful effect (first execute only; replay
    blocks without blocking the original).

`approval-execution-checkpoint-holdout-v1` is reserved and unused. Scenarios, transition order, and
thresholds are frozen by the pre-registration commit before any baseline output is observed.

## Metrics and locked thresholds

Primary metrics: post-consumption authorization-rotation execution rate, direct-revocation execution
rate, intermediate-revocation execution rate, consumer-drift execution rate, authority-expansion
execution rate, missing-checkpoint execution rate, permit-replay execution rate, legitimate execution
block rate, execution-refresh coverage, and execution accuracy. Secondary metrics: initial ask
coverage and consume coverage.

Fixture validity requires the `execution-checkpoint` arm to have every unsafe/replay execution rate
`= 0`, legitimate block `= 0`, refresh coverage `= 1`, accuracy `= 1`, initial ask coverage `= 1`, and
consume coverage `= 1`; `precheck-only` and `snapshot-only` must each execute at least one unsafe
post-consumption transition.

Baseline is red if any Aegis-wrapped unsafe/replay execution rate is `> 0`, legitimate execution
block is `> 0`, refresh coverage is `< 1`, or accuracy is `< 1`. Post-fix green requires every unsafe
and replay execution rate `= 0`, legitimate block `= 0`, refresh coverage and accuracy `= 1`, initial
ask and consume coverage `= 1`. Thresholds will not move after output is observed.

## Required Aegis behavior and ownership boundary

Aegis owns a public, host-usable approval execution-permit/checkpoint contract; permit creation only
after successful approval consumption; stable binding to the approved action, provenance,
effective consumer, and delegation chain; fresh final comparison of authorization digest,
revocation/currentness, chain structure and attenuation immediately before effect initiation; atomic
one-shot finalization; fail-safe handling of missing, malformed, stale, already-used, or concurrent
permits; focused unit/integration tests; and the RT-20 evidence gate. Existing boolean
`consumeApproval`, approval IDs, and non-approval decisions must remain compatible.

The host owns supplying the truthful latest authority/delegation snapshot and invoking finalization at
the actual effect boundary. Aegis cannot claim to prevent a race in hosts that ignore the checkpoint,
nor that caller-supplied metadata is cryptographically authoritative.

## Exact commands

Baseline:

```bash
cd /Users/beauxwalton/projects/worktrees/aegis-2026-09-07-exp29-baseline
pnpm install --frozen-lockfile
pnpm --filter @heybeaux/lattice-aegis build
pnpm --filter @heybeaux/aegis-collect build
pnpm --filter @heybeaux/aegis-hook build
cd /Users/beauxwalton/projects/worktrees/swarmlab-2026-09-07-exp29
npm install
npm run build
AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-09-07-exp29-baseline \
AEGIS_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-07-exp29-baseline/packages/aegis/dist/index.js \
AEGIS_HOOK_DIST=/Users/beauxwalton/projects/worktrees/aegis-2026-09-07-exp29-baseline/packages/aegis-hook/dist/index.js \
node experiments/29-approval-execution-checkpoint/dist/main.js
```

Post-fix repeats the exact command, seed, transitions, scenarios, and thresholds with all baseline
Aegis paths replaced by `/Users/beauxwalton/projects/worktrees/aegis-2026-09-07-exp29`. Existing
evidence verification runs only after the novel post-fix rerun.
