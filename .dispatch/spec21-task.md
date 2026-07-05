You are the builder for Spec 21 — Handoff Requirement-Survival Guards (exp-16). This is a NEW experiment, not a retest. It directly extends exp-14 Part A.

READ FIRST (in this order):
1. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/specs/21-handoff-requirement-guards.md — the full spec. Authoritative; follow it exactly.
2. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/experiments/14-delegation-decay/ — the parent experiment. Read its README (Part A tables) and reuse these modules DIRECTLY (relative import, do NOT fork): src/task.ts (the config artifact, N=20 requirements — 12 unary, 8 relational, 28 keys), src/decay.ts (exp-01-calibrated noise: drop w.p. 0.08/hop, numeric perturb w.p. 0.15/hop), and the scoring/survival harness. Same 20-cell sweep (depth 0–4 × branching 1–4), SAME SEEDS, ≥25 seeded trials/cell so guarded vs un-guarded is comparable cell-for-cell. If exp-14 internals need a minimal refactor to expose a manifest hook, keep it minimal and note it.
3. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/SYNTHESIS.md — the RT-05 entry, for the exact exp-14 Part A survival curve your control arm must reproduce (1.00 → 0.33 from d0→d4; drops ~50% of deep-tree loss, seams ~21%).
4. Spec 17 / AOP typed-payload contract IF it exists in the tree — only relevant if the manifest naturally maps onto an existing stack contract (then link via `file:` dep rather than inventing a manifest format, and say which). Otherwise the manifest is new lab code.

WORK ORDER:
1. Scaffold experiments/16-handoff-guards/ following exp-14's structure. Commit the scaffold early and commit often (sessions can be recycled at ~380s — committed work survives; a "failed" status after your final turn does NOT mean the work was lost).
2. Same task, same noise model, same 20-cell sweep, SAME SEEDS as exp-14 Part A. Three guard tiers (arms), same seeds across all:
   - Tier 1 Un-guarded (control): exp-14 Part A exactly. MUST reproduce the RT-05 Part A survival curve — if it doesn't, STOP and reconcile before trusting the guarded arms.
   - Tier 2 Presence manifest: each handoff carries a manifest of requirement IDs; receiver checks its inbound brief covers every ID, flags + back-fills any missing before work. Catches DROPS. Cheap (ID set diff, no value inspection).
   - Tier 3 Value-echo manifest: manifest carries (id, expected-value-digest); receiver echoes parsed value, sender verifies. Also catches reinterpretations (numeric perturbations). Costlier.
3. Metrics: survival-vs-depth for all three tiers (one plot/table); the drop-vs-reinterpret recovery breakdown; guard token cost per tier; `falseFlagRate` (should be ~0 — guard must not thrash). HEADLINE is the GAP between tier 2 and tier 3 at deep cells (d≥3): it isolates how much recoverable loss is drops (cheap) vs reinterpretations (expensive).
4. Writeups: experiments/16-handoff-guards/README.md with all tables + pinned run IDs (replay-verify every trace), SYNTHESIS.md entry (RT-07), JOURNAL.md entry. Explicit verdict on H-D1, H-D2, H-D3 — each confirmed or refuted. Plus the one-paragraph stack recommendation: where in the real delegation path (sonder/lattice handoff or the AOP payload contract) the manifest should live, which tier to default to, and at what depth value-echo stops being worth its cost.
5. Commit everything to swarmlab `main` (local commits). Do NOT push swarmlab — the parent session handles pushes.

HONESTY RULE: honest numbers even if red. If the value-echo guard (tier 3) costs more than the survival it buys at deep cells, report the crossover depth plainly — the recommendation may be "presence manifest everywhere, value-echo only at d≤2". Never smooth a number.

FINAL REPORT (print as your final message): files added/changed, commit SHAs, control-tier reproduction check vs RT-05 Part A, survival-vs-depth curves for all tiers + drop/reinterpret breakdown + guard cost tables, H-D1/H-D2/H-D3 verdicts, replay results, honesty notes, and the stack recommendation paragraph.

Begin. Execute the assigned task to completion.
