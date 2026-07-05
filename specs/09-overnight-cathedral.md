# 09 — The Overnight Cathedral

> Hand a swarm one fixed spec and let it build **iteratively over a long horizon** with
> no human in the loop: each agent commits one unit of work, and the *next* agent reviews
> that unit before building on it. Measure how **quality** and **drift** evolve across a
> long unsupervised chain — and how much the peer-review link actually catches.
> **Faculty tested: Lattice** (governance of long-horizon unsupervised work) **+ Sonder**
> (does the audit trail let you reconstruct where it went wrong).

## The question

A cathedral is built by generations who never meet, each trusting the courses laid before
them. Long-horizon agent work is the same shape: an agent commits, the next agent inherits
that state and builds on it, and no human watches any individual commit. Two forces fight
across the horizon. **Quality** — how much of the fixed spec is actually satisfied — should
climb as work accumulates. **Drift** — changes the spec never asked for, plus silent
regressions of work that was already done — accumulates too, because every unsupervised
step is a chance to break a load-bearing stone while reaching for a new one. The only thing
standing between drift and the finished artifact is the **review link**: each agent glances
at the previous agent's unit before extending it, and *sometimes* reverts a regression.

This experiment asks: **over a long chain of iterative build steps under no human
supervision, does quality plateau or decay, how fast does drift accumulate, and what
review-catch rate is needed to keep a long build from rotting?**

Specifically:
- **Quality over iterations** — fraction of the fixed spec satisfied, per step.
- **Drift over iterations** — cumulative count of unrequested / out-of-spec changes that
  survive in the artifact.
- **Regression rate** — how often a step silently breaks a requirement that was already met.
- **Review-catch rate** — fraction of regressions the *next* reviewer reverts before building.
- **Horizon sensitivity** — does a 10-step build and a 200-step build land in different
  regimes (converge vs. rot), and where is the tipping point?

## Model

The spec is a fixed target: a bit vector of `specSize` requirements, all required (target =
all ones). The artifact is a same-length bit vector, initially all zeros (nothing built).

A single trial runs `iterations` steps around a ring of `builders` agents (agent
`i mod builders` owns step `i`), each step a **commit** followed by the *next* agent's
**review** of that commit:

1. **Build.** The owner attempts one unit of work. With probability `pProgress` it flips
   an unmet requirement to *met* (lays a new stone — quality up). Independently, every step
   risks **collateral damage**: with probability `pRegress` per step it flips an *already-met*
   requirement back to unmet (a silent regression), and with probability `pDrift` it flips a
   bit *outside* the spec's intent — i.e. adds a feature nobody asked for. (Drift is modeled
   as spurious "extra" bits in an out-of-spec tail region of the vector.)
2. **Fatigue.** Both hazards compound with horizon position: late in a long unsupervised
   chain, context is thinner and inherited assumptions are shakier, so `pRegress` and
   `pDrift` scale up by `1 + fatigue · (step / iterations)`. This is the "nobody remembers
   why this stone is here by course 800" effect.
3. **Review.** The *next* agent inspects the just-committed unit. It catches a regression
   with probability `reviewSkill` (and reverts it — restores the requirement), and catches
   an out-of-spec drift bit with probability `reviewSkill · driftVisibility` (drift is
   harder to notice than a broken requirement, because the artifact still "works"). Under
   the `no-review` policy `reviewSkill` is pinned to 0 — the pure unsupervised baseline.
4. **Stop.** After `iterations` steps.

**Governance knobs (Lattice policy under test):**
- `reviewSkill` — competence of the peer-review link (0 = ungoverned).
- `driftVisibility` — how visible out-of-spec additions are to a reviewer (drift is stealthier
  than regression).
- `fatigue` — how much the hazards grow with horizon depth.
- `iterations` — horizon length (the whole point: short vs. very long builds).

The sweep crosses **reviewSkill** × **fatigue** × **iterations**, N seeded trials/cell.

## Event shape (JSONL trace, via core)

- `message` `meta` — mode, seed, trials, the review/fatigue/horizon grids, spec params.
- `message` `cell` — the (reviewSkill, fatigue, iterations) cell being run.
- `message` `commit` — one build step on the exhibition trial: `{ step, builder, built,
  regressed, drifted, quality, drift }`.
- `message` `review` — the next agent's review of that commit: `{ step, reviewer,
  caughtRegression, caughtDrift, quality, drift }`.
- `message` `snapshot` — periodic quality/drift checkpoint on the exhibition trial.
- `score` — per-cell aggregate: `reviewSkill`, `fatigue`, `iterations`, `finalQuality`,
  `finalDrift`, `peakQuality`, `qualityDecay`, `regressionRate`, `reviewCatchRate`.
- final `score` — summary: does review rescue long horizons, where quality peaks-then-rots,
  and the catch rate that separates convergence from decay.

## Metrics

- **quality(step)** — fraction of the `specSize` requirements currently met.
- **drift(step)** — count of out-of-spec bits currently set (features nobody asked for).
- **finalQuality / peakQuality** — quality at the end vs. its best-ever value (a large gap =
  the cathedral was finished then quietly damaged).
- **qualityDecay** — `peakQuality − finalQuality`: how much built work rotted after its peak.
- **regressionRate** — regressions per step (before review).
- **reviewCatchRate** — fraction of regressions the review link reverted.

## Definition of done

- `specs/09-overnight-cathedral.md` (this file) written first.
- Runs, produces a valid JSONL trace under `experiments/09-overnight-cathedral/runs/`,
  and `replay()` from core reads it back (event-count parity check in the harness).
- Deterministic seeded sim is the honest floor; an optional real-LLM exhibition
  (`llm.ts`, claude CLI builder/reviewer on a tiny real artifact) is the stretch and
  is skipped cleanly when the CLI is absent. **Never fake a green result.**
- `npm run typecheck` clean (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes),
  zero `any` in public signatures.
- `README.md` with what it tests and what was observed.
- One-paragraph learning note in `JOURNAL.md`.
- Committed and pushed to `origin/main`.
