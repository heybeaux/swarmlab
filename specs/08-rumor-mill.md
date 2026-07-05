# 08 — The Rumor Mill

> Plant one fact in a single node of a **gossip mesh**. Each node can only talk to a
> handful of neighbors. Measure how the fact **propagates** across the mesh AND how it
> **mutates** as it's retold hop-by-hop — telephone-style.
> **Faculty tested: Engram** (information decay / propagation across a memory mesh).

## The question

Gossip protocols are how a decentralized memory mesh reaches everyone without a central
broker: each node forwards what it heard to a few random neighbors, epidemic-style, and
eventually the whole network has "heard." That's the coverage story, and it's the one
everybody tells. The story nobody tells is **fidelity**: a fact doesn't travel as an
immutable packet, it travels as a *retelling*. Each hop is a lossy re-encode, so the
version that finally saturates the mesh can be a mangled descendant of what was planted.
This experiment asks: **as a fact propagates through a gossip mesh, how far does it get,
how fast — and how much of the original truth is left by the time everyone has heard?**

Specifically:
- **Coverage over time** — what fraction of the mesh has heard *some* version, per round.
- **Time-to-saturation** — rounds until (near-)everyone has heard.
- **Fidelity at saturation** — how accurate the *typical* held version is once coverage
  is high. Coverage and fidelity are different axes: everyone can have heard a lie.
- **Fanout's speed↔fidelity trade** — a higher fanout saturates faster but each extra
  retelling is another mutation opportunity, so speed may be *bought* with accuracy.
- **Hop-distance decay** — does fidelity fall monotonically with graph distance from the
  seed (the telephone gradient), or does coverage outrun the decay?

## Model

A single trial:

1. **Graph.** Build an undirected neighbor graph over `N` nodes (a ring-lattice with each
   node wired to its `2·degree` nearest ring-neighbors, then a fraction of edges rewired
   at random — a Watts–Strogatz-style small-world mesh). Every node starts *uninformed*.
2. **Seed.** One node is planted with the ground-truth fact — a fixed-length vector of
   `tokenCount` symbolic tokens (the "fact"). Fidelity of any held version is the fraction
   of tokens that still match ground truth (Hamming similarity).
3. **Rounds.** Each round, every *informed* node picks `fanout` of its neighbors at random
   and **retells** its current version to them. A retelling is a **lossy re-encode**: each
   token independently mutates with probability `mutationRate` (drifts to a random wrong
   symbol). A node hearing the fact for the first time **adopts** the version it received;
   a node that already heard it keeps the version it **first** adopted (first-write-wins —
   Engram's "memory is sticky" assumption). Mutation happens on the *wire* (per retelling),
   so distance from the seed compounds drift.
4. **Stop.** The trial ends at full coverage or after `maxRounds`.

**Topology knobs (Engram mesh policy under test):**
- `fanout` — how many neighbors each informed node retells per round (push pressure).
- `mutationRate` — per-token corruption probability per retelling (channel noise).
- `size` `N` — mesh population.
- `degree` / `rewire` — neighborhood density and small-world shortcutting (graph shape).

The sweep crosses **fanout** × **mutationRate** × **size**, N seeded trials/cell.

## Event shape (JSONL trace, via core)

- `message` `meta` — mode, seed, trials, fanouts, mutation grid, sizes, graph params.
- `message` `cell` — the (fanout, mutationRate, size) cell being run.
- `message` `seed` — the plant: `{ node, tokenCount }`.
- `message` `gossip` — one retelling on the exhibition trial: `{ round, from, to, adopted, fidelity }`.
- `message` `snapshot` — end-of-round coverage/fidelity on the exhibition trial:
  `{ round, coverage, meanFidelity }`.
- `score` — per-cell aggregate: `fanout`, `mutationRate`, `size`, `saturation`,
  `timeToSaturation`, `fidelityAtSaturation`, `finalCoverage`, `fidelityAtSeedHop`, `fidelityFarHop`.
- final `score` — summary: fastest-saturating cell, the fidelity cost of that speed, and
  whether any cell reaches full coverage while typical fidelity has collapsed.

## Metrics

- **coverage(t)** — fraction of nodes that have heard *any* version by round `t`.
- **timeToSaturation** — first round where coverage ≥ `saturationThreshold` (default 0.99),
  or `maxRounds` if never.
- **fidelityAtSaturation** — mean fidelity of held versions once coverage crosses threshold.
- **fidelityByHop** — mean fidelity bucketed by graph distance from the seed (the telephone
  gradient); reported as near-hop (≤2) vs far-hop.
- **speedFidelityTrade** — for fixed (N, mutationRate), correlation of fanout↑ with
  timeToSaturation↓ and fidelityAtSaturation↓ (speed bought with accuracy).

## Definition of done

- `specs/08-rumor-mill.md` (this file) written first.
- Runs, produces a valid JSONL trace under `experiments/08-rumor-mill/runs/`,
  and `replay()` from core reads it back (event-count parity check in the harness).
- Deterministic seeded sim is the honest floor; an optional real-LLM mode (`llm.ts`,
  claude CLI nodes retelling the fact in natural language) is the stretch.
  **Never fake a green result.**
- `npm run typecheck` clean (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes),
  zero `any` in public signatures.
- `README.md` with what it tests and what was observed.
- One-paragraph learning note in `JOURNAL.md`.
- Committed and pushed to `origin/main`.
