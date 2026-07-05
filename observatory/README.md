# SwarmLab Observatory

The lab's showpiece: a SvelteKit dashboard for navigating experiments and replaying
agent-swarm traces visually. Dark, technical, telescope-vibes. Built entirely by agents.

## Run it

```sh
cd observatory
npm install
npm run dev        # http://localhost:5173
```

Production build:

```sh
npm run build      # adapter-node output in build/
npm run preview
```

Typecheck (strict, fails on warnings):

```sh
npm run typecheck
```

## What it shows

- **Lab index (`/`)** — a grid of every folder in `../experiments/`, with name, first
  paragraph of its README, faculty-under-test (parsed from the README), and run count.
- **Experiment detail (`/experiments/[id]`)** — the README rendered, plus a run list with
  per-run stats (agents, messages, events, duration) and latest scores.
- **Trace replay (`/experiments/[id]/runs/[run]`)** — the centerpiece. Agents are nodes on
  a stage; messages fly the bus as glowing payloads with their topic label; score events
  pulse from the center and light up the telemetry panel as they fire; kills gray a node
  out with a rose ring. Play/pause, restart, 0.5–4× speed, a scrubber, and a clickable
  event log that jumps the timeline.

## How it reads data

Everything comes from the real filesystem — no fixtures. `src/lib/server/lab.ts` resolves
the monorepo root as `..` from the observatory's cwd, lists `experiments/*`, renders each
`README.md` with `marked`, and parses `runs/*.jsonl` line-by-line into `TraceEvent[]`
(the contract mirrored from `core/src/types.ts` in `src/lib/types.ts`). Malformed JSONL
lines are skipped, not faked.

Because real traces can span only milliseconds (the smoke run spans 3ms), replay uses a
**virtual timeline** (`src/lib/replay.ts`): real event order and rough spacing are kept,
but a minimum visual gap is enforced so every event gets its moment on stage.

## Notes

- Run this from `observatory/` — the lab root is resolved relative to cwd.
- Triggering runs from the UI is not wired yet (spec allows this for v1); produce traces
  with e.g. `npm run smoke` from the repo root and they appear here on refresh.
