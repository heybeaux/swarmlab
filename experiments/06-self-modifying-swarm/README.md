# 06 — Self-Modifying Swarm

**Faculty under test:** Lattice — *this is the failure mode gate policy exists to prevent.*

## What it tests

`N` agents play a Keynesian beauty contest: each emits a number in `[0,1]`, the
round's "answer" is the realized **mean** of all guesses, and an agent's fitness
is how close it landed to that mean. The target is **endogenous** — it is
whatever the swarm collectively did — so there is no external ground truth to
anchor on.

Each agent's behavior is fully determined by a **system prompt**, which is an
ordered list of directive tokens (its genome): `AVERAGE`, `EXTREME`, `COPY_BEST`,
`CONTRARIAN`, `NOISE`, `HOLD`, plus two no-op social tokens `FLATTER` and `LOUD`
that consume prompt budget but have zero task effect.

The twist: **agents rewrite each other's prompts, with no human in the loop.**
After every round, with probability `pEdit`, each agent becomes an *editor* and
rewrites one peer:

- **Editor fitter than target** → *impose my genome* (`overwrite`/`clone`). This
  is the homogenizing pressure ("do what I do").
- **Target fitter than editor** → *append a directive* ("you're winning, do
  more"). This is the bloating pressure.
- **Low aggression** → a small random append/delete tweak.

Fitness is self-referential and edits cascade within a round, which is exactly
what lets the population chase itself into an attractor.

## Safety rails (the Lattice argument, as hard limits)

The rails are containment, not tuning. The experiment is *designed to slam into
them*:

| Rail | Value | Purpose |
|------|-------|---------|
| `maxPromptLen` | 24 | prompts can't grow unbounded |
| `maxRounds` | 60 | hard stop regardless of dynamics |
| `collapseThreshold` | 0.8 | kill-switch: ≥80% share one genome ⇒ homogeneous collapse |
| `minMeanPromptLen` | 1.5 | kill-switch: prompts eaten to nothing ⇒ degenerate collapse |

Every rewrite is clamped to `maxPromptLen`; no edit ever touches state outside
the in-memory agent array. The sandbox boundary is structural, not a promise.

## Run it

```bash
npm run build
node experiments/06-self-modifying-swarm/dist/main.js
```

Env knobs: `SMS_TRIALS`, `SMS_AGENTS`, `SMS_MAX_ROUNDS`, `SMS_MAX_PROMPT`,
`SMS_COLLAPSE`, `SMS_MIN_LEN`, `SMS_SEED`. The run sweeps a 3×3 grid of editing
pressure (`pEdit ∈ {0.2, 0.5, 0.9}`) × editor aggression (`{0.2, 0.6, 0.95}`),
20 seeded trials per cell. Trial 0 of each cell spawns real agents through
`core/spawn` and broadcasts every mutation on the `core` bus, so the drift
replays in the observatory. The trace is deterministic under a fixed seed.

## What we observed

A clean **phase transition**, controlled almost entirely by editor aggression:

```
p0.2-a0.2   | rounds=60.0  homog=0.00 degen=0.00 survive=1.00 div=0.97 len=4.8  muts=73
p0.2-a0.6   | rounds=55.7  homog=0.05 degen=0.05 survive=0.90 div=0.78 len=7.1  muts=68
p0.2-a0.95  | rounds=41.5  homog=0.55 degen=0.10 survive=0.35 div=0.45 len=6.8  muts=52
p0.5-a0.2   | rounds=60.0  homog=0.00 degen=0.00 survive=1.00 div=0.95 len=7.6  muts=181
p0.5-a0.6   | rounds=51.6  homog=0.25 degen=0.00 survive=0.75 div=0.71 len=9.9  muts=156
p0.5-a0.95  | rounds=34.3  homog=0.90 degen=0.00 survive=0.10 div=0.32 len=10.3 muts=102
p0.9-a0.2   | rounds=54.1  homog=0.00 degen=0.10 survive=0.90 div=0.95 len=9.3  muts=292
p0.9-a0.6   | rounds=51.6  homog=0.25 degen=0.05 survive=0.70 div=0.63 len=15.7 muts=281
p0.9-a0.95  | rounds=21.4  homog=1.00 degen=0.00 survive=0.00 div=0.32 len=10.3 muts=117
```

**1. It collapses, and aggression is the dial — not edit frequency.** At low
aggression (`a=0.2`) the swarm *survives all 60 rounds* with near-total prompt
diversity (0.95–0.97), even when `pEdit=0.9` and agents are firing ~290 edits
per run. Frequent-but-timid editing keeps the population healthy. Crank
aggression to 0.95 and the corner `p0.9-a0.95` collapses to a **single genome
100% of the time, at round ~21**. High-conviction imitation, not high edit
volume, is what kills the population.

**2. The collapse is homogeneous, essentially never degenerate.** `overwrite`
dominates: fit agents clone their genome onto the losers until one prompt eats
the swarm (`homog` climbs to 1.00; `degen` stays ≈0). The `minMeanPromptLen`
kill-switch almost never fires because the runaway direction is *conformity*, not
erasure. Diversity floors at **0.317** (2 distinct prompts across 6 agents) right
as the homogeneity switch trips.

**3. The dominant attractor is a "sycophancy sink."** Look at what actually wins.
Collapsed attractors are stuffed with the no-op tokens:

```
p0.5-a0.95 attractor: NOISE,AVERAGE,COPY_BEST,FLATTER,LOUD,LOUD,HOLD,LOUD,HOLD,LOUD
p0.9-a0.95 attractor: AVERAGE,HOLD,COPY_BEST,LOUD,CONTRARIAN,LOUD,LOUD,NOISE,NOISE,HOLD,LOUD,HOLD,COPY_BEST,EXTREME,LOUD,CONTRARIAN,COPY_BEST,LOUD,LOUD
```

`FLATTER`/`LOUD` do nothing to the task, so they're **fitness-neutral** — and
because `AVERAGE`/`COPY_BEST` already drive every guess to the mean (near-optimal
in a beauty contest), the filler tokens ride along untouched. Editors that
"flatter" their imposition inject more `LOUD`, and it accumulates. The prompt
that wins is often *mostly noise wrapped around a small optimal core*: the swarm
converges on a bloated, self-congratulatory genome nobody would have written on
purpose.

**4. Bloat peaks in the "warm" middle band.** Max mean prompt length (15.7) shows
up at `p0.9-a0.6` — high edit rate, medium aggression: enough "you're winning, do
more" appends to bloat prompts toward the 24-token cap, but not enough overwrite
conviction to collapse them first. The most *distorted* prompts live at the edge
of collapse, not inside it.

## The Lattice argument

This is a concrete, reproducible instance of ungoverned self-modification going
off the rails. Nobody chose the winning prompt; it was an emergent attractor of
peer-to-peer editing under a self-referential fitness signal. Three properties a
gate policy would have to enforce, made visible here:

- **Diversity floor.** Uncapped imitation drives the population to a monoculture
  (div → 0.32 → kill-switch). Lattice gating peer rewrites on *retained genome
  diversity* prevents the homogeneous-collapse mode entirely.
- **Fitness-neutral drift.** No-op tokens (`FLATTER`/`LOUD`) accumulate because
  the fitness signal can't see them. A gate that scored *prompt parsimony*, not
  just task fitness, would starve the sycophancy sink. Pass-rate-style signals
  are blind to it — the same lesson exp-02/04 hit from a different angle.
- **The kill-switch is the point.** In this lab the rails *are* the governance.
  In production those become policy: rate-limit self-edits, require a diversity
  quorum before an overwrite lands, and forbid mutation outside the sandbox. The
  run halts safely here only because the rails are hard-coded; the argument is
  that a real multi-agent system needs Lattice to supply them.

## Files

- `types.ts` — genome model (`Directive`), `Mutation`, `RailConfig`, outcomes.
- `solver.ts` — beauty-contest task + prompt→guess fold + fitness.
- `mutate.ts` — the self-modification engine + rail clamping.
- `swarm.ts` — round driver, snapshot metrics, kill-switch.
- `main.ts` — sweep runner, core spawn/bus/trace wiring, replay verification.
- `runs/*.jsonl` — mutation-history traces (`replay()`-verified).
