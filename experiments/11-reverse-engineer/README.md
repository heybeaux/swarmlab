# 11 — The Reverse Engineer

**Faculty tested: Sonder** (behavioral contracts / black-box inference) + **Engram**
(reconstructing hidden state from observed behavior).

Agent A builds a pricing oracle and **seals the source**. Agent B may only probe its
behavior — send `(qty, promo)` inputs, observe prices — and must reconstruct an equivalent
implementation. We measure how close B gets *without ever seeing A's code*, and split the
score into **happy-path** vs **edge-case** agreement so the residual gap is visible.

Full brief: [`specs/11-reverse-engineer.md`](../../specs/11-reverse-engineer.md).

## What it models

Agent A's oracle ([`src/oracle.ts`](src/oracle.ts)) is a layered pricing engine. Only A
holds the `OracleSpec`; B interacts through `OracleSession.ask()` and sees nothing but the
price. The layers, from most to least observable:

1. **Tiered ladder** — a per-unit rate that steps down across two breakpoints, plus a flat
   handling fee. This is the *happy path*: smooth, monotone, trivially fittable.
2. **Hidden rounding cliff** — orders at/above a hidden `qty` are rounded up to the next
   whole dollar. Invisible unless you probe that exact band.
3. **Session state** (stateful tier) — the oracle *remembers cumulative spend*; once it
   crosses a hidden bar, every later price is scaled by a loyalty multiplier. Pure
   input→output probing cannot see this without replaying history in the right order.
4. **Rare promo path** — `promo=true` at exactly one hidden `qty` applies a fixed rebate.

Agent B ([`src/prober.ts`](src/prober.ts)) sweeps the observable qty window under a probe
budget, recovers per-unit rates from consecutive price differences, rejects the spurious
"straddle" marginals that appear at a breakpoint (the band rate applies to the *whole*
order, so crossing a breakpoint jumps the intercept), detects breakpoints, and recovers the
handling fee from the intercept of the first band. B fits **only** the smooth ladder — it
has no representation for state, cliffs, or promos.

The sweep crosses **complexity** `{stateless, tiered, stateful}` × **probe budget**
`{2,4,6,10,16,24,40}`, 30 seeded trials per cell. Trial 0 of each cell spawns A and B
through `core` and puts every probe on the bus as a `B→A` message plus an `A→B` response,
so the run replays in the observatory. Each cell emits a `score` event
`{ agreement, probesUsed, happyPathAgreement, edgeCaseAgreement }`.

## Run it

```bash
npm run build
node experiments/11-reverse-engineer/dist/main.js
```

Knobs (env): `RE_TRIALS`, `RE_SEED`. Output is a JSONL trace under `runs/`; the harness
re-reads it with `replay()` and asserts spawn/message/score/kill event-count parity.

## What I observed

Agreement (fraction of held-out cases where B's reconstructed price *exactly* matches A's
truth), by probe budget:

| budget | stateless happy | tiered happy | tiered edge | stateful happy | stateful edge |
|-------:|----------------:|-------------:|------------:|---------------:|--------------:|
| 2      | 0.04            | 0.03         | 0.01        | 0.03           | 0.00          |
| 4      | 0.17            | 0.12         | 0.00        | 0.13           | 0.00          |
| 6      | 0.25            | 0.21         | 0.00        | 0.13           | 0.00          |
| 10     | 0.79            | 0.67         | 0.00        | **0.47**       | 0.00          |
| 16     | 0.94            | 0.83         | 0.01        | 0.34           | 0.01          |
| 24     | 0.98            | 0.88         | 0.01        | 0.26           | 0.01          |
| 40     | **1.00**        | **0.89**     | **0.00**    | 0.21           | 0.00          |

Summary event:
`{ plateauBudgetStateless: 40, plateauBudgetStateful: 10, edgeGapStatelessMax: 0,
edgeGapTieredMax: 0.894, edgeGapStatefulMax: 0.207, bestStatefulAgreement: 0.281 }`.

### 1. The happy path is fully recoverable — and converges fast.

With enough probes B reverse-engineers a pure ladder **perfectly** (stateless reaches
`agreement = 1.00` at budget 40, and is already at 0.94 by budget 16). The curve is a
classic learning S-curve: near-zero at 2–6 probes (too few points to place both
breakpoints), a steep climb through 10–16, then a plateau against the ceiling. Black-box
behavioral inference *does* converge on the common path — the hypothesis holds. B never saw
a line of A's code and rebuilt its externally-observable function exactly.

### 2. The edge-case gap is enormous and does NOT close with more probing.

The tiered oracle's happy path climbs to 0.89, but its **edge-case agreement stays pinned
near 0.00 at every budget** — a residual gap of **0.894** even at 40 probes
(`edgeGapTieredMax = 0.894`). The rounding cliff sits in a narrow qty band that a
reasonable sweep almost never lands on, and even when it does, B's ladder fit discards the
single anomalous point as noise. **More probes buy more happy-path precision and zero
edge-case coverage.** The gap isn't a sampling problem you can throw budget at — it's the
part of behavior that isn't a function of the inputs B thinks to vary. That gap is *exactly*
the surface a Sonder behavioral contract exists to name explicitly.

### 3. Probing a stateful system *poisons the model* — more probes make B worse.

The sharpest result. Stateful happy-path agreement **peaks at budget 10 (0.47) then
declines to 0.21 at budget 40** — the only non-monotone curve in the sweep. Mechanism: B's
own probes accumulate spend in the live session, and once that crosses the oracle's hidden
loyalty bar, *later probes come back silently discounted*. B has no state variable, so it
folds those loyalty-cut observations into its ladder fit and corrupts the recovered rates.
The act of measuring changes the thing measured, and **the harder B probes, the more of its
own evidence is contaminated.** Best stateful agreement across the entire sweep is 0.281 —
against 1.00 for the stateless oracle of otherwise identical shape. Hidden state doesn't
just hide behavior; it makes the observable behavior *lie* under sustained observation.

## The Sonder lesson

Black-box inference is a spotlight: it converges fast and even *perfectly* on whatever the
prober thinks to vary (the happy path), and is structurally blind to everything else —
hidden thresholds, session state, rare inputs. Three directives fall out.

**First, contracts must enumerate the edge regions, because probing can't find them.** The
tiered gap held at 0.89 no matter the budget: you cannot sample your way to a cliff you
don't know exists. Sonder's value is exactly this — a behavioral contract that *names* the
rounding band, the promo qty, the loyalty bar, converting un-probeable behavior into stated
behavior. Everything B got to 1.00 on (the ladder) it didn't need a contract for; everything
it got to 0.00 on is precisely what a contract must carry.

**Second, statefulness is a first-class contract term, not an implementation detail.** A
stateless and a stateful oracle with identical happy-path ladders scored 1.00 vs 0.28. The
difference is invisible to a single probe and actively corrupts a probe *sequence*. A
contract that omits "this endpoint has session memory" is worse than useless — it invites
exactly the poisoned inference we measured.

**Third, treat "the observer changes the system" as a hazard for any behavioral spec built
by probing.** If Sonder ever *learns* a contract from observed traffic (rather than being
handed one), the stateful result is a warning: the learning process can degrade with more
data when the target has hidden state. Reconstruction from behavior needs a way to detect
and quarantine state-induced drift, or it will confidently ship a contract that's most wrong
where it probed hardest. The trace is honest — the stateful curve bends the wrong way, and
we let it.

## Live run (real LLM)

- **Mode / model:** `llm`, `claude-haiku-4-5-20251001` via `dist/llm.js`. A real haiku
  *prober* spends a budget of 12 probes against the SAME sealed stateful oracle (so loyalty
  state is real), sees only prices, then predicts a held-out test set split HAPPY vs EDGE.
- **Trace:** `runs/re-llm-mr7ggy84.jsonl` (replay-verified).
- **Key metrics:** `agreement=0.025`, `happyPathAgreement=0`, **`happyPathWithin5pct=0.458`**,
  `edgeCaseAgreement=0.063`, `probesUsed=12`, `predsReturned=40/40`.
- **Live vs sim — the self-poisoning finding.** Exact-match agreement is ~0, but the
  within-5% happy-path metric (0.458) tells the real story: **the model recovers the ladder's
  *shape* about half the time, and every miss is systematically LOW.** Sample pred/truth pairs:
  `2: 275/306`, `17: 1603/1800`, `39: 3571/3700`, `36: 3301/3400` — all undershoots. The
  cause is the hidden loyalty layer: the prober's *own* probe spend crosses the loyalty bar
  partway through its budget, so roughly half its observations are silently discounted by 0.9×.
  It therefore fits a ladder biased toward the discounted rates and undershoots every fresh-
  session test price. This is the sim's "stateful probing self-poisons" result, reproduced by a
  real reasoning model that has no way to know its measurements are changing the system. Edge
  cases (cliff/promo/loyalty-active) are near-total misses (0.063), exactly as the sim predicts:
  a black-box sweep cannot see behavior it never thought to trigger. **The observer changed the
  system, and the contract it would have shipped is most wrong precisely where it probed
  hardest.**
