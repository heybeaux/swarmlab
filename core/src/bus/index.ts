import type { TraceWriter } from '../trace/index.js';

export interface BusMessage {
  from: string;
  /** Agent id for direct delivery, or '*' for broadcast. */
  to: string | '*';
  topic: string;
  body: unknown;
}

export type MessageHandler = (msg: BusMessage) => void;

/**
 * In-process message bus. Supports direct (A→B), broadcast ('*'), and
 * neighbor-only delivery (for gossip experiments). Every message that flows
 * through the bus is recorded to the attached TraceWriter, if any.
 */
export class MessageBus {
  #subscribers = new Map<string, Map<string, Set<MessageHandler>>>();
  #neighbors = new Map<string, Set<string>>();
  #trace: TraceWriter | undefined;

  constructor(opts: { trace?: TraceWriter } = {}) {
    this.#trace = opts.trace;
  }

  /** Subscribe an agent to a topic. Use topic '*' to receive all topics. Returns unsubscribe. */
  subscribe(agentId: string, topic: string, handler: MessageHandler): () => void {
    let topics = this.#subscribers.get(agentId);
    if (!topics) {
      topics = new Map();
      this.#subscribers.set(agentId, topics);
    }
    let handlers = topics.get(topic);
    if (!handlers) {
      handlers = new Set();
      topics.set(topic, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  /** Remove all subscriptions and neighbor links for an agent (call on kill). */
  removeAgent(agentId: string): void {
    this.#subscribers.delete(agentId);
    this.#neighbors.delete(agentId);
    for (const set of this.#neighbors.values()) set.delete(agentId);
  }

  /** Declare who an agent's neighbors are, for neighbor-only delivery. */
  setNeighbors(agentId: string, neighbors: readonly string[]): void {
    this.#neighbors.set(agentId, new Set(neighbors));
  }

  neighborsOf(agentId: string): string[] {
    return [...(this.#neighbors.get(agentId) ?? [])];
  }

  /** Direct (to = agent id) or broadcast (to = '*') publish. */
  publish(msg: BusMessage): void {
    this.#record(msg);
    if (msg.to === '*') {
      for (const [agentId] of this.#subscribers) {
        if (agentId !== msg.from) this.#deliver(agentId, msg);
      }
    } else {
      this.#deliver(msg.to, msg);
    }
  }

  /** Neighbor-only delivery: sends one direct message per declared neighbor. */
  publishToNeighbors(from: string, topic: string, body: unknown): void {
    for (const neighbor of this.#neighbors.get(from) ?? []) {
      this.publish({ from, to: neighbor, topic, body });
    }
  }

  #deliver(agentId: string, msg: BusMessage): void {
    const topics = this.#subscribers.get(agentId);
    if (!topics) return;
    const exact = topics.get(msg.topic);
    const wildcard = topics.get('*');
    for (const handler of exact ?? []) handler(msg);
    for (const handler of wildcard ?? []) handler(msg);
  }

  #record(msg: BusMessage): void {
    this.#trace?.append({
      t: 'message',
      ts: Date.now(),
      from: msg.from,
      to: msg.to,
      topic: msg.topic,
      body: msg.body,
    });
  }
}
