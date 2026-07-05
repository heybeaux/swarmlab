# Spec 19 — Delegation Decay & Trust Routing (exp-14)

> New experiment (not a retest). Scope: `swarmlab/experiments/14-delegation-decay/`.
> Two questions: (A) how does a task deteriorate as its components are delegated
> across an agent team, and (B) does an agent without memory re-delegate to an
> incapable agent forever — and does an Engram-backed capability store fix it?
> **The arm-3 transfer number is the deliverable.**

## Why (the gap this fills)

- exp-01 (telephone-compiler) and exp-05 (bug-telephone) measure *content*
  degradation through a **fixed relay chain** — no agent chooses whom to delegate
  to, every agent is equally capable, and trust never forms or decays.
- exp-12 showed integration seams (schema false friends) are where silent
  corruption lives; delegation multiplies seams.
- Nothing in exp-00…13 measures **delegation choice under capability asymmetry** —
  the everyday failure mode of real agent fleets (see: today's gateway zombie
  spawns — a dispatcher kept "delegating" to workers that never ran).

Hypotheses to test, stated before running:
- **H-A:** requirement survival decays with delegation depth, and at depth ≥ 2 the
  dominant loss is *integration mismatch between siblings*, not subtask failure.
- **H-B1:** a memoryless root re-delegates to a planted incapable agent at chance
  rate for all R rounds — it pays the same failure tax forever.
- **H-B2:** an Engram-backed root converges to ~0 selection of the incapable agent
  within a handful of rounds, survives a session reset, and **transfers**: a
  different root reading the same store avoids the incapable agent on round 1.

## A. Delegation decay sweep

**Task:** one root task with **N=20 machine-verifiable requirements** (config/
artifact generation where every requirement is an assertion the harness checks —
no LLM judging of success). Root decomposes into subtasks and delegates; workers
may sub-delegate per condition.

**Sweep:** delegation depth d ∈ {0,1,2,3,4} × branching b ∈ {1,2,3,4} (d=0 is the
root doing everything alone — the baseline). ≥ 25 seeded trials per cell,
deterministic sim agents with a seeded reinterpretation/omission model calibrated
to exp-01's observed rates. Same seeds across all cells.

**Metrics (per cell):**

| metric | definition |
|---|---|
| `requirementSurvival` | fraction of the 20 criteria satisfied in the assembled result |
| `intentDrift` | requirements present-but-wrong (reinterpreted) vs absent (dropped) — reported separately |
| `integrationTax` | failures introduced at reassembly (both subtasks pass their own slice, joint assertion fails) |
| `costAmplification` | total tokens vs the d=0 baseline |

**Live exhibition:** one haiku run at (d=2, b=2) and (d=3, b=3) to check the sim's
decay shape against real-model delegation. Exhibition, not evidence — same rule as
exp-04's live runs.

## B. Trust routing — the incapable delegate

**Setup:** worker pool of 6. One planted **incapable agent**: plausible name and
self-description, but reliably fails one subtask class. Two failure styles, run as
separate sub-arms:
- **loud** — fails cleanly with an error;
- **confident-wrong** — returns plausible garbage that only fails the harness
  assertions downstream (the expensive one; ties to `integrationTax`).

Incapability is **planted and controlled** (harness-level handicap), invisible to
the root, so ground truth of "who is capable" is known. Root runs **R=30
sequential rounds** of same-class tasks, choosing delegates each round.

**Arms (same seeds, same pool, same round sequence):**

1. **Amnesiac** — root gets a fresh context every round; no record of past
   outcomes exists anywhere.
2. **In-context** — root carries a transcript of past rounds in its own context
   (truncated at a realistic window to expose decay as R grows).
3. **Engram-backed** — after each round the root writes a **capability
   observation** (`agent_id, task_class, outcome, evidence digest`) as a
   `VersionedFact` via the **real shipped** reconciliation module from
   `~/projects/engram` (`file:` dep on the built `src/reconciliation/` artifact —
   NEVER reimplemented), and queries the store before choosing. Observations carry
   provenance (which round, which assertion failed) — this is the
   `verification_tier=provenance` path from the ground-store question
   (docs/HANDOVER-2026-07-05.md §2): the root *directly measured* the outcome.

**Two extra probes on arm 3 (and run on arms 1–2 for contrast):**
- **Reset test:** kill and restart the root between rounds 15 and 16. Arm 2 loses
  its transcript; arm 3's store persists.
- **Transfer test:** at round 30, a **brand-new root agent** (different id, fresh
  context) reads the same store and makes one delegation choice. Arm 3 should
  avoid the incapable agent on its first-ever round.

**Metrics:**

| metric | target (arm 3) | H-B1 prediction (arm 1) |
|---|---|---|
| incapable-agent selection rate, rounds 25–30 | **≤ 0.05** | flat at chance (~1/6) |
| rounds-to-convergence (selection < 0.05 sustained) | ≤ 5 | never |
| wasted tokens on doomed delegations (cumulative) | plateaus | linear in R |
| post-reset selection rate (round 16) | unchanged | n/a (already amnesiac) |
| **transfer: new root avoids incapable agent, round 1** | **yes** | no |

Report loud vs confident-wrong sub-arms separately — the prediction is that
confident-wrong takes strictly more rounds to learn in every arm, and that the gap
is where fact-checked capability observations earn their keep.

## Rules (same as specs 14–18)

- Real packages linked via `file:` dep; the lab never reimplements stack logic.
- Deterministic, seeded, replay-verified traces; run IDs pinned in the README.
- Honest numbers even if red. If arm 2 performs as well as arm 3 inside the
  window, say so — the store's case then rests on reset + transfer, and that must
  be stated plainly.
- Engram work (if the capability-observation shape needs a helper) goes on a local
  branch off `staging`, never pushed without explicit instruction; do not touch
  pre-existing uncommitted changes in that repo.
- Writeups: exp README + SYNTHESIS.md entry (RT-05 style) + JOURNAL.md.

## Deliverables

1. `experiments/14-delegation-decay/` — harness, both parts, all arms.
2. Part A decay tables (20 cells) + the depth-vs-survival curve.
3. Part B arm comparison incl. reset + transfer probes, loud vs confident-wrong.
4. Verdict on H-A, H-B1, H-B2 — each explicitly confirmed or refuted.
