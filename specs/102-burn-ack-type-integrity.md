# Spec 102 — Burn acknowledgement type integrity (exp96 / RT-86)

Pre-registered 2026-11-26T07:32:31.827556+00:00, before implementation or observations.
Baseline Aegis 1e969bc025a5b2af3a4a614481f1f7f73582ff48; SwarmLab 2a451d22f649d3f29c84d6fd63b4b90bfe690b40.

## Hypothesis, novelty, ownership
A JavaScript/JSON storage adapter can return a malformed truthy burn acknowledgement,
causing Aegis to report definitive invalidation while authorization remains startable.
Expected gap: truthiness at three burnEffect call sites. Aegis owns runtime evidence
validation; TypeScript boolean declarations cannot validate a remote JSON response.
This tests the type/semantic boundary of burn evidence, not the false/throw failures
in exp82, claim loss in exp83/84/95 or creation acknowledgement in exp76. Inventoried
191 spec/README files, claims, roadmap, synthesis, recent ledgers and relevant
source/tests/docs/cards. Original specs24/25 already built. Exactly one hypothesis.

## Frozen design
Real built evaluate -> ask -> approvePending -> consumed -> strict createOnce permit.
Tools Bash and authenticated ProcessInput; APIs finalizeExecutionPermitWithEffectJournal,
resolveExecutionEffect, beginExecutionEffect. For resume APIs first finalize validly.
Each API/tool uses nine modes: valid authority (burn never called); revoked + true
(durable burn); revoked + false (no write); revoked + string 'false' (no write);
revoked + number1 (no write); revoked + object {ok:false} (no write); revoked + empty
array (no write); revoked + null (no write); revoked + throw-after (durable burn then
throw). Total54 cases. Record raw callback value as well as typed result, full store
state/operation log, clean diagnostic begin and replay, caller ownership and approval.
A separate valid paired control per case must finalize/resolve/start once only.
Direct fixture assertions verify detached createOnce, claim once, irreversible burn
and begin CAS. Storage implements data mechanics only, never Aegis policy.

Deterministic oracle: only literal true confirms burn. Confirmed invalid result is
blocked/invalid_snapshot (finalize and begin), not_executed/invalid_snapshot (resolve),
retryable false. Every other attempted burn yields indeterminate, retryable false,
status_unavailable (finalize/begin) or journal_unavailable (resolve), even if a throw
followed a real burn. Valid resolve gives retryable not_started; valid final/begin
execute. State burned for true/throw-after; started for valid begin; authorized otherwise.
Clean diagnostic begin executes exactly once only for authorized state, else blocks
with authorization_burned or effect_started. Second begin always blocks. Diagnostic
recovery is evidence of the need for host quarantine, NOT a success requirement to
prevent recovery when storage cannot burn. No LLM or external effect.

## Metrics and holdout
Primary falseDefinitiveRate=0 over42 uncertain cases, uncertaintyAccuracy=1.
Secondary confirmedBurnAccuracy=1 (6), validAccuracy=1 (6), stateAccuracy=1,
probeAccuracy=1, pairedControlAccuracy=1, approvalAccuracy=1, fixtureAccuracy=1,
ownershipAccuracy=1, scenarioAccuracy=1, infrastructureFailures=0.
Baseline twice with identical raw observations required. Attribute red only with
controls/fixture/approval/state all1 and infrastructure0. Null => no Aegis patch.
Seed burn-ack-type-integrity-v1; holdout burn-ack-type-integrity-holdout-v1 reserved
unused unless tuning. No random or parameter selection. No threshold changes.
Malformed adapter is an intentional injected protocol fault, with passing strict
boolean and no-fault controls; no claim against conforming adapters or hostile stores
that falsely return literal true. Host owns durable atomic storage, authentic snapshots,
quarantine/reconciliation and effects. No production durability or deployment claim.

## Exact commands
Build Aegis in /Users/beauxwalton/projects/worktrees/aegis-2026-11-25-exp96:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 build`.
From /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-25-exp96, twice baseline and identically post-fix:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-25-exp96 node experiments/96-burn-ack-type-integrity/main.mjs`.
Commit this spec+README first; frozen harness second, before observations. Record
source/dist and harness hashes, exact SHA, raw JSONL traces, run IDs and metrics.
If warranted change all burn evidence checks to literal true; add focused tests.
Then focused Aegis tests, pnpm release:check and npm run verify:evidence; these are
regression evidence only. Add receipt rescoring/tamper controls and pinned-package CI.
Linked PRs, merge only green checks/clean mergeability, pending => exit pending.
No .acr changes planned; no Territory refresh unless those source cards change.
