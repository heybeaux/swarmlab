# Experiment 10 — Economic Agents

> Faculty under test: **Lattice** (mechanism design / gate policy) + **Sonder**
> (metered event bus). A human wrote this spec; only agents write the code.

## The Weird

Give each agent a token budget. They must **pay** to call each other. Watch what
collaboration patterns emerge under scarcity — do agents hoard, form cartels,
route around expensive peers, or starve?

## Hypothesis

Under a fixed budget, unconstrained agents over-communicate and go bankrupt before
finishing the task. Introducing a per-message cost forces prioritization and
changes the topology of who-talks-to-whom. Scarcity is a design force, not a bug.

## Design

- N worker agents must collaboratively solve a decomposable task (e.g. sort/merge
  a dataset, or assemble a multi-part answer where each agent holds one piece).
- Each agent starts with a budget `B` of tokens.
- Every message sent via the bus costs `c` tokens, debited from the sender.
- An agent at 0 balance is **muted** (can receive but not send).
- Run sweeps: vary `c` (cheap → expensive) and `B`. Measure:
  - task completion rate
  - messages sent per agent (Gini coefficient of communication)
  - bankruptcies before completion
  - emergent topology (who paid to talk to whom)

## Contracts

Reuse `core/` `TraceEvent` shape. Add a `score` event per run with:
`{ completed, totalMessages, bankruptcies, giniComms, avgBalanceRemaining }`.
Every paid message emits a `message` trace event; balance changes are derivable
from the trace (append-only, replayable).

## Deliverables

1. `experiments/10-economic-agents/` — TS strict, ESM, builds clean.
2. `src/` with rng (deterministic), types, an economy/ledger module, sim, main.
3. A deterministic seeded simulation fallback (no live LLM needed to run/replay),
   matching the pattern of exp 08/09.
4. `runs/*.jsonl` — at least one replay-verified trace.
5. `README.md` — findings: at what price does collaboration break? Gini curve.

## Definition of Done

- `npm run build` (or typecheck) passes clean, no `any` in public signatures.
- Running produces a valid JSONL trace `replay()` can read back.
- README states the scarcity threshold observed and what it implies for Lattice
  gate-policy / Sonder metering.
