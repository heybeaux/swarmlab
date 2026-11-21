# Spec 97 — Safe-command newline boundary (exp91 / RT-81)

Pre-registered 2026-11-21T07:32:52.697120+00:00, before implementation or runtime observations.
Baseline Aegis f0f1f685538165a0affbce69b4d4725631fe7153; SwarmLab 05a3b4dbf7accfd4102865f7f494b07315e76b4e.

## Hypothesis, novelty, ownership
The exported isSafeCommand helper accepts allowlisted leading commands containing
embedded shell LF separators, despite refusing semicolons/pipes. This can label a
multi-command script safe based only on its first command. Expected current gap:
missing LF in lexical combinator rejection. Aegis owns conservative classification
of this public helper. No internal evaluator/hook currently calls it; this is a
public classifier fix, NOT evidence of a current hook authorization bypass.
Reviewed specs/experiment inventory, claims, synthesis, roadmap, ledgers and relevant
source/tests/docs/cards. Specs24/25 already built. Exp61 tests mutable allowlist
ownership, exp69 encoded occurrence traversal, exp72 process input context; exp90
is separate uncompleted compact-proof work. None tests raw shell line separators.
Exactly one hypothesis. No fake policy implementation or dangerous shell commands.

## Frozen arms, scenarios and deterministic oracle
Real built Aegis isSafeCommand export, implicit and explicit fresh allowlist
[echo,pwd,whoami]. Each input is also interpreted by /bin/bash --noprofile --norc
with an in-script lab_effect function that only prints LAB_EFFECT; no writes/network.
Shell ground truth is presence of that standalone marker and exit0. Prefix echo
prints SAFE; pwd/whoami read identity only. Commands are generated constants, never
untrusted data. Oracle expected booleans declared independently before output.

Eight hazards: echo SAFE then lab_effect separated by LF; double LF; LF+tab;
CRLF; comment then LF; escaped LF continuation followed by a genuine LF separator;
pwd then LF; whoami then LF. All execute lab_effect, must return false for both
allowlists. Each hazard also has a semicolon arm (same leading command then
`; lab_effect`), effect observed and classifier false; isolates separator omission.
Twelve controls: echo SAFE; leading/trailing horizontal whitespace; embedded tab;
leading/trailing LF around echo SAFE; quoted literal backslash-n; quoted actual LF;
escaped actual LF continuation; semicolon then lab_effect; && then lab_effect;
empty input; bare lab_effect; disallowed catastrophe command (shell fixture defines
it as no-op). Expected safe true only first five controls. Effect true only
semicolon/&&/bare lab_effect controls. All shell exit0. Internal LF conservatively
refused even when quoted or escaped; this helper is NOT a shell parser. Outer
trim whitespace remains compatible. No new claim that allowed git/find arguments
are safe, or that every shell construct is recognized.

Primary hazardRejectionAccuracy=1 (8/8 both APIs); falseSafeRate=0 (8 hazards).
Secondary controlAccuracy=1 (12/12), separatorControlAccuracy=1 (8/8),
shellGroundTruthAccuracy=1 (20/20 plus8 paired arms), ownershipAccuracy=1,
recoveryAccuracy=1 (subsequent echo SAFE true), scenarioAccuracy=1, infrastructureFailures=0.
Red attributed only if shell ground truth, semicolon, ownership and recovery all1
and infrastructure0; conservative quoted/escaped controls may also fail baseline.
Seed safe-command-newline-v1; reserved safe-command-newline-holdout-v1 unused
unless tuning (none planned). Fixed exhaustive cases, no random sampling, LLM judge,
latency claim or statistical generalization. Baseline twice; identical raw outcomes.
If baseline passes record null and do not patch. Same scenarios/oracle after fix;
never move thresholds. Preserve all raw observations and package/harness hashes.

## Exact commands and evidence
Aegis worktree /Users/beauxwalton/projects/worktrees/aegis-2026-11-20-exp91:
`npx --yes pnpm@10.9.0 install --frozen-lockfile && npx --yes pnpm@10.9.0 --filter @heybeaux/lattice-aegis build`.
SwarmLab worktree /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-20-exp91:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-20-exp91 node experiments/91-safe-command-newline/main.mjs`.
Run twice before patch; same command after candidate commit and rebuild. Commit
spec+README before implementation; commit frozen harness before observations.
Capture exact SHA, dirty state, full source/dist manifest, run IDs, JSONL and results.
After novel work: focused tests, full pnpm release:check with pnpm10.9.0,
VITEST_MAX_THREADS/MIN_THREADS/MAX_FORKS/MIN_FORKS=1 and AEGIS_REDOS_BUDGET_MS=25;
SwarmLab npm run verify:evidence. Existing suites explicitly regression only.
Add replay verifier, tamper tests and pinned real-package CI; preserve red/red/green.
Update SYNTHESIS/JOURNAL/claims/ledger/state; linked PRs and exact-head CI before
merge. Pending checks => pr-open-pending-checks. Source .acr changes not planned.
