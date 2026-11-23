# Spec 99 — Large literal scan work (exp93)

Pre-registered 2026-11-23T07:33:21.489456+00:00, before implementation or observations. Fetched baseline
Aegis 9c06ee809849a3c60e15160388636f93ab04918d, SwarmLab f4e9ea37d0446dfaccd9628f3127ae0116e47ac9.

## Question, novelty and ownership
Can repeated literal substring scans of one large host string monopolize synchronous
evaluate outside native regex budgets? Expected shortfall: substring includes has
no input admission or interruptible deadline. This is a CPU scanning question with
one input per target and no regex jobs, not exp92 list-width/job-allocation failure,
exp67/68 native regex backtracking, or exp70 decoded variant admission. Inventory
of specs/READMEs, claims, synthesis, roadmap and recent ledgers inspected; relevant
source/tests/docs/cards inspected. Original queue24/25 built; incomplete86/90 separate.
Aegis owns bounded matching and honest uncertainty; host owns input allocation,
policy authenticity and effects. Fixed corpus is not universal latency certification.

## Frozen design, arms, oracle
Seed large-literal-scan-v1; reserve large-literal-scan-holdout-v1, unused unless
parameter tuning (none planned). Seven stress scenarios: command, path, argv,
scalar content, one content fragment, command with all-allow severity, path with
independent critical command deny. Each uses ONE flat ASCII string of134217728
code units (128MiB), all q, and64 distinct substring rules with patterns
q repeated255 then Z plus decimal rule index. No match exists. No regex or decoder.
Seven paired arms identical except string length4096. Eight controls: huge input
with disabled rules; wrong-tool rules; empty pack; ordinary exact substring hit;
ordinary miss; two fragments q and Z which must not be joined for qZ; huge path
with predictor deny; small string ending q*255+Z0 (exact sole target.0 hit).
All rules critical, tool Bash, preprocess false. Independent rule id critical,
pattern DANGER, command DANGER. Predictor pFailure .99/confidence1/source awm.

Each child heap512MB, setup/import15s, parent evaluation watchdog1500ms AFTER
fixture construction, flattening and ownership snapshot. Parent watchdog is
containment/operational acceptance, not a calibrated performance benchmark.
Only evaluation duration is measured; results/recovery/ownership occur afterward.
After evaluation child signals completion immediately, before expensive ownership
checks. Setup failure is infrastructure, post-ready timeout/crash is runtime failure.
Record full returned evaluation and elapsedMs, ready/evaluated markers, exit/signal,
stderr, input length/hash, ownership/recovery, source/dist/harness hashes and run ID.
No shell effects and no LLM judge. Raw known-negative strings are ground truth.

Expected: all cases finish evaluate within1500ms with no fabricated hits. Negative
large active cases may return allow if fully scanned, OR ask with explicit substring
budget/admission diagnostic if coverage incomplete. All-allow cannot waive unknown;
independent/predictor deny must remain deny. Paired/inactive/ordinary cases exact
known action/hits, no substring diagnostic. Ordinary exact hit target.0; tail hit
only target.0; independent hit critical. Ownership unchanged/unfrozen and fresh
safe/deny recovery required. Primary stressAccuracy=1, runtimeFailureRate=0;
secondary pairedControlAccuracy=1, controlAccuracy=1, scenarioAccuracy=1,
infrastructureFailures=0. Baseline twice; reproducible watchdogs with paired and
inactive/ordinary controls passing are attributable red. Otherwise investigate
infrastructure; all passing is honest-null and NO speculative Aegis patch.
If warranted, conservative fixed substring admission may skip whole inputs above
1048576 code units, independently ask, retain other-string/rule denies, never
truncate strings into fabricated matches. This constant is not tuned/optimal.
No threshold/scenario changes after observations. Exact same design post-fix.

## Commands and evidence
Aegis worktree /Users/beauxwalton/projects/worktrees/aegis-2026-11-22-exp93:
`npx -y pnpm@10.9.0 install --frozen-lockfile && npx -y pnpm@10.9.0 --filter @heybeaux/lattice-aegis build`.
SwarmLab worktree /Users/beauxwalton/projects/worktrees/swarmlab-2026-11-22-exp93, baseline twice and unchanged after any warranted patch:
`AEGIS_REPO=/Users/beauxwalton/projects/worktrees/aegis-2026-11-22-exp93 node experiments/93-large-literal-scan/main.mjs`.
Commit this spec+README before implementation; commit frozen harness before running.
Post novel work run focused Aegis tests, full pnpm release:check with one Vitest
worker and AEGIS_REDOS_BUDGET_MS=25, npm run verify:evidence. Existing suites are
regression only. Preserve raw evidence and replay checks; pinned real-package CI.
Open SwarmLab PR and linked Aegis PR only if red warrants runtime change. No patch
for null. Merge only passing checks and clean mergeability; pending => exit pending.
No .acr edits planned, no Territory refresh. Not production/predictor evidence.
