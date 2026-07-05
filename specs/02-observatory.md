# SwarmLab — `observatory/` Specification

> The showpiece. A stunning Svelte dashboard to navigate, run, and learn from experiments.
> A human asked for "a stunning place to navigate, test and learn." Deliver on that.

## What It Is

A SvelteKit app that reads the monorepo's experiments and their trace runs, and presents
them beautifully: browse experiments, read what each one tests, trigger a run, and replay
traces visually (the agent messages animating through the bus over time).

## Non-Negotiables

- **SvelteKit + TypeScript + Vite.** Strict TS.
- **It must actually render real data** — read `experiments/*/README.md` for descriptions and
  `experiments/*/runs/*.jsonl` for traces. No lorem-ipsum placeholders standing in for real runs.
- **Beautiful, not generic.** This is a showpiece. Considered typography, real hierarchy,
  motion that means something (the trace replay is the hero interaction). Dark, technical,
  observatory vibe fits the subject. Avoid default-Bootstrap-looking output.
- **Trace replay is the hero feature.** Given a JSONL trace, visualize agents as nodes and
  messages as animated edges over the timeline, with a scrubber. Score events surface as they fire.

## Views (minimum)

1. **Lab index** — grid/list of experiments with name, faculty-under-test, run count, status.
2. **Experiment detail** — the README rendered, list of runs, "Run" button, latest scores.
3. **Trace replay** — the animated node/edge timeline with a scrubber. The centerpiece.

## Wiring

- A small server route or script that lists experiments and their runs by reading the filesystem.
- Triggering a run may shell out to the experiment's entry (`node experiments/<id>/dist/main.js`)
  or, if that's too heavy for the first pass, load pre-existing traces from `runs/`. Either is
  acceptable for v1 — reading + replaying real traces is the must-have; live-triggering is a plus.

## Definition of Done

- `npm run build` in `observatory/` succeeds; `npm run typecheck` clean.
- Dev server renders the lab index from real experiment folders.
- The smoke experiment's trace (`experiments/00-smoke/runs/smoke.jsonl`) replays in the UI.
- A screenshot or short note in `JOURNAL.md` describing how it looks and what works.
- Committed. README in `observatory/` on how to run it.
