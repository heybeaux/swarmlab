export interface AgentSpec {
  id: string;
  systemPrompt: string;
  model?: string;
  context?: Record<string, unknown>;
}

export interface AgentHandle {
  id: string;
  send(msg: unknown): Promise<void>;
  /** Register a message listener. Returns an unsubscribe function. */
  onMessage(cb: (msg: unknown) => void): () => void;
  kill(): Promise<void>;
}

export type TraceEvent =
  | { t: 'spawn'; ts: number; agentId: string; spec: AgentSpec }
  | { t: 'message'; ts: number; from: string; to: string | '*'; topic: string; body: unknown }
  | { t: 'score'; ts: number; agentId?: string; scores: Record<string, number> }
  | { t: 'kill'; ts: number; agentId: string };

export interface RunRecord {
  runId: string;
  experiment: string;
  events: TraceEvent[];
  startedAt: number;
  endedAt?: number;
}
