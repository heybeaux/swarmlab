# 05 — The Bug Telephone

> One agent injects a subtle bug. A **chain** of reviewer agents each get a limited
> window to find it. Measure how far down the chain the bug survives.
> **Faculty tested: Lattice** (governance / review gates).

## The question

Serial code review is a governance gate. The folk theory is that stacking reviewers
is protective — "N eyes, so a bug has to fool all N." But review depth has economics:
each reviewer has a finite attention budget, later reviewers are fatigued and *biased
by the fact that earlier reviewers passed*, and a sufficiently subtle bug can walk the
whole chain untouched. This experiment asks: **where does a review chain actually break,
and how much protection does depth really buy?**

Specifically:
- **Survival depth** — how deep into the chain (0..L) a bug survives before someone catches it.
- **Detection rate by chain position** — does reviewer #k catch bugs at the same rate as #1?
- **Bug subtlety vs survival** — how survival scales with how well-hidden the bug is.
- **The "rubber-stamp" effect** — does an earlier PASS make later reviewers less vigilant,
  and does that make a *longer* chain worse than a shorter one past some point?

## Model

A single trial:

1. **Injector** plants one bug with a **subtlety** `s ∈ [0,1]` (0 = glaring, 1 = near-invisible).
2. A chain of `L` **reviewers** inspects the diff **in series**. Reviewer `k` (0-indexed) has:
   - a **competence** `c_k` (skill at spotting bugs), drawn per-reviewer,
   - an **attention budget** `w` (the review window / lines they actually scrutinize),
   - **fatigue**: effective attention decays with chain position (`k`) — deep reviewers skim.
   - **rubber-stamp bias**: each upstream PASS lowers this reviewer's scrutiny by a
     complacency factor (the "it already passed N reviews, LGTM" effect).
3. Reviewer `k` catches the bug with probability
   `p_catch(k) = clamp( base · c_k · attention_k · (1 - s) · complacency_k )`.
   The first reviewer to catch it stops the chain (bug fixed at depth `k`).
4. If no reviewer catches it, the bug **ships** (survival depth = `L`).

**Governance knobs (Lattice policy under test):**
- `fatigue` — how fast attention decays down the chain (0 = fresh reviewers forever).
- `rubberStamp` — how much an upstream PASS erodes downstream scrutiny (0 = independent eyes).
- `independent` policy zeroes `rubberStamp` (blind review — reviewers don't see prior verdicts).
- `serial` policy is the default (each reviewer sees the prior PASS trail).

The sweep crosses **chain length `L`** × **bug subtlety `s`** × **policy**, N seeded trials/cell.

## Event shape (JSONL trace, via core)

- `message` `meta` — mode, seed, trials, chain lengths, subtlety grid, policies.
- `message` `cell` — the (L, s, policy) cell being run.
- `message` `inject` — injector plants the bug: `{ subtlety, kind }`.
- `message` `review` — one reviewer verdict: `{ pos, competence, attention, pCatch, caught }`.
- `message` `verdict` — trial outcome: `{ survivalDepth, shipped, chainLen }`.
- `score` — per-cell aggregate: `chainLen`, `subtlety`, `policy`, `shipRate`,
  `meanSurvivalDepth`, `catchRateAtPos0`, `catchRateDeep`, `meanReviewsUsed`.
- final `score` — summary: cheapest chain length that gets ship-rate under a target, and
  whether rubber-stamping ever makes a longer chain *worse*.

## Metrics

- **shipRate** — fraction of trials where the bug shipped (survived the whole chain). Lower = better gate.
- **meanSurvivalDepth** — average depth the bug reached (capped at `L`).
- **catchRateAtPos0 / catchRateDeep** — detection rate for the first vs the last third of the chain.
- **marginalValue(k)** — reduction in ship-rate from adding the k-th reviewer (diminishing returns curve).
- **rubberStampPenalty** — ship-rate(serial) − ship-rate(independent) at fixed (L, s): the cost of non-blind review.

## Definition of done

- `specs/05-bug-telephone.md` (this file) written first.
- Runs, produces a valid JSONL trace under `experiments/05-bug-telephone/runs/`,
  and `replay()` from core reads it back (event-count parity check in the harness).
- Deterministic seeded sim is the honest floor; an optional real-LLM mode (`llm.ts`,
  claude CLI reviewers on a real buggy diff) is the stretch. **Never fake a green result.**
- `npm run typecheck` clean (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes),
  zero `any` in public signatures.
- `README.md` with what it tests and what was observed.
- One-paragraph learning note in `JOURNAL.md`.
- Committed and pushed to `origin/main`.
