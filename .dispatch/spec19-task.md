You are the builder for Spec 19 — Delegation Decay & Trust Routing (exp-14). This is a NEW experiment, not a retest.

READ FIRST (in this order):
1. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/specs/19-delegation-decay.md — the full spec. Authoritative; follow it exactly.
2. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/docs/HANDOVER-2026-07-05.md — §2 (ground-store verification tiers) and §3 (the experiment's rationale).
3. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/experiments/12-schema-negotiation/README.md and experiments/04-consensus-under-lies/README.md — for harness conventions, seeded-sim patterns, run-ledger style, and live-exhibition rules.
4. ~/projects/engram — the reconciliation module (src/reconciliation/, merged to `staging` via PR #323). NOTE: engram's default branch is `staging`, not `main`.

WORK ORDER:
1. Scaffold /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/experiments/14-delegation-decay/ following existing experiment structure. Commit the scaffold early and commit often throughout (sessions can be recycled — committed work survives).
2. Part A — delegation decay sweep: 20 cells (depth 0–4 × branching 1–4), N=20 machine-verifiable requirements (harness assertions, no LLM judging), ≥25 seeded trials/cell, same seeds across cells, deterministic sim agents with reinterpretation/omission rates calibrated to exp-01's observed rates. Metrics per cell: requirementSurvival, intentDrift (reinterpreted vs dropped, reported separately), integrationTax, costAmplification. Live exhibition: one haiku run at (d=2,b=2) and (d=3,b=3) — exhibition, not evidence.
3. Part B — trust routing: pool of 6 workers, one planted incapable agent (harness-level handicap, invisible to root), loud vs confident-wrong sub-arms, R=30 rounds. Three arms, same seeds: (1) amnesiac, (2) in-context with realistic truncation window, (3) Engram-backed capability observations written as VersionedFacts via the REAL shipped reconciliation module from ~/projects/engram linked as a file: dep — NEVER reimplemented. Observations carry provenance (round, failed assertion) — this is the verification_tier=provenance path. Include the reset test (kill/restart root between rounds 15 and 16) and the transfer test (brand-new root, different id, fresh context, reads the store at round 30 and must avoid the incapable agent on its first-ever choice). The arm-3 transfer number is the deliverable.
4. If the capability-observation shape needs an Engram helper: local branch off `staging` in ~/projects/engram, do NOT push, do NOT touch pre-existing uncommitted changes there.
5. Writeups: experiments/14-delegation-decay/README.md with all tables + pinned run IDs (replay-verify every trace), SYNTHESIS.md entry (RT-05 style), JOURNAL.md entry. Explicit verdict on H-A, H-B1, H-B2 — each confirmed or refuted.
6. Commit everything to swarmlab `main` (local commits; do not push swarmlab unless a remote is already configured and prior specs pushed — check git log/remote first and match precedent).

HONESTY RULE: honest numbers even if red. If arm 2 (in-context) performs as well as arm 3 inside the window, say so plainly — the store's case then rests on reset + transfer. Report loud vs confident-wrong separately. Never smooth a number.

FINAL REPORT (print as your final message): files added/changed, commit SHAs, Part A decay table (20 cells) + depth-vs-survival summary, Part B arm comparison incl. reset + transfer results for both sub-arms, H-A/H-B1/H-B2 verdicts, test/replay results, honesty notes.

Begin. Execute the assigned task to completion.
