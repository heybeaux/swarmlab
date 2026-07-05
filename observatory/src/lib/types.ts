// Mirrors core/src/types.ts — the lab-wide trace contract.

export interface AgentSpec {
  id: string;
  systemPrompt: string;
  model?: string;
  context?: Record<string, unknown>;
}

export type TraceEvent =
  | { t: 'spawn'; ts: number; agentId: string; spec: AgentSpec }
  | { t: 'message'; ts: number; from: string; to: string | '*'; topic: string; body: unknown }
  | { t: 'score'; ts: number; agentId?: string; scores: Record<string, number> }
  | { t: 'kill'; ts: number; agentId: string };

export interface RunSummary {
  /** file name without .jsonl */
  id: string;
  file: string;
  events: number;
  agents: number;
  messages: number;
  /** latest score event's scores, if any */
  scores: Record<string, number> | null;
  startedAt: number | null;
  endedAt: number | null;
}

export interface ExperimentSummary {
  id: string;
  name: string;
  description: string;
  faculty: string | null;
  runCount: number;
  status: 'has-runs' | 'no-runs';
}

export interface ExperimentDetail extends ExperimentSummary {
  readmeHtml: string;
  runs: RunSummary[];
}
