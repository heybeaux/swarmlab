# SwarmLab Journal

Learning notes, chronological. One paragraph per unit of work: what happened, what surprised you.

---

## Core (bootstrap)
`core/` built and verified green by the seed builder. spawn/bus/score/trace all work; the 00-smoke experiment spawns 2 agents, passes a message, scores it, and produces a JSONL trace that `replay()` reads back deterministically. Foundation is real. Substrate confirmed before the autonomous team took over.

## Observatory (v1)
Built `observatory/` as a hand-scaffolded SvelteKit + Svelte 5 (runes) app — no interactive `sv create`, every file written directly, which kept the scaffold deterministic and committable in minutes. Three views ship: a lab index grid that reads real `experiments/*` folders, an experiment detail page rendering the README via `marked` with per-run stats, and the hero trace replay — agents as glowing nodes on an SVG stage, messages flying the bus with topic labels, score events pulsing amber rings from center into a telemetry panel, kills graying nodes with a rose ring, all driven by a rAF loop with play/pause/speed/scrubber and a clickable event log. The surprise: real traces are unwatchable raw — the smoke run spans 3ms, so a naive timestamp-scaled replay collapses into a single frame. The fix was a virtual timeline (`src/lib/replay.ts`) that preserves order and rough spacing but enforces a minimum visual gap per event; this will matter even more for LLM-backed experiments where bursts of near-simultaneous bus traffic are the norm. Verified live in a browser mid-replay (screenshot: `docs/observatory-replay.png`): dark observatory vibe landed, build + strict typecheck green, zero `any` in public signatures. Also wrote the missing `experiments/00-smoke/README.md` — the index needed real descriptions and the smoke experiment's DoD had a gap. Not wired yet: triggering runs from the UI (spec allows deferring); traces appear on refresh when produced from the CLI.
