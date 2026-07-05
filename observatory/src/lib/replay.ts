import type { TraceEvent } from '$lib/types';

export interface AgentNode {
  id: string;
  x: number;
  y: number;
  /** virtual position [0,1] where the agent spawns */
  spawnAt: number;
  /** virtual position [0,1] where the agent is killed, or null */
  killAt: number | null;
  systemPrompt: string;
}

export interface TimedEvent {
  event: TraceEvent;
  /** virtual position on the playback timeline, in [0,1] */
  at: number;
  index: number;
}

/**
 * Real traces often have events microseconds apart (the smoke run spans 3ms),
 * which is unwatchable. Build a virtual timeline that respects real ordering
 * and roughly respects real spacing, but enforces a minimum visual gap so
 * every event gets its moment.
 */
export function buildTimeline(events: TraceEvent[]): TimedEvent[] {
  const n = events.length;
  if (n === 0) return [];
  if (n === 1) return [{ event: events[0], at: 0.5, index: 0 }];

  const t0 = events[0].ts;
  const span = events[n - 1].ts - t0;
  const minGap = 1 / (n + 1);

  const raw: number[] = events.map((e, i) => (span > 0 ? (e.ts - t0) / span : i / (n - 1)));

  // enforce monotonic minimum spacing, then renormalize to [0.04, 0.96]
  const spaced: number[] = [];
  for (let i = 0; i < n; i++) {
    spaced.push(i === 0 ? raw[0] : Math.max(spaced[i - 1] + minGap, raw[i]));
  }
  const lo = spaced[0];
  const hi = spaced[n - 1];
  const range = hi - lo || 1;
  return events.map((event, index) => ({
    event,
    index,
    at: 0.04 + 0.92 * ((spaced[index] - lo) / range)
  }));
}

/** Lay agents out on an ellipse in spawn order. */
export function layoutAgents(
  timeline: TimedEvent[],
  width: number,
  height: number
): Map<string, AgentNode> {
  const spawns = timeline.filter(
    (te): te is TimedEvent & { event: Extract<TraceEvent, { t: 'spawn' }> } =>
      te.event.t === 'spawn'
  );
  const kills = new Map<string, number>();
  for (const te of timeline) {
    if (te.event.t === 'kill') kills.set(te.event.agentId, te.at);
  }

  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.36;
  const ry = height * 0.34;
  const n = Math.max(spawns.length, 1);

  const nodes = new Map<string, AgentNode>();
  spawns.forEach((te, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n + (n === 2 ? Math.PI / 2 : 0);
    nodes.set(te.event.agentId, {
      id: te.event.agentId,
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
      spawnAt: te.at,
      killAt: kills.get(te.event.agentId) ?? null,
      systemPrompt: te.event.spec.systemPrompt
    });
  });
  return nodes;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Short human label for an event, used in the log. */
export function eventLabel(e: TraceEvent): string {
  switch (e.t) {
    case 'spawn':
      return `spawn ${e.agentId}`;
    case 'message':
      return `${e.from} → ${e.to === '*' ? 'all' : e.to} · ${e.topic}`;
    case 'score':
      return `score ${Object.entries(e.scores)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')}`;
    case 'kill':
      return `kill ${e.agentId}`;
  }
}
