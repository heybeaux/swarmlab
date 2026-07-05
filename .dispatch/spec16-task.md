You are the builder for Spec 16 — Engram Versioned Facts + Anti-Entropy + the Exp-08 retest.

READ FIRST (in this order):
1. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/specs/16-engram-versioned-facts.md — the full spec. It is authoritative; follow it exactly.
2. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/TEAM.md — the team charter (prime rule: only agents write code).
3. /Users/beauxwalton/projects/engram — the real Engram repo (branch `staging` is the base). NestJS-style src/ layout; your module must be pure TS, importable from outside, per spec section A placement notes.
4. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/experiments/08-rumor-mill/ — the baseline you're retesting against (README has committed metrics: coverageOutrunsTruth=19/36, worst-cell fidelity 0.57 at m=0.1/N=120, telephoneGradient=0.113, saturationRate=1.00).
5. For the retest-harness pattern, mirror how exp-12's "sonder" mode linked the real package: see swarmlab/experiments/12-schema-negotiation/src/sondermode.ts and its README "Retest: typed contracts" section.

WORK ORDER (strict sequence — B depends on A):
A. In ~/projects/engram: create branch `versioned-facts-anti-entropy` off current staging HEAD. The repo has PRE-EXISTING UNCOMMITTED CHANGES (several modified src/** files) — never commit, revert, or touch them; commit only your own files. Implement A1 (VersionedFact + verifyFact, content-addressed digest), A2 (reconcile — the three rules, named outcomes), A3 (antiEntropySync), A4 (tests incl. the five listed cases, in the repo's existing test framework). Build + tests for your module green. Commit early and often. DO NOT push to any remote — leave the branch local.
B. In swarmlab (/Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab): add `engram` mode to experiments/08-rumor-mill per spec B1 (link the real Engram module — file: dep on built output or pnpm link; never reimplement reconcile/anti-entropy in the lab; per-hop mutation corrupts content WITHOUT recomputing digest — a retelling, not new authorship). Re-run the identical 36-cell sweep, same seeds, both modes; replay-verify; record before/after per B2 (targets: coverageOutrunsTruth 19→0; worst-cell fidelity ≥0.99; telephoneGradient ≤0.01; no coverage/saturation regression; TTS delta ≤ +1 round per cell; report healedNodes/rejectedCorrupt per cell). B3: update exp-08 README ("Retest: versioned facts + anti-entropy" section) and append to the Retest ledger in SYNTHESIS.md, mirroring the exp-12 entry. Commit to swarmlab main (runs/*.jsonl gitignored — intentional). NOTE: another builder may be committing to swarmlab main concurrently — before each swarmlab commit, check `git status`/`git log` and never stage files outside your experiment + your SYNTHESIS.md section append.

HONESTY RULE: if the retest misses the criteria, commit the real numbers and say so plainly in the README/SYNTHESIS — a red retest is a finding, not a failure. Never fake or smooth a result. Every metric must be computed from executed runs, not asserted.

FINAL REPORT (print as your final message): files touched in both repos, engram branch name + commit SHAs, swarmlab commit SHAs, run IDs, and the four B2 metric deltas plus healing accounting.

Begin. Execute the assigned task to completion.
