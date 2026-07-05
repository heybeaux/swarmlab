# Experiment 03 — Prompt Darwinism

**Faculty under test:** ACR / AWM (fitness functions for agent behavior).

## The Idea

Spawn N agents with slightly *mutated* system prompts. Give them all the same task.
Score outputs. "Breed" the winners — combine/mutate the top prompts into the next
generation. Repeat for G generations. Watch prompts evolve toward the fitness function.

## Build

- Seed prompt + a mutation operator (word swap, instruction add/drop, tone shift — keep it
  simple and deterministic-seeded so runs are reproducible).
- Population of N (start 6-8). Same task per generation.
- A `Scorer` (from `core/score/`) that grades outputs on a clear, cheap-to-compute metric.
- Selection + breeding: top-k survive, offspring = mutated recombinations.
- Every spawn/message/score/kill goes through `core/` so it traces + replays.
- Run G generations (start 4-5), write the trace, write a README with what evolved.

## What To Look For (write it in the README)

- Did fitness actually climb, or plateau/collapse?
- Did prompts converge on something legible, or drift into weird attractors?
- What does this say about using evolutionary pressure to tune real faculty prompts?

## Definition of Done

Runs, produces a valid multi-generation JSONL trace `replay()` can read, README written,
committed, journal note added.
