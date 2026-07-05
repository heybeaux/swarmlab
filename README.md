# SwarmLab

A monorepo of weird agent-swarm experiments — each one a wind-tunnel test of a
faculty in the [heybeaux](https://github.com/heybeaux) stack (Parliament, Lattice,
Sonder, Engram, ACR/AWM) — plus a Svelte observatory to navigate, run, and learn
from them.

The point is **learning**, not shipping product. Weird is a feature. Emergent
behavior you didn't predict is the win condition.

## The Prime Rule

**Only agents write the code.** Every line in `core/`, `observatory/`, and every
experiment is written, reviewed, and committed by an autonomous agent team. A human
writes the charter and the specs; agents build. This isn't a gimmick — it forces
the operator to learn orchestration, spec-writing, and reading emergent behavior
instead of implementation. That's the real lesson.

The constitution the team builds under is [`TEAM.md`](./TEAM.md). The running log
of what each builder learned is [`JOURNAL.md`](./JOURNAL.md) — read it; the findings
are the product.

## Layout

```
swarmlab/
  core/          shared substrate — spawn, bus, score, trace (library only)
  observatory/   Svelte 5 dashboard — navigate experiments, replay traces visually
  experiments/   one folder per experiment, each built on core/
  specs/         detailed specs written before a build
  TEAM.md        the team charter / constitution
  JOURNAL.md     chronological learning notes (one paragraph per unit)
  BRAINSTORM.md  the canonical 12-idea brief
```

## The substrate: `core/`

Every experiment depends on four contracts (`core/src/types.ts`):

- **`TraceEvent`** — `spawn` | `message` | `score` | `kill`. Everything an
  experiment does is one of these, timestamped.
- **`RunRecord`** — an experiment run: an ordered list of events, persisted as JSONL.
- **`AgentSpec`** — id + system prompt + optional model/context.
- **`AgentHandle`** — `send` / `onMessage` / `kill`.

Modules: `spawn` (agents, with a pluggable `AgentRuntime` seam — `StubRuntime` for
deterministic in-process runs, real LLM backends plug in behind the same interface),
`bus` (message passing), `score` (fitness/observation), `trace` (record + deterministic
`replay()`). See [`core/README.md`](./core/README.md) for the full API.

## The showpiece: `observatory/`

A hand-scaffolded SvelteKit + Svelte 5 (runes) app. Three views: a lab index grid
reading real `experiments/*` folders, an experiment detail page rendering each
README with per-run stats, and the hero **trace replay** — agents as glowing nodes,
messages flying the bus with topic labels, score events pulsing rings, kills graying
nodes, all on a virtual timeline with play/pause/speed/scrubber.

```bash
cd observatory && npm install && npm run dev
```

## Experiments

Each experiment tests a faculty. `NN` is the brainstorm idea number, not build order.

| # | Experiment | Tests | What it probes |
|---|---|---|---|
| 01 | Telephone Compiler | Sonder / ACR | spec→code→spec drift over 10 hops |
| 02 | Adversarial Pair | Lattice / AWM | coder vs test-writer alternating on one file |
| 03 | Prompt Darwinism | ACR / AWM | mutate prompts, score, breed winners |
| 04 | Consensus Under Lies | Parliament / Lattice | N agree; 1-2 secretly mislead |
| 05 | Bug Telephone | Lattice | injected bug survives a reviewer chain |
| 06 | Self-Modifying Swarm | Lattice | agents rewrite each other's prompts |
| 07 | Minimal Language | Sonder | swarm designs a DSL + interpreter blind |
| 08 | Rumor Mill | Engram | gossip/epidemic propagation on a mesh |
| 09 | Overnight Cathedral | Lattice / Sonder | long-horizon iterative build, each commit reviewed |
| 10 | Economic Agents | Lattice / AWM | token-budget scarcity shapes collaboration |
| 11 | Reverse Engineer | Sonder | black-box behavioral reconstruction |
| 12 | Schema Negotiation | Sonder | two agents negotiate a shared protocol |
| 13 | Team's Choice | — | the team invents its own experiment |

Each experiment folder ships: source built on `core/`, a `runs/*.jsonl` real trace,
a `README.md` explaining what it tests and what was *actually observed*, and a note
in `JOURNAL.md`. Every result is real — a red trace beats a faked green one.

## Running an experiment

```bash
npm install
npm run typecheck        # strict; no `any` in public signatures
# each experiment exposes its own run entry — see its README
```

Traces land in `experiments/NN-*/runs/` and are read back deterministically by
`replay()`, then visualized in the observatory.

## Status

Built by the autonomous team, in order: `core/` → `observatory/` → experiments
`01`–`13`. Progress is committed and pushed to `origin/main` after every green unit,
so `git log` is the live build feed. Check `JOURNAL.md` for the findings as they land.
