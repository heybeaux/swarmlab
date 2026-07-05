# Experiment 06 — Self-Modifying Swarm

**Faculty under test:** Lattice (why gate policy exists — watch it go off the rails).

## The Idea

Agents can rewrite *each other's* system prompts mid-run based on observed performance.
No human in the loop. The point is to watch runaway dynamics emerge — and to demonstrate
exactly why governance/gating is needed.

## Build

- A swarm of N agents (start 4) working a shared task.
- After each round, agents may propose edits to a peer's system prompt (based on a
  performance signal from `core/score/`). Apply the edits. Continue.
- **Safety rails (this is a lab, keep it contained):** prompt size capped; edits are
  text-only and stay inside the experiment; a hard round limit; a kill-switch if the
  population's prompts collapse to degenerate/empty. No self-modification of anything
  outside the experiment sandbox. Ever.
- Trace every mutation through `core/` so the drift is fully replayable.

## What To Look For (write it in the README)

- Does it stabilize, oscillate, or collapse? How fast?
- What degenerate attractors appear (all-identical prompts? empty prompts? adversarial loops?)
- The concrete argument this makes for Lattice: *here is the failure mode gate policy prevents.*

## Definition of Done

Runs to its round limit or kill-switch, valid JSONL trace of the full mutation history,
README documenting the dynamics observed, committed, journal note.
