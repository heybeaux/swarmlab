import type { AgentHandle, AgentSpec } from '../types.js';
import type { TraceWriter } from '../trace/index.js';

/**
 * The seam where a real agent runtime plugs in.
 *
 * In production this is backed by OpenClaw's `sessions_spawn` MCP tool: `spawn`
 * maps to `sessions_spawn` (spec.systemPrompt + spec.context become the task
 * payload, spec.model selects the model), `RuntimeAgent.send` maps to
 * `sessions_send`, `RuntimeAgent.kill` maps to killing the sub-agent session,
 * and the runtime calls `deliver` whenever the sub-agent session emits a
 * message back. Implement `OpenClawRuntime` against this interface and pass it
 * to `spawnAgent` — nothing else in core/ changes.
 */
export interface AgentRuntime {
  spawn(spec: AgentSpec, deliver: (msg: unknown) => void): Promise<RuntimeAgent>;
}

export interface RuntimeAgent {
  send(msg: unknown): Promise<void>;
  kill(): Promise<void>;
}

/**
 * Deterministic in-process runtime for tests and offline experiments.
 * Each spawned agent echoes every message it receives back to its sender,
 * tagged with its id and a per-agent sequence number.
 */
export class StubRuntime implements AgentRuntime {
  async spawn(spec: AgentSpec, deliver: (msg: unknown) => void): Promise<RuntimeAgent> {
    let seq = 0;
    let alive = true;
    return {
      async send(msg: unknown): Promise<void> {
        if (!alive) throw new Error(`agent ${spec.id} is dead`);
        seq += 1;
        const reply = { echoFrom: spec.id, seq, received: msg };
        queueMicrotask(() => {
          if (alive) deliver(reply);
        });
      },
      async kill(): Promise<void> {
        alive = false;
      },
    };
  }
}

export interface SpawnOptions {
  /** Defaults to StubRuntime; swap in an OpenClaw-backed runtime here. */
  runtime?: AgentRuntime;
  /** If set, spawn/kill events are recorded here. */
  trace?: TraceWriter;
}

const defaultRuntime = new StubRuntime();

export async function spawnAgent(spec: AgentSpec, opts: SpawnOptions = {}): Promise<AgentHandle> {
  const runtime = opts.runtime ?? defaultRuntime;
  const listeners = new Set<(msg: unknown) => void>();
  const agent = await runtime.spawn(spec, (msg) => {
    for (const cb of listeners) cb(msg);
  });
  opts.trace?.append({ t: 'spawn', ts: Date.now(), agentId: spec.id, spec });

  let killed = false;
  return {
    id: spec.id,
    async send(msg: unknown): Promise<void> {
      await agent.send(msg);
    },
    onMessage(cb: (msg: unknown) => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async kill(): Promise<void> {
      if (killed) return;
      killed = true;
      await agent.kill();
      opts.trace?.append({ t: 'kill', ts: Date.now(), agentId: spec.id });
    },
  };
}
