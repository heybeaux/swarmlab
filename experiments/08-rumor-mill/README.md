# 08 — The Rumor Mill

**Faculty tested: Engram** (information decay / propagation across a memory mesh).

Plant one fact in a single node of a gossip mesh where each node can only talk to a
handful of neighbors. Watch it spread epidemic-style — and watch it **mutate** as it's
retold hop-by-hop. Coverage is the story everyone tells; fidelity is the one they don't.

Full brief: [`specs/08-rumor-mill.md`](../../specs/08-rumor-mill.md).

## What it models

A fact is a fixed-length vector of `tokenCount` symbols. It's planted in one node of a
**Watts–Strogatz small-world mesh** (ring lattice + random rewiring). Every round, each
informed node picks `fanout` neighbors at random and **retells** its held version — and a
retelling is a **lossy re-encode**: each token independently drifts to a wrong symbol with
probability `mutationRate`. Fidelity = fraction of tokens still matching ground truth.

Two rules make it bite:

- **First-write-wins adoption.** A node keeps whatever version it *first* heard. Later,
  possibly-more-faithful retellings never overwrite it. (Engram's "memory is sticky".)
- **Mutation on the wire.** Drift accumulates per hop, so distance from the seed compounds
  corruption — the telephone gradient.

The sweep crosses **fanout** `{1,2,3}` × **mutationRate** `{0, 0.02, 0.05, 0.1}` ×
**size** `{30,60,120}`, 30 seeded trials per cell. Trial 0 of each cell spawns node agents
through `core` and puts every retelling + end-of-round snapshot on the bus, so the run
replays in the observatory.

## Run it

```bash
npm run build
node experiments/08-rumor-mill/dist/main.js
```

Knobs (env): `RUMOR_TRIALS`, `RUMOR_SEED`, `RUMOR_DEGREE`, `RUMOR_REWIRE`, `RUMOR_TOKENS`,
`RUMOR_ALPHABET`, `RUMOR_SATURATION`, `RUMOR_MAXROUNDS`. Output is a JSONL trace under
`runs/`; the harness re-reads it with `replay()` and asserts event-count parity.

## What I observed

The run separates the two axes people conflate — *did it reach everyone* vs *is it still
true* — and the gap between them is the whole finding.

1. **Coverage always wins; fidelity does not.** Every single cell saturates (coverage
   ≥ 0.99, `saturationRate=1.00` across all 36 cells). But at `mutationRate=0.1`, N=120,
   the fact reaches everyone while the *typical held version is only 0.57 faithful* — a
   coin-flip's worth of the original truth survives. **19 of 36 cells** hit full coverage
   with sub-0.90 fidelity (`coverageOutrunsTruth=19`). "Everybody has heard it" is not the
   same claim as "everybody knows it," and a mesh that only tracks coverage will report a
   healthy green while shipping a corrupted memory to the entire network.

2. **Higher fanout buys speed AND fidelity — not a trade.** I braced for the obvious
   telephone intuition: more retellings = more mutation opportunities = faster but sloppier.
   The data says the opposite. Raising fanout 1→3 cuts mean time-to-saturation by **8.6
   rounds** (`fanoutTtsDelta=-8.581`) *and* slightly *raises* fidelity at saturation
   (`fanoutFidelityDelta=+0.038`). The mechanism is the sticky first-write rule: with high
   fanout the fact reaches far nodes via **shorter paths**, and shorter paths mean fewer
   hops of accumulated drift. Fidelity is governed by *path length to first contact*, not
   by total message volume — so pushing harder makes the memory both faster and truer.

3. **The telephone gradient is real and measured.** Fidelity falls with graph distance from
   the seed: near-hop (≤2) beats far-hop by **+0.113** on average across noisy cells
   (`telephoneGradient=0.113`). At m=0.1/N120 the seed's neighborhood holds 0.77 while the
   far mesh holds 0.54. The corruption isn't uniform noise — it's a *spatial gradient*
   radiating out from the source, exactly the epidemic-decay shape.

4. **Bigger meshes decay harder.** At fixed noise, growing N from 30→120 drops
   fidelity-at-saturation at every fanout (e.g. m=0.1, fanout=1: 0.70 → 0.65 → 0.57),
   because a larger graph has a longer diameter — more hops between seed and the far rim,
   so more compounded drift before the frontier is reached.

**The Engram lesson.** Coverage and fidelity are orthogonal, and a gossip-backed memory
mesh that measures only propagation is blind to silent corruption — the fact can be
*everywhere* and *wrong* at the same time. Two design directives fall out. First, **push
fidelity by shortening paths, not by damping spread**: higher fanout (or seeded shortcuts /
super-nodes near the source) reaches the rim in fewer hops and is therefore *more* faithful,
so throttling gossip to "protect" a memory is exactly backwards. Second, **first-write-wins
is the villain** — sticky adoption freezes early-hop corruption permanently; Engram needs a
reconciliation / anti-entropy pass (versioned facts, confidence-weighted overwrite, or a
checksum the mesh can vote on) so a node that adopted a mangled early version can be healed
by a truer one later. Without that, distance from the source is a permanent tax on truth.
The trace is honest: a real result, no cell faked green.

## Live-LLM applicability (sim-only — honest)

**No genuine LLM seam.** The finding — coverage and fidelity are orthogonal, and corruption
radiates as a spatial gradient from the seed under first-write-wins adoption — is a property
of the *mesh topology and the per-hop noise parameter*, not of any node's reasoning. Each
node here is a bit-vector fact mutated by a seeded corruption probability; substituting a
real haiku to "retell" the fact per hop would just be a slower, noisier random mutator and
would not change what the experiment measures (the epidemic-decay shape and the
distance-from-source tax). Per the honesty rule we run it as a deterministic sweep rather
than stage a decorative model call. The Engram lesson (anti-entropy / versioned facts to heal
early-hop corruption) rests on the sim.
