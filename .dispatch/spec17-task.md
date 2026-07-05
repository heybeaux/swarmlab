You are the builder for Spec 17 — AOP v0.2: `payload_contract` in the standard.

READ FIRST (in this order):
1. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/specs/17-aop-payload-contract-v02.md — the full spec. It is authoritative; follow it exactly (including the exact JSON-schema $defs it prescribes).
2. /Users/beauxwalton/dev/sonder/packages/core/src/types/contract.ts on branch `typed-payload-contracts` — the reference-implementation types your spec additions must align with in meaning (repo ~/dev/sonder; the branch also exists on origin, PR #10).
3. /Users/beauxwalton/.openclaw/agents/scout/workspace/swarmlab/experiments/12-schema-negotiation/README.md — the "Retest: typed contracts" section with the evidence numbers you'll cite.

WORK ORDER:
1. Clone https://github.com/heybeaux/aop to ~/dev/aop (it has no local checkout). Push access is via the `heybeaux` gh account — if a push 404s, run `gh auth switch --user heybeaux`.
2. Branch `spec-v0.2-payload-contract` off main. Implement spec sections 1–5: spec/v0.2/ (JSON schema with aop_version const "0.2" + optional payload_contract $defs; proto3 with appended field numbers, never renumbered; semantic-conventions.md with the normative negotiation-semantics section), mirror in packages/aop-ts with tests (v0.2 valid contract validates; missing `unit` fails; v0.1 events unchanged against v0.1), minimal README note. spec/v0.1/** is IMMUTABLE — any diff to it is a spec violation. Build + tests green. Commit early and often.
3. Push the branch and open a PR to main titled: spec v0.2: payload_contract — authenticate meaning, not just authorship. PR body per the spec's Delivery section (exp-12 numbers: falseFriendMissRate 0.908→0.00, worst-cell silentCorruption 0.845→0.00, 0/960 corrupt escapes; Sonder PR #10 as reference implementation; v0.1-frozen rationale; test-plan checklist). This PR is pre-authorized by Beaux (2026-07-05). Do NOT merge it.

HONESTY RULE: every claim in the PR body must trace to the committed swarmlab runs or the Sonder branch; never assert untested behavior.

FINAL REPORT (print as your final message): files added/changed, branch name + commit SHAs, PR URL, test results.

Begin. Execute the assigned task to completion.
