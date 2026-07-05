# Experiment 11 — The Reverse Engineer

> Faculty under test: **Sonder** (behavioral contracts / black-box inference) +
> **Engram** (reconstructing state from observed behavior). A human wrote this
> spec; only agents write the code.

## The Weird

Agent A builds something and **hides the source**. Agent B can only probe its
behavior (black box: send inputs, observe outputs) and must reconstruct an
equivalent implementation. Measure how close B gets without ever seeing A's code.

## Hypothesis

Black-box behavioral inference converges fast on the common path but fails on edge
cases and hidden state. B will reconstruct the "happy path" quickly, then plateau —
the residual gap is exactly the part of behavior that isn't observable from typical
probes. That gap is what Sonder's explicit behavioral contracts exist to close.

## Design

- Agent A is given a target function/spec (e.g. a small stateful widget: a parser,
  a mini state machine, a pricing function with tiers/edge cases).
- A implements it; source is sealed (B never sees it).
- B gets a **probe budget** — N (input → output) queries against A's black box.
- B then submits a reconstruction. Score it against a held-out test set A's real
  impl also runs. Measure agreement %.
- Sweep probe budget (few → many) and target complexity (stateless → stateful with
  hidden edge cases). Measure agreement vs probes — where does it plateau?

## Contracts

Reuse `core/` `TraceEvent`. Each probe is a `message` (B→A) + response (A→B).
Final `score` event: `{ agreement, probesUsed, edgeCaseAgreement, happyPathAgreement }`.
Split scoring so happy-path vs edge-case divergence is visible in the trace.

## Deliverables

1. `experiments/11-reverse-engineer/` — TS strict, ESM, builds clean.
2. `src/` with rng, types, the target/oracle module, a prober/reconstructor, sim, main.
3. Deterministic seeded simulation fallback (no live LLM needed), matching exp 08/09.
4. `runs/*.jsonl` — at least one replay-verified trace.
5. `README.md` — findings: agreement-vs-probes curve, where it plateaus, and the
   size of the edge-case gap.

## Definition of Done

- Build/typecheck passes clean, no `any` in public signatures.
- Valid replayable JSONL trace.
- README states the observed plateau and what the edge-case gap implies for Sonder
  behavioral contracts.
