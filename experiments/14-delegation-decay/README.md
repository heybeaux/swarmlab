# Experiment 14 — Delegation Decay & Trust Routing

**Question.** What actually degrades when work is delegated down a tree of agents — and does a
persistent, verified capability memory (Engram) fix the one failure a transcript can't survive:
forgetting who to trust?

Two parts, one experiment:

- **Part A — delegation decay.** One root task with 20 machine-verifiable requirements, delegated
  down trees of depth d ∈ {0..4} × branching b ∈ {1..4}. Noise lives in the *handoffs*
  (exp-01-calibrated drop/reinterpretation per brief-writing hop). What fraction of intent
  survives, what kind of loss dominates, and what does the tree cost?
- **Part B — trust routing.** A root delegates 30 sequential rounds of `quota-policy` work across
  6 workers, one of which (`mercury`) reliably fails that task class — a harness-level handicap
  invisible to the root. Three memory arms, same seeds: amnesiac, in-context (windowed
  transcript), and an Engram-backed capability store built on the **real shipped**
  `@openengram/reconciliation` module (`file:` dep, never reimplemented). Kill the root
  mid-run; hand the store to a brand-new root at the end. Who keeps re-hiring the incompetent?

## Hypotheses

- **H-A:** requirement survival decays with depth; at d≥2 the dominant loss is *integration
  mismatch between siblings*, not subtask failure.
- **H-B1:** a memoryless root re-delegates to the incapable agent at chance (~1/6) forever.
- **H-B2:** an Engram-backed root converges to ~0 incapable selections within a handful of
  rounds, and the knowledge survives a root restart AND transfers to a brand-new root.

Everything is scored by harness assertions — no LLM ever judges success. Honest numbers, red or
green.

---

## Part A — delegation decay

### Design

- **Task:** one config artifact, N=20 requirements — 12 unary (`config[key] === value`) and 8
  relational (`config[keyA] === config[keyB] + offset`), 28 distinct keys (`src/task.ts`).
- **Handoff noise (`src/decay.ts`),** calibrated to exp-01's sim (telephone-compiler): each brief
  line is independently **dropped w.p. 0.08/hop** and **numerically perturbed w.p. 0.15/hop**
  when a delegator writes a child's brief. Leaves execute their (possibly corrupted) brief
  faithfully; reassembly is mechanical.
- **The integration seam:** a relational requirement travels as ONE brief line while its two keys
  are co-located — drift shifts both sides together and the *relation* survives. The moment a
  partition splits the pair across siblings, the shared parameter **forks into two independent
  copies**, and independent drift breaks the relation. `assess()` classifies a broken relation
  with both keys present as `integration` iff the pair was forked, else `reinterpreted` —
  attribution is mechanical, not judged.
- **Determinism / comparability:** every draw comes from a hash-keyed stream
  (seed, trial, purpose, requirement, role, level) — the same trial seed produces the same
  per-requirement fates in every cell that reaches the same hop. Cross-cell contrasts are
  literal same-seed comparisons.
- **Cost model:** transmit=1/key-task/hop, work=3/key-task, merge=1/child;
  baseline (d=0) = 84 units.
- **Sweep:** 20 cells (d0–d4 × b1–b4) × 25 seeded trials, seed `delegation-decay-v1`. Trial 0 of
  each cell is the exhibition trial: the whole tree spawned through core, every brief handoff and
  leaf fragment on the bus.

### Results (run `dd-a-mr7zv9zp`, 25 trials/cell, replay-verified 2210 events)

| cell | survival | reinterpreted | dropped | seam (integration) | cost× |
|------|---------:|--------------:|--------:|-------------------:|------:|
| d0b1–d0b4 | 1.000 | 0.000 | 0.000 | 0.000 | 1.00 |
| d1b1 | 0.840 | 0.076 | 0.084 | 0.000 | 1.24 |
| d1b2 | 0.758 | 0.076 | 0.120 | 0.046 | 1.23 |
| d1b3 | 0.746 | 0.076 | 0.118 | 0.060 | 1.24 |
| d1b4 | 0.732 | 0.076 | 0.118 | 0.074 | 1.26 |
| d2b1 | 0.698 | 0.132 | 0.170 | 0.000 | 1.44 |
| d2b2 | 0.570 | 0.132 | 0.216 | 0.082 | 1.48 |
| d2b3 | 0.538 | 0.132 | 0.224 | 0.106 | 1.55 |
| d2b4 | 0.532 | 0.132 | 0.220 | 0.116 | 1.66 |
| d3b1 | 0.578 | 0.182 | 0.240 | 0.000 | 1.63 |
| d3b2 | 0.424 | 0.182 | 0.286 | 0.108 | 1.78 |
| d3b3 | 0.392 | 0.182 | 0.298 | 0.128 | 2.05 |
| d3b4 | 0.390 | 0.182 | 0.294 | 0.134 | 2.47 |
| d4b1 | 0.484 | 0.200 | 0.316 | 0.000 | 1.80 |
| d4b2 | 0.302 | 0.200 | 0.364 | 0.134 | 2.13 |
| d4b3 | 0.276 | 0.200 | 0.378 | 0.146 | 2.76 |
| d4b4 | 0.272 | 0.200 | 0.372 | 0.156 | 3.54 |

(reinterpreted/dropped/seam are fractions of the 20 requirements, mean of 25 trials.)

**Depth vs survival (mean over branchings):**

| depth | 0 | 1 | 2 | 3 | 4 |
|-------|---|---|---|---|---|
| survival | 1.000 | 0.769 | 0.585 | 0.446 | 0.334 |

**Loss decomposition at d≥2, b≥2 (the "deep tree with real siblings" regime):**

| loss class | mean fraction | share of all loss |
|------------|--------------:|------------------:|
| dropped (silent omission) | 0.295 | **50%** |
| reinterpreted (drifted values) | 0.171 | 29% |
| integration seam (forked pairs diverging) | 0.123 | **21%** |

### Part A findings

1. **Decay is real and steep.** Survival falls ~1.9× per two levels of depth: 100% → 58.5% (d2)
   → 33.4% (d4). Depth is the dominant axis; branching adds a second, smaller penalty
   (d2: 0.698 at b1 → 0.532 at b4) that is *entirely* seam loss — b=1 columns show seam=0.000 at
   every depth (no siblings, nothing to fork), a clean internal control.
2. **H-A's second clause is REFUTED.** At d≥2/b≥2 the dominant loss class is **silent omission
   (50% of losses), not the integration seam (21%)**. The seam is real, mechanically attributable,
   and grows with both depth and branching — but plain "a requirement fell out of a brief
   rewrite" kills more than twice as much intent. Under exp-01's measured noise profile
   (drop 0.08 vs reinterpret 0.15 per hop), compounding omission beats sibling divergence.
3. **The tree costs more as it delivers less.** Cost amplification reaches **3.54×** at d4b4
   while survival is 27% — you pay 3.5 baselines to destroy 73% of the intent.

---

## Part B — trust routing

### Design

- **Pool:** 6 workers with equally-plausible blurbs (`src/trust.ts`); `mercury` reliably fails
  the `quota-policy` class (harness handicap, invisible to the root). Capable workers have a
  5% transient failure rate — same env draws across arms, keyed per (trial, round, worker).
- **R=30 rounds,** one delegation per round. Failed rounds show a failed harness assertion.
- **Failure styles (separate sub-arms):** `loud` failures are visible before the next decision;
  `confident-wrong` output *looks fine* and only fails downstream — detection lags one extra
  round and burns +10 integration tokens per bad round.
- **Arms (same seeds, same env draws):**
  1. **amnesiac** — fresh context each round; uniform choice.
  2. **incontext** — transcript truncated to the last **10 rounds** (realistic window); avoids
     workers whose *windowed* failures exceed successes.
  3. **engram** — every observed outcome is written as a capability observation
     (`cap:{worker}:quota-policy`) through the **real** `makeVersionedFact` / `reconcile` /
     `verifyFact` from `@openengram/reconciliation`; reads back verified summaries before
     choosing; same exclusion rule as arm 2, but over the *cumulative* store. Observations carry
     round, failed assertion, and an evidence digest — the `verification_tier=provenance` path
     (the root directly measured what it recorded).
- **Reset probe:** the root is killed and restarted between rounds 15/16. The in-context
  transcript dies with the session; the store is external and persists.
- **Transfer probe:** at round 30 a **brand-new root** (fresh identity, zero context) makes one
  delegation choice. Arms 1–2 have nothing to read; arm 3 reads the store.
- 50 seeded trials per condition (spec floor: 25), seed `trust-routing-v1`. Trial 0 per condition
  is the exhibition trial (root + 6 workers spawned through core, every choice/outcome on the bus).

### Results (run `dd-b-mr7zvbuu`, 50 trials/condition, replay-verified 470 events)

| arm × style | late selection rate (r25–30) | convergence round | wasted tokens | post-reset incapable rate | transfer avoid rate |
|---|---:|---:|---:|---:|---:|
| amnesiac · loud | 0.183 | never | 73 | 0.18 | 0.80 |
| amnesiac · confident-wrong | 0.177 | never | 121 | 0.18 | 0.86 |
| incontext · loud | 0.087 | never | 35 | 0.14 | 0.84 |
| incontext · confident-wrong | 0.093 | never | 69 | 0.20 | 0.88 |
| **engram · loud** | **0.000** | **9** | **15** | **0.00** | **1.00** |
| **engram · confident-wrong** | **0.003** | **11** | **30** | **0.00** | **1.00** |

Convergence = first round from which incapable-selection stays ≤0.05 for a sustained (≥3-round)
tail. Chance rate is 1/6 ≈ 0.167; blind transfer-avoid chance is 5/6 ≈ 0.833.

**Selection-of-mercury curves (fraction of 50 trials, rounds 1→30):**

```
amnesiac-loud      0.12 0.22 0.18 0.20 0.16 0.16 0.08 0.26 0.06 0.08 0.12 0.16 0.22 0.20 0.26 | 0.18 0.22 0.16 0.08 0.14 0.14 0.08 0.12 0.16 0.14 0.18 0.20 0.18 0.28 0.12
amnesiac-cw        0.10 0.14 0.18 0.22 0.20 0.16 0.12 0.16 0.16 0.16 0.14 0.10 0.14 0.18 0.14 | 0.18 0.22 0.18 0.14 0.08 0.14 0.14 0.24 0.14 0.12 0.10 0.22 0.26 0.24 0.12
incontext-loud     0.18 0.20 0.06 0.04 0.12 0.04 0.02 0.10 0.06 0.04 0.04 0.04 0.12 0.02 0.12 | 0.14 0.10 0.16 0.02 0.02 0.04 0.04 0.04 0.04 0.04 0.06 0.12 0.10 0.10 0.10
incontext-cw       0.26 0.12 0.14 0.10 0.12 0.10 0.08 0.08 0.10 0.00 0.02 0.08 0.10 0.10 0.10 | 0.20 0.04 0.10 0.06 0.10 0.10 0.02 0.04 0.02 0.02 0.10 0.12 0.12 0.12 0.08
engram-loud        0.26 0.10 0.10 0.14 0.06 0.04 0.10 0.12 0.00 0.02 0.04 0.00 0.02 0.00 0.00 | 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00
engram-cw          0.16 0.22 0.18 0.20 0.08 0.10 0.06 0.02 0.02 0.06 0.04 0.00 0.00 0.00 0.00 | 0.00 0.00 0.00 0.00 0.00 0.04 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.02
                                                                                    reset ↑ (root killed after r15)
```

**Reconciliation accounting (real module, per engram condition, 1500 writes):** 300 `adopted`
(first fact per worker per trial), 1200 `healed` (verified newer version replacing verified
stale copy — the module's re-authoring path), 0 `kept`, 0 `rejected_corrupt`. Transfer-probe
evidence rate: **1.00** in both engram sub-arms — the new root always found a verified fact
showing mercury's failures.

### Part B findings

1. **H-B1 CONFIRMED.** The amnesiac root re-hires mercury at ~chance forever: late-window rate
   0.183 / 0.177 vs chance 0.167, flat curves, no convergence, and the post-reset and transfer
   probes sit at chance too. Every failure is re-discovered from scratch — 73 wasted tokens
   (loud) rising to 121 when failures are confident-wrong.
2. **H-B2 CONFIRMED in substance, with one honest correction.** The engram root converges to
   0.000 late-selection, survives the reset (0.00 post-reset vs 0.14–0.20 for in-context), and
   the transfer probe is **1.00 avoid with 1.00 evidence** — a brand-new root that never saw a
   single failure reads the store and never once hires mercury (arms 1–2 sit at blind chance
   ≈0.83). *The correction:* convergence lands at round **9–11**, not "a handful" (≤5). With 6
   workers explored uniformly plus 1–2 rounds of detection lag, ≤5 is mathematically unreachable
   under this design — the store converges at roughly the exploration floor. The post-convergence
   blips in the engram-cw curve (0.04 @ r21, 0.02 @ r30) are trials where mercury *had never yet
   been sampled* — no fact exists, so it's still eligible; that's exploration cost, not memory
   failure.
3. **In-context memory is better than nothing and worse than it looks — and the window is why.**
   Inside its 10-round window arm 2 suppresses mercury to ~0.09, half of chance — but it **never
   converges**: evidence ages out of the window, mercury becomes eligible again, and the root
   re-hires it in waves (visible as 0.10–0.16 ridges in the curve). After the reset it's
   indistinguishable from amnesiac (0.14–0.20 ≈ chance), and at transfer it has nothing to hand
   over (0.84–0.88 ≈ blind chance). If arm 2 had matched arm 3 inside the window we'd say so —
   it doesn't; it loses on all three probes.
4. **Confident-wrong failure is strictly worse everywhere, reported separately as promised.**
   Detection lag slows engram convergence 9→11; wasted tokens double in every arm (73→121
   amnesiac, 35→69 incontext, 15→30 engram) because every bad round also burns integration
   effort downstream. Memory shrinks the confident-wrong tax (engram pays 30 total vs amnesiac's
   121) but nothing eliminates the first few bad rounds before evidence exists.
5. **Honesty stat — the exclusion rule has a real cost.** `capableExcluded` (capable workers shut
   out at end-of-run because transient failures outweighed successes in the visible record)
   averages **0.22 workers/trial for engram** and 0.14–0.22 for incontext. A cumulative
   failures>successes rule with no forgiveness or recency weighting permanently benches a capable
   worker who stumbled early and was never re-sampled. The store fixes *forgetting*; it does not
   fix *unforgiving priors*. A production trust router needs decay/forgiveness on top.

---

## Live exhibition (real `claude-haiku-4-5-20251001` trees) — exhibition, not evidence

One trial per cell, real trees spawned through core (run `dd-llm-mr8042v5`, 184 events,
replay-verified). Delegators receive plain requirement lines and must split + restate them for
their children; leaves emit config JSON; reassembly and fork detection are mechanical;
`assess()` classifies. Token proxy = chars/4 over all prompts+responses.

| cell | agents | survival | reinterpreted | dropped | seam | tokens≈ | cost vs d0 |
|------|-------:|---------:|--------------:|--------:|-----:|--------:|-----------:|
| d0 (solo) | 1 | 1.000 | 0 | 0 | 0 | 507 | 1.00× |
| d2b2 | 7 | 1.000 | 0 | 0 | 0 | 1,892 | 3.73× |
| d3b3 | 40 | **0.650** | 0 | **7** | 0 | 4,738 | **9.35×** |

What the live trees showed:

- **The failure mode matches the sim's headline finding.** All 7 lost requirements at d3b3 are
  **silent drops** (`http_port`, `log_level`, `max_connections`, and 4 of the 8 relational
  pairs) — zero reinterpretations, zero seam breaks. Haiku copies numbers *faithfully* when a
  line survives; what it does under depth×branching pressure is lose whole lines while
  splitting a brief three ways, twice in a row.
- **Forking happened live but didn't diverge.** Two relational pairs (r13, r19) had their keys
  land on different leaves — the seam precondition — but both copies stayed consistent because
  the model doesn't perturb values it retains. The sim's seam loss requires *drift on top of
  forking*; one live trial at faithful-copy temperature shows the fork without the break.
- **The shallow tree was lossless; cost was not.** d2b2 preserved all 20 requirements but paid
  3.7× baseline tokens for it; d3b3 paid 9.3× to deliver 65%. The cost curve is much steeper
  live than in the sim's cost model (3.5× at d4b4) because every delegator restates the full
  text of every brief line it forwards.
- Caveats, honestly: 1 trial/cell, one model, one task; the sim sweep is the instrument.
  Haiku's one-shot brief-splitting is visibly *less* noisy per hop than exp-01's measured
  10-round spec→code→spec drift, so treat the live numbers as a floor on decay, not an
  estimate.

---

## Verdicts

| hypothesis | verdict |
|---|---|
| **H-A** — survival decays with depth | **CONFIRMED** — 1.000 → 0.334 across d0→d4 |
| **H-A** — at d≥2 dominant loss is the sibling integration seam | **REFUTED** — silent omission dominates (50% of losses vs seam's 21%); seam is real and grows with b, but drops kill more |
| **H-B1** — memoryless root re-delegates at chance forever | **CONFIRMED** — 0.177–0.183 late rate vs 0.167 chance, flat for 30 rounds |
| **H-B2** — Engram root converges to ~0, survives reset, transfers | **CONFIRMED** (convergence at r9–11, not ≤5 — the uniform-exploration floor; 0.000 late, 0.00 post-reset, 1.00 transfer-avoid with 1.00 evidence) |

**The deliverable number:** arm-3 transfer-avoid = **1.00 (loud) / 1.00 (confident-wrong)**, with
verified evidence present in 100% of transfer reads — capability knowledge written as provenance-
tier VersionedFacts through the real reconciliation module outlives the agent that learned it.

## Pinned runs

| run | what | events (replay-verified) |
|---|---|---:|
| `dd-a-mr7zv9zp` | Part A sim sweep, 20 cells × 25 trials, seed `delegation-decay-v1` | 2210 |
| `dd-b-mr7zvbuu` | Part B sim sweep, 6 conditions × 50 trials, seed `trust-routing-v1` | 470 |
| `dd-llm-mr8042v5` | live haiku exhibition, d0 + d2b2 + d3b3 (1 trial/cell) | 184 |

Determinism: re-running both sim sweeps with the same seeds reproduces byte-identical summary
lines (verified on this machine).

## Reproduce

```bash
npm run build
cd experiments/14-delegation-decay
DECAY_TRIALS=25 node dist/maina.js   # Part A sweep
TRUST_TRIALS=50 node dist/mainb.js   # Part B sweep
node dist/llm.js                     # live exhibition (needs `claude` CLI)
```

Both runners end by re-reading their own trace and asserting event-count parity for
spawn/message/score/kill — a run that doesn't replay identically throws.

## Files

- `src/task.ts` — the 20-requirement task + mechanical `assess()` classifier
- `src/decay.ts` — Part A engine (handoff noise, pair forking, cost model)
- `src/maina.ts` — Part A sweep runner (20 cells, exhibition trial 0, summary scorer)
- `src/trust.ts` — Part B engine (worker pool, arms, capability store on the real
  `@openengram/reconciliation`, reset + transfer probes)
- `src/mainb.ts` — Part B sweep runner (6 conditions, curves, summary scorer)
- `src/gen.ts` / `src/llm.ts` — live haiku exhibition (claude CLI, `--tools ""`, empty temp cwd)
- `runs/` — JSONL traces (gitignored; run IDs pinned above)
