# Experiment 03 — Prompt Darwinism

Evolve a population of *system prompts* (genomes) against a hidden category task and watch
what selection actually optimizes. Each generation: spawn N agents through `core/`, run each
genome to produce a word list, harness-grade every list into a true F1 against a target
category, compute a fitness (optionally a *deceptive* proxy that rewards length over
correctness), then breed the winners into the next generation. Everything traces and replays.

The point is not "can we evolve a good prompt" — it's **what is the gap between the signal
selection climbs and the quality we actually want**, and how a tiny population plus a sparse
reward makes that gap either invisible (F1 flat at zero) or actively misleading (Goodhart
divergence when `deception > 0`).

## What it models

- **Task:** emit the target color category `{red, yellow, blue, orange, green, purple}`.
  Distractors are near-synonyms `{crimson, scarlet, maroon, teal, cyan, magenta}` — so an
  exact-match F1 is deliberately punishing: "crimson" is *wrong* even though it's a red.
- **Genome:** a list of directives (`name:*`, `style:*`, theme vs distractor vs meta genes)
  rendered into a system prompt. Breeding recombines and mutates directives.
- **Fitness:** at `deception=0`, fitness *is* true F1. As `deception → 1`, fitness increasingly
  rewards a length proxy — the classic reward-hacking setup where the population can climb the
  *reported* score while true quality stagnates (`goodhartDivergence`).
- **Scoring:** per-generation `bestTrueF1 / diversity / themeShare`; summary `f1Climb`,
  `finalDiversity`, `converged` (diversity collapse), `goodhartDivergence`.

## Run it

```
DARWIN_MODE=llm DARWIN_POP=4 DARWIN_GENS=3 node dist/main.js   # real haiku, small
DARWIN_MODE=sim node dist/main.js                              # deterministic
DARWIN_DECEPTION=0.6 DARWIN_MODE=sim node dist/main.js         # provoke Goodhart
```

## What I observed

The reward is a **cliff, not a gradient.** With a tiny population you need at least one genome
to land at least one target word before selection has anything to amplify — and at `pop=4`
none did. The genomes emit either generic aesthetic adjectives (`ameliorate, benevolent,
ethereal, ...`) or literally echo their own directives (`` `style:concise` ``) — plausible
"list-y" output that shares zero exact tokens with `{red, yellow, blue, ...}`. So true F1 is
pinned at 0 from generation 0, and with no non-zero fitness anywhere, breeding is a random
walk: no climb is possible.

That is the honest finding, not a bug: **sparse exact-match rewards + small populations =
evolution with nothing to select on.** The near-synonym distractors make it worse — a model
that reaches for red-adjacent words ("crimson") is punished exactly as hard as one that emits
nonsense, so even a *near-miss* gives selection no purchase.

## Live run (real LLM)

- **Mode / model:** `llm`, `claude-haiku-4-5-20251001` (`pop=4`, `gens=3`, `deception=0`, task=colors).
- **Trace:** `runs/pd-mr7fziz0.jsonl` (replay-verified, 16 score events).
- **Key metrics (final):** `finalBestF1=0`, `firstBestF1=0`, `f1Climb=0`, `bestEverF1=0`,
  `finalReportedFitness=0`, `finalDiversity=1`, `converged=0`, `goodhartDivergence=0`.
- **Live vs sim:** the real model confirms the cliff. Across all 3 generations no genome ever
  scored a single target color, so F1 never left zero and diversity stayed maxed (1.0 — no
  selective pressure to collapse it). Note `goodhartDivergence=0` here **only because
  `deception=0`**: there was no proxy reward to hack. The Goodhart mode is real but lives in the
  `deception>0` sim cells; the live `deception=0` run instead demonstrates the *other* failure —
  a reward so sparse that selection is inert. Both are the same ACR/AWM lesson from opposite
  ends: **when fitness and true quality diverge (proxy hacking) or when fitness carries no
  signal at all (sparse reward), the evolutionary loop optimizes something that isn't the goal.**

## Takeaways

1. **Sparse exact-match rewards starve selection.** No gradient, no evolution — the population
   needs at least occasional partial credit for near-misses, or a larger pop to get a lucky hit,
   or the loop is a random walk. This stresses ACR/AWM: a reward channel with no signal looks
   identical to a hard task.
2. **Goodhart is the dual failure.** Turn on `deception` and the population climbs *reported*
   fitness while true F1 stalls — `goodhartDivergence` catches it by the gap between optimized
   and wanted, not by the climb. A governance/eval layer must watch that gap, not the score.
3. **Diversity collapse is a governance signal.** `converged` (diversity < 0.34) marks the
   moment a population homogenizes onto one genome — usually right when it starts hill-climbing
   a proxy. At `deception=0` with no climb, diversity stays at 1.0; the collapse is a
   symptom to watch for, not a goal.

## Files

- `genome.ts` — directive model, gene pool, prompt rendering, composition.
- `task.ts` — target category, distractors, F1 grading.
- `fitness.ts` — true-F1 vs deceptive-proxy blend (the Goodhart knob).
- `evolve.ts` — selection, elitism, recombination, mutation, diversity.
- `gen.ts` / `sim.ts` — real-LLM executor (`--tools ""` isolation) vs seeded sim executor.
- `main.ts` — generation driver, core spawn/bus/trace wiring, summary scorer, replay.
- `runs/*.jsonl` — evolution traces (`replay()`-verified).
