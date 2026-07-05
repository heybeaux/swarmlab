# Experiment 12 — Schema Negotiation

> Faculty under test: **Sonder** (the event-bus contract problem) + **Lattice**
> (coordination without a referee). A human wrote this spec; only agents write code.

## The Weird

Two agents must exchange data but were given **different** data models. No human
referee, no shared schema. They must negotiate a common protocol from scratch and
successfully round-trip records — or fail trying.

## Hypothesis

Agents with divergent schemas can bootstrap a shared protocol through iterative
proposal/counter-proposal, but success depends on overlap: when field semantics
diverge (same name, different meaning — the "false friend" problem), negotiation
silently converges on a WRONG mapping. Undetected semantic mismatch is the real
failure mode, and it's exactly what Sonder's typed event contracts prevent.

## Design

- Agent A and Agent B each hold a schema for the same domain (e.g. a "user" or an
  "order") with: some shared fields, some renamed fields (same meaning), and some
  false friends (same name, different meaning/units — e.g. `total` = pre-tax vs
  post-tax; `id` = string vs int).
- They exchange messages to agree on a wire format + field mapping.
- Then A sends B a batch of records; B decodes and echoes back. Score round-trip
  fidelity field-by-field.
- Sweep: vary overlap %, number of false friends. Measure:
  - negotiation rounds to agreement
  - round-trip fidelity (overall)
  - **silent-corruption rate** (fields both agents THOUGHT matched but didn't)

## Contracts

Reuse `core/` `TraceEvent`. Negotiation turns are `message` events (A↔B).
Final `score`: `{ agreed, rounds, fidelity, silentCorruption, falseFriendsCaught }`.
The silent-corruption metric is the headline — it must be derivable from the trace.

## Deliverables

1. `experiments/12-schema-negotiation/` — TS strict, ESM, builds clean.
2. `src/` with rng, types, two schema definitions, a negotiator, round-trip sim, main.
3. Deterministic seeded simulation fallback (no live LLM needed), matching exp 08/09.
4. `runs/*.jsonl` — at least one replay-verified trace.
5. `README.md` — findings: silent-corruption rate vs false-friend count, and what it
   implies for Sonder typed contracts.

## Definition of Done

- Build/typecheck passes clean, no `any` in public signatures.
- Valid replayable JSONL trace.
- README states the silent-corruption finding and its implication for Sonder.
