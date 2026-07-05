# SwarmLab — `core/` Specification (Seed)

> This is the keystone spec. The swarm builds `core/` FIRST. Every experiment
> depends on it. A human wrote this spec; **only agents write the code.**

## What SwarmLab Is

A monorepo lab of weird agent-swarm experiments. Each experiment stress-tests a
faculty in the heybeaux stack (Parliament, Lattice, Sonder, Engram, ACR/AWM).
`core/` is the shared substrate every experiment reuses: spawn agents, pass
messages, score behavior, record traces for replay.

## Non-Negotiables

- **Language:** TypeScript (strict). ESM. Node 22+.
- **No app framework in `core/`** — it's a library. The Svelte app lives in `observatory/`.
- **Everything is traceable.** Every agent message, spawn, and score MUST be
  recorded to a trace file that can be replayed deterministically.
- **The swarm = OpenClaw sub-agents.** `spawn/` wraps `sessions_spawn`. Do not
  reinvent an agent runtime; bind to the real one.
- **Small, composable modules.** No god-objects.

## Modules

### `core/spawn/`
- `spawnAgent(spec: AgentSpec): Promise<AgentHandle>` — wraps OpenClaw `sessions_spawn`.
- `AgentSpec` = `{ id, systemPrompt, model?, context? }`.
- `AgentHandle` = `{ id, send(msg), onMessage(cb), kill() }`.

### `core/bus/`
- In-process message bus. Agents publish/subscribe by topic.
- MUST support: direct (A→B), broadcast, and neighbor-only (for gossip experiments).
- Every message flows through the bus so `trace/` can see it.

### `core/score/`
- `Scorer` interface: `score(run: RunRecord): number | Record<string, number>`.
- Pluggable — each experiment supplies its own fitness function.

### `core/trace/`
- Append-only event log per run (JSONL). Events: spawn, message, score, kill.
- `replay(traceFile): AsyncIterable<TraceEvent>` for the observatory.

## Contracts (the whole lab depends on these — get them right)

```ts
type TraceEvent =
  | { t: 'spawn'; ts: number; agentId: string; spec: AgentSpec }
  | { t: 'message'; ts: number; from: string; to: string | '*'; topic: string; body: unknown }
  | { t: 'score'; ts: number; agentId?: string; scores: Record<string, number> }
  | { t: 'kill'; ts: number; agentId: string };

interface RunRecord {
  runId: string;
  experiment: string;
  events: TraceEvent[];
  startedAt: number;
  endedAt?: number;
}
```

## Deliverables for this task

1. `core/` fully implemented against the contracts above.
2. A `package.json` at repo root (workspaces) + `core/package.json`.
3. `tsconfig` strict. It must typecheck clean.
4. A trivial smoke experiment `experiments/00-smoke/` that spawns 2 agents,
   passes one message, scores it, and writes a trace — proving `core/` works.
5. A short `core/README.md` explaining the contracts (written by you, the agent).

## Definition of Done

- `npm install && npm run typecheck` passes.
- Running the smoke experiment produces a valid JSONL trace that `replay()` can read back.
- No `any` in public signatures.
