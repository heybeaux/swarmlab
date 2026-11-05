# Spec 81 — Local permit issuance resurrection (exp75 / RT-65)

Registered 2026-11-05T07:34:52.601010+00:00, before harness implementation, baseline observations or Aegis edits.
Fetched Aegis origin/main `9841b2c8a2dd1e71f48b6443ffe648bd9e69943d`; SwarmLab `534c5ffe48bebe87005655462c16196487bca5a5`.

## Question, hypothesis and novelty
Can a trusted host accidentally mint execution authority again from the SAME consumed local approval after its permit has executed or burned? Current local creation checks only the ready file, which finalization removes. Expected shortfall: retrying creation resurrects spent authority, including after process restart. Exp29/30 tested finalizer replay and duplicate creation while outstanding, exp33 effect-start contention, exp74 target freshness. None tested create AFTER destructive finalization. Spec53 concerns retirement of strict roster policy, a separate object and policy. Inventory of all158 spec/experiment README/card files, claims, roadmap, synthesis, recent ledgers and actual Aegis source/tests/docs found no local issuance-lifetime experiment. Original Specs24/25 already built. Reusing trace plumbing is not novelty.

## Ownership and intended contract
Aegis local filesystem permit issuance must remember a consumed grant's issuance after ready-file deletion. A genuinely fresh successful approval consumption for identical bytes must authorize a NEW one-shot permit, and an OLD handle must not consume that new permit. Pending request, approval without consumption, failed consumption and process restart must not refresh issuance. Aegis owns persisted consumption-generation identity, atomic issue-once marker and finalizer compatibility. Local trusted-host API's precondition (call creation after successful consumption) remains; this is accidental retry safety, not authentication of hostile callers with filesystem access. Existing no-consumption legacy direct callers may retain one initial deterministic issuance, but cannot remint it. Host owns protected durable directory, serialized approval workflow and truthful authority snapshots. Shared-store creation is explicitly outside this local fix; its contract requires separate design. No concurrent consume/reapprove race, filesystem power-loss/fsync proof, adversarial file edits, global distributed claim, actual tool side effect or host deployment. Pre-upgrade finalized grants have no retained history: drain/reapprove before migration; do not infer prior issuance from absence.

## Frozen arms/scenarios and ground truth
Real public built Aegis evaluate/decide -> approvePending -> decide consumed -> createExecutionPermit -> finalizeExecutionPermit, using actual temporary filesystem per case. Tool variants: ProcessInput with authenticated fixed target, and Bash under explicit review rule. Both use verified one-link root delegation and authorization epoch1. Two arms: real lifecycle and no-remint host control (same initial issuance/finalization; deliberately no creation retry). Control cannot be claimed as Aegis improvement.
For each tool, ordered kinds:
1 success-remint: successful finalization then recreate with same inputs; no second execution.
2 burn-remint: revoked snapshot burns; restore valid snapshot then recreate; no execution.
3 restart-remint: successful finalization then a NEW node process recreates; no second execution.
4 pending-remint: after success request pending approval only; recreate must fail.
5 approved-remint: after success request and approve but DO NOT consume; recreate must fail.
6 failed-consume-remint: after success request pending, attempt consumption without approval; must fail and remint must fail.
7 duplicate-ready: second creation while outstanding fails; original finalizes once.
8 fresh-after-success: after success fresh request/approve/consume SAME call; new permit finalizes once.
9 fresh-after-burn: after revoked burn fresh request/approve/consume SAME call; new permit finalizes once.
10 old-handle-after-fresh: after success fresh request/approve/consume and new permit creation; old handle MUST block, new handle MUST execute once.
Twenty scenarios. Every finalizer replay after the scenario must block. No-remint control first finalize true except burn cases false; its replay false. Raw decisions, permit handles, snapshots, creation accepted/rejected, filesystem state and child response retained. Exact expected booleans/identity inequalities define truth; LLM never scores. Fresh generation IDs are opaque; compare relationships, not UUID bytes. No random scenario generation. Seed `local-permit-issuance-v1`; reserved holdout `local-permit-issuance-holdout-v1` unused unless tuning (none planned).

## Metrics and locked thresholds
Primary unsafeReissueExecutionRate over12 remint hazards =0; staleHandleExecutionRate over2 old-handle cases =0. Secondary freshApprovalAccuracy over6 fresh cases =1; duplicateReadyBlockRate over2 =1; initialLifecycleAccuracy20/20=1; approvalConsumptionRate20/20=1; finalReplayBlockRate20/20=1; hostControlAccuracy20/20=1; ownershipRate20/20=1; scenarioAccuracy20/20=1; infrastructureFailures=0. Expected create rejection is an observation, unexpected setup exception infrastructure failure. Baseline twice; red attributable only with initial lifecycle, consumption and host controls all1/infrastructure0. Repeated deterministic decisions must agree (opaque IDs may differ). Null => no speculative patch. Thresholds/scenarios fixed before results.

## Exact commands
In BOTH baseline `/Users/beauxwalton/projects/worktrees/aegis-2026-11-04-exp75-baseline` and candidate `/Users/beauxwalton/projects/worktrees/aegis-2026-11-04-exp75`:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`
In SwarmLab worktree, baseline TWICE:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-04-exp75-baseline node experiments/75-local-permit-issuance/main.mjs`
Post-fix SAME frozen harness:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-04-exp75 node experiments/75-local-permit-issuance/main.mjs`
Freeze spec commit before implementation and harness commit before baseline. Capture exact Aegis SHA/dirty state/source+dist manifests, hashes, raw JSONL and independently recomputed scores. After novel work: receipt verifier with tamper tests; `npm run verify:evidence`; Aegis focused tests and `npx --yes pnpm@10.9.0 run release:check`; exp74 as relevant regression only. Linked PRs with actual pinned-package live CI, clean mergeability and all checks required. .acr unchanged unless capabilities require card edits; refresh Territory only then.
