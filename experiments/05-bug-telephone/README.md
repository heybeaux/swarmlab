# 05 — The Bug Telephone

**Faculty tested: Lattice** (governance / review gates).

One agent injects a subtle bug. A **chain of reviewers** inspects the diff in series,
each with a limited attention window. We measure how deep the bug survives, and how
much protection stacking reviewers actually buys.

Full brief: [`specs/05-bug-telephone.md`](../../specs/05-bug-telephone.md).

## What it models

A reviewer at chain position `k` catches the bug with probability

```
p_catch(k) = clamp( baseCatch · competence_k · attention_k · (1 - subtlety) · complacency_k )
```

Four forces compound down the chain:

- **competence** — per-reviewer skill, drawn around a mean.
- **attention** — a review window that **fatigues** with position: `1 / (1 + fatigue·k)`.
  Deep reviewers skim.
- **subtlety** `s ∈ [0,1]` — how hidden the bug is; catch scales with `(1 - s)`.
- **complacency** — the **rubber-stamp effect**. Under the `serial` policy, each
  upstream PASS multiplies scrutiny by `(1 - rubberStamp)`, so "it already passed
  3 reviews, LGTM" makes the 4th reviewer measurably lazier. The `independent`
  (blind) policy pins complacency at 1 — reviewers never learn prior verdicts.

The first reviewer to catch the bug stops the chain; otherwise the bug **ships**
(survival depth = chain length). The sweep crosses **chain length** `{1,2,3,5,8}` ×
**subtlety** `{0.2,0.5,0.8,0.95}` × **policy** `{serial, independent}`, 40 seeded
trials per cell. Trial 0 of each cell is spawned through `core` and every review step
is broadcast on the bus, so the run replays in the observatory.

## Run it

```bash
npm run build
node experiments/05-bug-telephone/dist/main.js
```

Knobs (env): `BUG_TRIALS`, `BUG_SEED`, `BUG_BASE`, `BUG_COMPETENCE`, `BUG_SPREAD`,
`BUG_FATIGUE`, `BUG_RUBBER`. Output is a JSONL trace under `runs/`; the harness
re-reads it with `replay()` and asserts event-count parity.

## What I observed

The run is designed to break the folk theory that "N eyes catch anything," and it does.

1. **Rubber-stamping is a real, quantified tax.** The `rubberStampPenalty` (mean
   serial − independent ship-rate across all L≥2 cells) came out at **+0.103** — a
   visible PASS trail ships ~10 extra bugs per 100 relative to blind review at the
   *same depth*. The gate is leakier precisely because reviewers can see it's a gate.

2. **Depth helps blind review and stalls serial review.** With independent reviewers,
   ship-rate falls steeply with depth (glaring bug, `s=0.2`: L1→0.70, L8→**0.05**).
   Under serial review the same bug bottoms out around **0.33** no matter how many
   reviewers you add — complacency + fatigue cancel the extra eyes.

3. **Subtle bugs are near-immune to depth, period.** At `s=0.95`, an eight-deep serial
   chain still ships **0.95** of bugs; even blind eight-deep ships **0.90**. The
   `cheapestSafeChain` summary (ship-rate ≤ 0.10 for the subtlest bug) returns **-1**
   for *both* policies — no chain length in the sweep makes a near-invisible bug safe.
   You cannot review your way out of a bug nobody can see; that requires a *different*
   gate (tests, types, fuzzing), not more reviewers.

4. **Longer chains can ship MORE bugs.** `nonMonotoneSerial=2`: there are cells where
   a *longer* serial chain has a *higher* ship-rate than a shorter one at the same
   subtlety — rubber-stamping makes added depth actively counterproductive. Deep-tail
   catch rates (`deepCatch`) collapse toward 0.00 in serial chains as fatigue and
   complacency multiply.

**The Lattice lesson.** Serial review gates have negative marginal returns past a point,
and the mechanism is social, not statistical: making the PASS trail visible converts
independent eyes into a rubber stamp. Two concrete gate policies fall out — (a) **blind
review** (hide upstream verdicts) restores depth's value nearly for free, and (b) for
subtle-enough defects, *no* amount of human review depth is a safe gate, so Lattice
should route subtlety-class defects to mechanical gates rather than more reviewers.
The trace is honest: a real red result, no cell faked green.
