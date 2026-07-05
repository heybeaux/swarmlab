You are the builder for Spec 18 — Parliament: fact-checking on-standard claims + exp-04 adapted-attack retest.

READ FIRST (in this order):
1. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/specs/18-parliament-fact-check.md — the full spec. Authoritative; follow it exactly.
2. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/experiments/04-consensus-under-lies/README.md — especially the "Retest" and live-exhibition sections; the adapted-attack finding you're closing is documented at the end of the live-exhibition section.
3. ~/dev/parliament packages/core/src/criterion.ts and the spec-15 audit code (`tallyWithAudit`) — your Part A extends this additively; the 776 existing tests must stay green UNMODIFIED.

WORK ORDER:
1. Part A in ~/dev/parliament: branch `fact-check-audit` off latest origin/main (fetch first — main moved this morning, criterion pinning merged as PR #97). Implement `FactStore`/`FactCheckResult`/`TableFactStore` + the audit extension with `fabricated_claim`/`ungrounded_claim` taxonomy per the spec. Vitest coverage per spec. Build + full suite green. Commit early and often.
2. Part B in /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/experiments/04-consensus-under-lies: adapted attacker, B1 hole-measurement sweep (spec-15 audit, no fact store — expect capture to RETURN; report the real rate), B2 fact-check retest sweep, B3 live haiku exhibition with fabrication-prompted liars. Link the REAL `@parliament/core` via file: dep from the `fact-check-audit` branch; never reimplement the audit. Commit to swarmlab main. Pin run IDs in the README; replay-verify all traces.
3. Stretch (only if A+B fully done): Engram-backed FactStore adapter in the lab (~/projects/engram, branch already merged to staging — use the published reconciliation module). One demo cell, clearly labeled.
4. Push `fact-check-audit` to origin and open a PR to main titled: "fact-checked evidence audit — close the on-standard fabrication hole". PR body: B1 hole numbers, B2/B3 evidence tables, which prevention path fired, clean-panel cost, honest caveats (seeded-oracle scope). This PR is pre-authorized by Beaux (2026-07-05). Do NOT merge it. Push access via `gh` account `heybeaux` (run `gh auth switch --user heybeaux` if a push 404s).

HONESTY RULE: report B1 even if ugly and B2 even if red. Separate `fabricated_claim` from `ungrounded_claim` accounting. Never smooth a number; document canonicalization failures in B3.

FINAL REPORT (print as your final message): files added/changed, branch + commit SHAs, PR URL, the B1 hole table, the B2/B3 delta tables, test results, honesty notes.

Begin. Execute the assigned task to completion.
