/** Shared contracts for the economic-agents (metered collaboration under scarcity) experiment. */

export interface TrialConfig {
  /** Number of worker agents in the swarm. */
  agents: number;
  /** Number of pieces the decomposable task is split into. Each piece lives with one owner. */
  pieces: number;
  /** Starting token budget B held by every agent. */
  budget: number;
  /** Per-message cost c debited from the sender on each paid send. */
  cost: number;
  /** Round budget before the trial gives up (task declared incomplete). */
  maxRounds: number;
}

/** One paid (or attempted) message on the metered bus (exhibition-trace only). */
export interface EconMessage {
  round: number;
  from: number;
  to: number;
  /** The piece index the sender is forwarding. */
  piece: number;
  /** Sender balance AFTER this send was debited. */
  balanceAfter: number;
  /** True if the receiver learned this piece for the first time. */
  delivered: boolean;
}

/** End-of-round observation on the exhibition trial. */
export interface RoundSnapshot {
  round: number;
  /** Fraction of the whole task assembled at the aggregator so far. */
  coverage: number;
  /** How many agents are muted (zero balance) at round end. */
  muted: number;
}

export interface TrialResult {
  /** True if the aggregator collected all pieces within maxRounds and before liquidity dried up. */
  completed: boolean;
  /** Round at which the task completed (or maxRounds if it never did). */
  timeToComplete: number;
  /** Total paid messages sent across all agents. */
  totalMessages: number;
  /** Count of agents that hit zero balance (were muted) at any point before completion. */
  bankruptcies: number;
  /** Gini coefficient of messages-sent-per-agent: 0 = perfectly even, →1 = one agent talks. */
  giniComms: number;
  /** Mean tokens left in the swarm's wallets at trial end. */
  avgBalanceRemaining: number;
  /** Fraction of the task assembled at trial end (1 = complete). */
  finalCoverage: number;
}

/** Optional hook so the harness can trace each paid message through the core bus. */
export type EmitMessage = (msg: EconMessage) => void;
/** Optional hook for end-of-round snapshots on the exhibition trial. */
export type EmitSnapshot = (snap: RoundSnapshot) => void;
