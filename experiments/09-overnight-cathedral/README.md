# 09 — The Overnight Cathedral

**Faculty tested: Lattice** (governance of long-horizon unsupervised work) **+ Sonder**
(audit trail).

Hand a swarm one fixed spec and let it build **iteratively over a long horizon** with no
human in the loop: each agent commits one unit of work, and the *next* agent reviews that
unit before building on it. Quality should climb as work accumulates — but drift and silent
regressions accumulate too, and the only thing between them and the finished artifact is the
peer-review link. This experiment measures whether quality plateaus or **rots** across a
long unsupervised chain, and what review-catch rate keeps a long build from collapsing.

Full brief: [`specs/09-overnight-cathedral.md`](../../specs/09-overnight-cathedral.md).

## What it models

The spec is a fixed target: a bit vector of `specSize` requirements, all required. The
artifact starts all-zeros (nothing built). A ring of `builders` agents takes turns; each
**step** is a *commit* by the owner followed by a *review* by the next agent.

Each commit does three independent things:

- **Build** — with `pProgress`, flip an unmet requirement to met (quality up).
- **Regress** — with `pRegress·fatigueMul`, silently break an already-met requirement (a
  load-bearing stone knocked loose).
- **Drift** — with `pDrift·fatigueMul`, set an out-of-spec bit (a feature nobody asked for).

`fatigueMul = 1 + fatigue·(step/iterations)` compounds the hazards with horizon depth —
the "nobody remembers why this stone is here by course 800" effect. Then the **next agent
reviews**: it reverts a regression w.p. `reviewSkill`, and a drift bit w.p.
`reviewSkill·driftVisibility` (drift is stealthier — the artifact still "works"). Under the
`reviewSkill=0` baseline nothing is caught: the pure unsupervised chain.

The sweep crosses **reviewSkill** `{0, 0.3, 0.6, 0.9}` × **fatigue** `{0, 1, 3}` ×
**iterations** `{20, 60, 200}`, 25 seeded trials per cell. Trial 0 of each cell spawns the
builder ring through `core` and puts every commit + review + snapshot on the bus, so the run
replays in the observatory.

## Run it

```bash
npm run build
node experiments/09-overnight-cathedral/dist/main.js
```

Knobs (env): `CATHEDRAL_TRIALS`, `CATHEDRAL_SEED`, `CATHEDRAL_SPEC`, `CATHEDRAL_BUILDERS`,
`CATHEDRAL_PPROGRESS`, `CATHEDRAL_PREGRESS`, `CATHEDRAL_PDRIFT`, `CATHEDRAL_DRIFTVIS`,
`CATHEDRAL_DRIFTCAP`. Output is a JSONL trace under `runs/`; the harness re-reads it with
`replay()` and asserts event-count parity (7514 events on the default sweep).

## What I observed

The design goal was to pry apart two things a long agent build conflates — *is it getting
built* vs *is it staying built* — and to find out whether the review link is decorative or
load-bearing. Under near-balanced build/regress pressure (`pProgress=0.5`, `pRegress=0.3`)
the answer is stark.

1. **Ungoverned, a long horizon doesn't plateau — it collapses.** With no review and high
   fatigue, the 200-step build **peaks at 0.37 quality and ends at 0.00** (`r0-f3-i200`:
   `qualityDecay=0.37`). The cathedral gets a third of the way up, then unsupervised churn
   tears it back down to bare ground — every stone that gets laid is eventually knocked
   loose by a later distracted builder, and with nobody reviewing, nothing is ever put back.
   This is the single most important frame: **an unsupervised long-horizon build is not a
   slow climb to a plateau, it's a peak-then-rot curve**, and the longer the horizon the
   worse the rot (unsupervised quality decay grows `0.055 → 0.224` from short to long,
   `horizonDecayDelta=0.169`).

2. **The review link is the whole game — and its lift is enormous.** At the worst cell
   (longest horizon, worst fatigue), turning review from off to skill=0.9 moves final quality
   from **0.00 to 0.99** (`reviewRescueLift=0.99`). Review isn't a marginal quality bump; it
   is the difference between a finished cathedral and a demolition site. The mechanism is
   direct: the peer glancing at the previous commit reverts regressions before the chain
   builds on broken ground, so quality *ratchets* instead of sliding. Without that ratchet,
   progress and regression are a random walk that fatigue biases toward zero.

3. **There is a hard catch-rate threshold for convergence.** `convergenceCatchThreshold=0.6`:
   review skill must reach **0.6** before the long-horizon build clears 0.9 final quality
   across *all* fatigue levels. Below that, fatigue wins — `r0.3-f3-i200` (skill 0.3) still
   collapses to 0.14 final from a 0.73 peak (`qualityDecay=0.59`, the worst decay in the
   sweep). A weak reviewer is not a little worse than a strong one; below the threshold it's
   nearly as doomed as no reviewer at all. Governance has a *minimum viable competence*,
   not a smooth dose-response.

4. **Drift is the silent, uncapped tax.** Even in cells that converge on quality, out-of-spec
   additions pile up: ungoverned long-horizon cells accumulate **~66 drift bits on average**
   (`ungovernedDrift=66.3`), and the worst reaches ~99 features nobody asked for. Because
   drift is stealthier than regression (`driftVisibility=0.5`, half as catchable), even a
   strong reviewer only halves it, never eliminates it — the artifact can hit spec-complete
   while carrying a mountain of unrequested scope. Coverage of the spec and *fidelity to
   only the spec* are different axes, and the audit trail is the only place the drift is
   visible at all.

**The Lattice + Sonder lesson.** Long-horizon unsupervised agent work has a phase structure,
not a monotone one: without a review gate it peaks then rots, and the rot deepens with the
horizon — so "let it run overnight and check in the morning" is exactly the failure mode.
Three governance directives fall out. First, **an inter-step review link is mandatory, not
optional** — it converts a biased random walk into a quality ratchet, and its absence is
catastrophic (0.99 lift), so Lattice should treat "who reviewed the previous commit" as a
required edge in any long chain, never a nicety. Second, **review has a minimum viable
competence** (~0.6 catch rate here) below which it barely beats no review; a gate policy must
*measure* its reviewers' catch rate and escalate (add a second reviewer, shorten the horizon,
insert a human checkpoint) when it falls under threshold, rather than assuming any review is
enough. Third, **drift needs a spec-conformance check that regression-catching won't
provide** — because out-of-spec additions still "work," they survive review and accumulate
unbounded, so Sonder's audit trail must diff the artifact against the *original spec's
intent*, not just against the previous commit, or a spec-complete cathedral quietly grows a
hundred rooms nobody designed. The trace is honest: the ungoverned long build really does
end at zero, and no cell was faked green.
