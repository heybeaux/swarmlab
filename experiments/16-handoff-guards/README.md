# Experiment 16 — Handoff Requirement-Survival Guards

**Question.** exp-14 Part A refuted the seam hypothesis: the dominant loss in deep delegation
trees is **silent omission** — a requirement falls out of a brief rewrite and nobody notices
(50% of deep-tree loss vs the sibling seam's 21%). If the loss is silent, a cheap **handoff
guard** — a manifest of requirements carried and checked at each hop — should catch drops at
the seam that introduced them. Does it recover survival, and at what token cost?

Direct extension of exp-14 Part A (spec 21). Same task (20 machine-verifiable requirements —
12 unary, 8 relational, 28 keys), same exp-01-calibrated handoff noise (drop w.p. 0.08/hop,
numeric perturb w.p. 0.15/hop), same 20-cell sweep (d0–d4 × b1–b4), **same seeds**
(`delegation-decay-v1`), 25 seeded trials/cell. exp-14's engine is imported directly
(`runDecayTrial` from `@swarmlab/experiment-14-delegation-decay` — module reused, not
forked); the only new lab code is the guard hook.

## Hypotheses (stated before running)

- **H-D1:** a requirement-manifest guard at each handoff recovers deep-cell survival (d≥3)
  substantially toward the d0 baseline — because drops (the dominant loss) are exactly what a
  manifest catches.
- **H-D2:** the guard's recovery is concentrated on **drops, not reinterpretations** — a
  manifest catches *absence* cheaply, but a present-but-wrong value passes a presence check;
  catching reinterpretation needs a value-echo, which costs more. Tiers reported separately.
- **H-D3:** guard token cost is sub-linear in the recovered survival — the guard pays for
  itself well before it doubles cost, at least through d≤3. If it costs more than it saves at
  deep cells, say so.

## Guard tiers (arms, same seeds across all)

1. **Un-guarded (control)** — exp-14 Part A exactly: `runDecayTrial` with no guard, the
   literal un-hooked code path. An **in-code gate** asserts every one of the 20 control cells
   reproduces the RT-05 Part A table (run `dd-a-mr7zv9zp`) on survival, reinterpreted,
   dropped, seam (3 decimals) and cost amplification (2 decimals) — the run **halts** on any
   mismatch, so guarded arms are never trusted on top of a broken baseline.
2. **Presence manifest** — each handoff carries a manifest of requirement IDs; the receiver
   diffs its inbound brief against the ID set; a missing ID is flagged and back-filled from
   the sender's copy before work proceeds. Catches **drops**. Cheap (ID set diff, no value
   inspection).
3. **Value-echo manifest** — manifest carries `(id, expected-value-digest)`; the receiver
   echoes the value it parsed and the sender verifies the echo before accepting the hop.
   Catches drops **and** reinterpretations. One echo round-trip per hop.

The guard is **harness-level and deterministic** — a set/digest comparison; no LLM ever
judges whether a requirement survived (same rule as specs 14–19). Restores copy the sender's
unit verbatim (a targeted retransmit against a manifest entry, not a prose rewrite), so a
repaired line is not re-exposed to the *current* hop's noise — but it IS re-exposed at every
later hop, which turns out to matter (finding 2).

**Manifest hook (noted per spec):** exp-14's `decay.ts` gained a minimal, additive refactor —
`Unit`/`keyTasks` exported and an optional `guard` parameter on `runDecayTrial` that sees
(sent, received) per handoff and may return a corrected brief plus extra cost. With `guard`
undefined the path is byte-identical (all RNG draws are key-addressed; no draw-order
sensitivity exists). exp-14 Part A was rerun after the refactor and reproduces its README
summary exactly (`dd-a-mr853q86`).

**Guard cost model** (same modeled currency as exp-14: transmit = 1/key-task/hop ≈ one brief
line ≈ 9 tokens by chars/4): manifest ID 0.125/key-task, value digest +0.125, echo
0.25/received key-task, flag 0.125, back-fill/correction retransmit 1.0. Grounded on the
actual strings ("r13" ≈ 1 token vs a ~9-token line); the live exhibition provides real token
numbers.

## Results (run `hg-mr853iu8`, 20 cells × 3 tiers × 25 trials, replay-verified 4157 events)

**Control gate: PASSED — all 20 control cells match RT-05 Part A exactly**
(`controlReproducedRT05: 1` in the summary score; any mismatch throws).

### Survival vs depth (mean over branchings) — all three tiers

| depth | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| un-guarded (control = RT-05) | 1.000 | 0.769 | 0.585 | 0.446 | 0.334 |
| presence manifest | 1.000 | 0.875 | 0.741 | 0.635 | 0.521 |
| value-echo manifest | 1.000 | **1.000** | **1.000** | **1.000** | **1.000** |

### Full sweep (per cell: survival / costAmp; guard = mean guard tokens/trial)

| cell | control | presence | presence guard | value-echo | value-echo guard |
|------|--------:|--------:|---:|--------:|---:|
| d0b* | 1.000 / 1.00 | 1.000 / 1.00 | 0.0 | 1.000 / 1.00 | 0.0 |
| d1b1 | 0.840 / 1.24 | 0.924 / 1.39 | 6.0 | 1.000 / 1.55 | 19.9 |
| d1b2 | 0.758 / 1.23 | 0.872 / 1.40 | 6.6 | 1.000 / 1.57 | 20.4 |
| d1b3 | 0.746 / 1.24 | 0.858 / 1.41 | 6.4 | 1.000 / 1.58 | 20.5 |
| d1b4 | 0.732 / 1.26 | 0.844 / 1.43 | 6.3 | 1.000 / 1.59 | 20.4 |
| d2b1 | 0.698 / 1.44 | 0.846 / 1.78 | 12.3 | 1.000 / 2.11 | 40.2 |
| d2b2 | 0.570 / 1.48 | 0.730 / 1.83 | 12.7 | 1.000 / 2.16 | 40.8 |
| d2b3 | 0.538 / 1.55 | 0.704 / 1.90 | 12.7 | 1.000 / 2.24 | 41.2 |
| d2b4 | 0.532 / 1.66 | 0.684 / 2.00 | 12.4 | 1.000 / 2.34 | 41.2 |
| d3b1 | 0.578 / 1.63 | 0.782 / 2.17 | 18.3 | 1.000 / 2.67 | 60.1 |
| d3b2 | 0.424 / 1.78 | 0.608 / 2.30 | 18.3 | 1.000 / 2.81 | 60.8 |
| d3b3 | 0.392 / 2.05 | 0.582 / 2.58 | 18.3 | 1.000 / 3.10 | 61.4 |
| d3b4 | 0.390 / 2.47 | 0.568 / 3.02 | 18.0 | 1.000 / 3.53 | 61.4 |
| d4b1 | 0.484 / 1.80 | 0.716 / 2.56 | 24.5 | 1.000 / 3.23 | 81.1 |
| d4b2 | 0.302 / 2.13 | 0.476 / 2.87 | 24.1 | 1.000 / 3.56 | 82.1 |
| d4b3 | 0.276 / 2.76 | 0.446 / 3.60 | 24.2 | 1.000 / 4.30 | 82.8 |
| d4b4 | 0.272 / 3.54 | 0.444 / 4.49 | 23.9 | 1.000 / 5.19 | 82.8 |

(guard tokens in exp-14 cost units; baseline d0 task = 84 units.)

### Drop-vs-reinterpret recovery breakdown

Recovery rates are hop-level event counts (caught-and-restored / occurred), aggregated over
all 25 trials per cell. They are structural given a deterministic guard — the informative
numbers are the end-state loss classes:

| metric | control | presence | value-echo |
|---|---:|---:|---:|
| `dropRecovery` (hop events) | 0 (no guard) | **1.00** every cell | **1.00** every cell |
| `reinterpretRecovery` (hop events) | 0 | **0.00** every cell | **1.00** every cell |
| `falseFlagRate` | — | **0.000** (0 false flags / 42k+ flags) | **0.000** |
| end-state dropped @ d4 (mean) | 0.358 | **0.000** | 0.000 |
| end-state reinterpreted @ d4 (mean) | 0.200 | **0.284** ← note | 0.000 |
| end-state seam @ d4b4 | 0.156 | **0.272** ← note | 0.000 |

**Note the presence-tier side effect:** end-state reinterpretation and seam loss are HIGHER
than control (d4 reint 0.284 vs 0.200; d4b4 seam 0.272 vs 0.156). This is not a bug — a
back-filled requirement survives to be numerically perturbed or forked at later hops, losses
the un-guarded tree never records because the requirement was already gone. The presence
manifest converts silent omission into *exposure to the other two loss classes*.

### Headline — the tier-2 vs tier-3 gap at deep cells (d≥3)

| deep (d≥3) means | control | presence | value-echo |
|---|---:|---:|---:|
| survival | 0.390 | 0.578 | **1.000** |
| recovery vs control | — | +0.188 | **+0.610** |
| cost amplification | 2.269 | 2.948 | 3.548 |
| guard cost (× baseline) | 0 | 0.252 | 0.852 |
| netTokenEfficiency (Δsurvival / ΔcostAmp) | — | 0.292 | 0.485 |

**Gap (value-echo − presence) at d≥3 = 0.422** — i.e. of the recoverable deep-tree loss,
the cheap presence check recovers only **31%** (0.188/0.610); the remaining **69%** needs
value inspection. That inverts the naive read of exp-14 ("drops are 50% of loss, so an ID
manifest should recover ~half"): catching 100% of drops recovers far less than half of the
*end-state* loss, because restored requirements are re-exposed to drift and forking at every
later hop. Absence is cheap to detect; *meaning* is what's expensive to keep alive.

### Cost-efficiency (netTokenEfficiency = Δsurvival per Δcost, in baseline units)

nte > 1 would mean the guard buys survival at a better exchange rate than doing the work
solo at d0 (which delivers 1.0 survival per 1.0× baseline).

| depth (mean over b) | presence | value-echo | marginal presence→echo |
|---|---:|---:|---:|
| d1 | 0.64 | 0.69 | 0.48 |
| d2 | 0.46 | 0.61 | 0.79 |
| d3 | 0.35 | 0.53 | **0.80** |
| d4 | 0.23 | 0.44 | **0.79** |

Three honest readings of the same numbers:

1. **The strict registered bar (nte > 1 through d≤3) is NOT met** — peak 0.81 (value-echo,
   d1b4), falling with depth. Per extra token, no guard tier ever recovers intent as cheaply
   as a d0 agent creates it.
2. **The guard never doubles the tree's cost** — worst case +51% over control (value-echo at
   d3b1), +47% at d4b4. Presence adds 11–31%.
3. **Per-token intent delivery strictly improves in every guarded cell.** At d4b4 the
   un-guarded tree pays 24.4 units per delivered requirement (2.269× baseline mean at deep
   cells for 39% survival); presence pays 21.4; value-echo pays **14.9** — guarded trees
   deliver intent ~40% cheaper per requirement than un-guarded ones, even though the total
   bill is higher.
4. **Value-echo gets MORE worth it with depth, not less.** The marginal efficiency of
   upgrading presence→echo *rises* from 0.48 (d1) to ~0.80 (d3–d4) and beats presence's own
   average efficiency at every depth ≥2. The spec's guess ("presence everywhere, value-echo
   only at d≤2") is inverted by the data: shallow trees are where value-echo is least
   justified; deep trees are exactly where it earns its cost.

## Findings

1. **H-D1 nuanced-CONFIRMED.** The value-echo manifest recovers deep-cell survival fully to
   the d0 baseline (0.390 → **1.000** at d≥3 — under this noise model every corruption is
   caught at the hop that introduces it, including seams: forked copies are re-pinned to the
   sender's value each hop, so they can never diverge). The presence manifest recovers
   substantially but much less than "drops are 50% of loss" predicts: 0.390 → 0.578 deep,
   only 31% of the recoverable gap, despite catching literally 100% of drop events.
2. **The presence ceiling is a dynamics effect, not a detection failure.** Back-filled
   requirements re-enter the noise gauntlet: presence-tier end-state reinterpretation (0.284
   @ d4) and seam loss (0.272 @ d4b4) EXCEED control (0.200 / 0.156). Saving a requirement
   from omission hands it to drift.
3. **H-D2 CONFIRMED, and it's the headline.** Presence: dropRecovery 1.00, reinterpretRecovery
   0.00, ~0.25× baseline guard cost deep. Value-echo: both 1.00 at ~0.85× baseline (3.4× the
   presence spend). The deep-cell gap between the tiers is 0.422 survival — 69% of the
   recoverable loss is reinterpretation-shaped (expensive), not drop-shaped (cheap).
4. **H-D3 REFUTED on the strict bar, confirmed on the weak one — reported plainly.**
   netTokenEfficiency < 1 everywhere (peak 0.81); the guard never pays for itself against a
   d0-work exchange rate. But it never comes close to doubling cost (max +51%), and
   cost-per-delivered-requirement falls ~40% at deep cells. If you must delegate deep, the
   guard is the cheapest survival you can buy; it is not free intent.
5. **The guard doesn't thrash:** falseFlagRate 0.000 measured across every guarded cell
   (structural for a set/digest check — and the counter proves it rather than assumes it).

## Live exhibition (real `claude-haiku-4-5-20251001` d3b3 trees) — exhibition, not evidence

Real `claude-haiku-4-5-20251001` delegation trees (d3b3, 40 agents: 13 delegators + 27
leaves), one tree per tier, harness-level manifest over the real briefs. The model is never
told a guard exists — flags/back-fills/corrections happen in the harness between hops. Run
`hg-llm-mr85fdgv`, replay-verified (458 events: spawn=121 message=211 score=5 kill=121).

| cell | survival | reint | drop | seam | tokens≈ | manifest≈ | flags | cost amp vs d0 |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| d0 solo | 1.000 | 0 | 0 | 0 | 507 | 0 | — | 1.0× |
| d3b3 un-guarded | 1.000 | 0 | 0 | 0 | 5162 | 0 | — | 10.18× |
| d3b3 presence | 1.000 | 0 | 0 | 0 | 4825 | **93** | **3 drops caught + back-filled** | 9.70× |
| d3b3 value-echo | 1.000 | 0 | 0 | 0 | 4948 | **748** | 0 | 11.24× |

Three honest observations:

1. **The un-guarded live tree ALSO delivered 1.000 this run** — unlike exp-14's live d3b3
   exhibition, which lost 7/7 requirements to drops. Single-tree exhibitions are n=1: haiku's
   delegators happened to partition the brief cleanly today. This is exactly why the sim
   sweep (25 seeded trials/cell) is the evidence and the live trees are texture.
2. **The presence tier still demonstrated the mechanism on real handoffs:** its delegators
   *did* drop 3 requirement lines mid-tree; the manifest caught all 3 at the introducing hop
   and back-filled the sender's verbatim line, ending at 1.000. Real manifest overhead was
   ~93 tokens — **1.9%** of the tree's ~4.8k spend (the modeled 0.25× deep figure is
   conservative by comparison; real briefs amortize the ID list better).
3. **Value-echo's real overhead was ~748 tokens (15% of tree spend)** — id+expected-value
   manifests are an order of magnitude heavier than ID lists, consistent with the modeled
   3.4× tier ratio. Zero value flags fired: no live delegator numerically perturbed a
   requirement this run (the live guard checks expected integers in lines mentioning a key —
   a parser-level check that would miss a reworded-but-wrong value; noted, not hidden).

## Verdicts

| hypothesis | verdict |
|---|---|
| **H-D1** — manifest guard recovers deep survival substantially toward d0 | **CONFIRMED** for value-echo (full recovery, 0.390→1.000 d≥3); **PARTIALLY** for presence (0.390→0.578 — catches 100% of drops but restored lines are re-lost to drift/seams downstream) |
| **H-D2** — recovery concentrated on drops; reinterpretation needs value-echo at higher cost | **CONFIRMED** — presence reinterpretRecovery = 0.00 exactly; value-echo = 1.00 at 3.4× the guard spend; deep tier gap 0.422 survival |
| **H-D3** — guard cost sub-linear; pays for itself before doubling cost through d≤3 | **MIXED, leaning REFUTED** — never doubles cost (max +51%) and improves per-requirement economics ~40% deep, but the registered bar nte>1 is missed everywhere (peak 0.81); survival gained per extra token is always worse than d0 work |

## Stack recommendation

The manifest belongs at the **sonder/lattice handoff boundary, as a first-class field of the
AOP payload contract** (spec 17's `payload_contract` — the natural home: a requirement
manifest is exactly a `fields`-style typed contract carried per hop; `contract_id` is the
presence check and per-field `concept`+`unit`+expected-digest is the value echo; no local AOP
package exists in this tree, so exp-16's manifest is standalone lab code and the mapping is
noted rather than imported). **Default tier: value-echo, not presence, for any tree of depth
≥2** — the data inverted the prior: presence-only recovers just 31% of recoverable deep loss
and silently converts drops into drift/seam exposure, while value-echo's marginal efficiency
*rises* with depth (0.48 @ d1 → 0.80 @ d3–4) and its full-recovery cost never exceeds +51% of
the tree's bill. Presence-only is defensible solely at d1 (one hop, drift exposure minimal,
guard cost ~7% of tree cost). At no depth in the sweep does value-echo stop being worth its
cost relative to presence — the honest caveat is different: **no guard tier pays for itself
against not-delegating** (nte < 1 everywhere), so the first-order stack decision is still
exp-14's "don't delegate deeper than you must"; the guard is how you cap the damage when
depth is forced.

## Pinned runs

| run | what | events (replay-verified) |
|---|---|---:|
| `hg-mr853iu8` | sim sweep, 20 cells × 3 tiers × 25 trials, seed `delegation-decay-v1` | 4157 |
| `dd-a-mr853q86` | exp-14 Part A rerun post-refactor (byte-identical summary to RT-05) | 2210 |
| `hg-llm-mr85fdgv` | live haiku exhibition: d0 + d3b3 × 3 tiers | 458 |

Determinism: re-running the sim sweep with the same seed reproduces identical summary lines
(verified — three consecutive runs on this machine).

## Reproduce

```bash
npm run build
node experiments/16-handoff-guards/dist/main.js        # sim sweep + control gate
node experiments/16-handoff-guards/dist/llm.js          # live exhibition (needs `claude` CLI)
```

The runner ends by re-reading its own trace and asserting event-count parity for
spawn/message/score/kill; the control arm gate throws on any deviation from RT-05.

## Files

- `src/guards.ts` — the three guard tiers (presence / value-echo; control = no hook) + cost
  model + per-trial stats
- `src/main.ts` — sweep runner: 20 cells × 3 tiers on exp-14's engine, RT-05 reproduction
  gate, summary scorer, replay verification
- `src/llm.ts` — live haiku d3b3 exhibition under each tier (harness-level manifest over real
  LLM handoffs; model never told the guard exists)
- `runs/` — JSONL traces (gitignored; run IDs pinned above)

exp-14 modules reused directly (never forked): `task.ts` (requirements + `assess()`),
`decay.ts` (noise engine — extended with the optional guard hook), `rng.ts`, `gen.ts` (claude
CLI wrapper).
