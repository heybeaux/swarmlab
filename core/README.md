# @swarmlab/core

Shared substrate for every SwarmLab experiment: spawn agents, pass messages,
score behavior, record traces for deterministic replay. Library only — no app
framework. The Svelte observatory lives in `observatory/` and consumes traces
produced here.

## Contracts

Everything downstream depends on these four types (defined in `src/types.ts`):

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

interface AgentSpec {
  id: string;
  systemPrompt: string;
  model?: string;
  context?: Record<string, unknown>;
}

interface AgentHandle {
  id: string;
  send(msg: unknown): Promise<void>;
  onMessage(cb: (msg: unknown) => void): () => void; // returns unsubscribe
  kill(): Promise<void>;
}
```

## Modules

### `@swarmlab/core/spawn`

`spawnAgent(spec, { runtime?, trace? })` returns an `AgentHandle`. Spawn and
kill are recorded to the trace when one is provided.

**The runtime seam:** `AgentRuntime` is the interface where the real agent
backend plugs in. The default is `StubRuntime` — deterministic, in-process,
echoes each message back to its sender (`{ echoFrom, seq, received }`) so
experiments run offline and tests are reproducible. In production, implement
`AgentRuntime` over OpenClaw: `spawn` → `sessions_spawn`, `send` →
`sessions_send`, `kill` → session kill, and call `deliver` when the sub-agent
replies. Nothing else in core changes.

### `@swarmlab/core/bus`

`MessageBus` — in-process pub/sub. Three delivery modes:

- **direct:** `publish({ from, to: 'bob', topic, body })`
- **broadcast:** `publish({ from, to: '*', topic, body })` (everyone but the sender)
- **neighbor-only:** `setNeighbors(id, [...])` then `publishToNeighbors(from, topic, body)` — for gossip experiments

Subscribe with `subscribe(agentId, topic, handler)`; topic `'*'` receives all
topics. Every message that flows through the bus is appended to the attached
`TraceWriter`, so route *all* agent traffic through the bus or it won't be
traced.

### `@swarmlab/core/score`

`Scorer` — pluggable fitness function per experiment:
`score(run: RunRecord): number | Record<string, number>`.
`runScorer(scorer, run)` normalizes the result to a named map (bare numbers
become `{ fitness: n }`), ready for a `score` trace event.

### `@swarmlab/core/trace`

- `TraceWriter(filePath, { runId, experiment })` — append-only JSONL, one
  `TraceEvent` per line, synchronous writes (crash-safe mid-run).
  `toRunRecord()` gives the in-memory view for scoring.
- `replay(traceFile): AsyncIterable<TraceEvent>` — streams events back in
  write order, validating each line. This is the observatory's read API.
- `readRunRecord(traceFile)` — convenience: full replay into a `RunRecord`.

## Trace file format

One JSON object per line (JSONL). Example from the smoke experiment:

```jsonl
{"t":"spawn","ts":1751680000000,"agentId":"alice","spec":{"id":"alice","systemPrompt":"..."}}
{"t":"message","ts":1751680000001,"from":"alice","to":"bob","topic":"greeting","body":{"text":"hello bob"}}
{"t":"score","ts":1751680000002,"scores":{"messages":1,"delivered":1}}
{"t":"kill","ts":1751680000003,"agentId":"alice"}
```

## Proving it works

```sh
npm install
npm run typecheck   # tsc -b --force, strict
npm run smoke       # builds, runs experiments/00-smoke, replays its own trace
```

The smoke experiment spawns 2 stub agents, sends one direct message, scores
the run, kills both agents, then `replay()`s the JSONL file and asserts the
event counts (2 spawn / 1 message / 1 score / 2 kill).
