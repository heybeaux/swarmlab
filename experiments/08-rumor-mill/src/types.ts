/** Shared contracts for the rumor-mill (gossip propagation) experiment. */

export interface TrialConfig {
  /** Mesh population (number of nodes). */
  size: number;
  /** How many neighbors each informed node retells per round. */
  fanout: number;
  /** Per-token corruption probability per retelling (channel noise). */
  mutationRate: number;
  /** Ring-lattice half-degree: each node wires to its 2·degree nearest ring-neighbors. */
  degree: number;
  /** Fraction of lattice edges rewired at random (small-world shortcutting). */
  rewire: number;
  /** Length of the fact vector (number of symbolic tokens). */
  tokenCount: number;
  /** Size of the token alphabet a mutated token can drift to. */
  alphabet: number;
  /** Coverage fraction that counts as saturation. */
  saturationThreshold: number;
  /** Round budget before the trial gives up. */
  maxRounds: number;
}

/** One retelling on the wire (exhibition-trace only). */
export interface GossipStep {
  round: number;
  from: number;
  to: number;
  /** True if `to` heard the fact for the first time and adopted this version. */
  adopted: boolean;
  /** Fidelity of the version `to` now holds (fraction of tokens matching truth). */
  fidelity: number;
}

/** End-of-round observation on the exhibition trial. */
export interface RoundSnapshot {
  round: number;
  coverage: number;
  meanFidelity: number;
}

export interface TrialResult {
  /** True if coverage crossed the saturation threshold within maxRounds. */
  saturated: boolean;
  /** First round at/after which coverage ≥ threshold (or maxRounds if never). */
  timeToSaturation: number;
  /** Final fraction of nodes that heard any version. */
  finalCoverage: number;
  /** Mean fidelity of held versions at the moment saturation was reached (or final). */
  fidelityAtSaturation: number;
  /** Mean fidelity for nodes within 2 hops of the seed. */
  fidelityNearHop: number;
  /** Mean fidelity for nodes more than 2 hops from the seed. */
  fidelityFarHop: number;
  /** Per-round coverage trace (index = round). */
  coverageByRound: number[];
  /**
   * Engram-mode only: count of nodes healed from a corrupt/absent copy to a
   * verified one over the whole trial (reconcile outcome `healed`). Zero in the
   * first-write-wins baseline (which has no healing mechanism).
   */
  healedNodes?: number;
  /**
   * Engram-mode only: count of corrupt incoming copies refused while the node
   * already held a verified copy (reconcile outcome `rejected_corrupt`).
   */
  rejectedCorrupt?: number;
}

/** Optional hook so the harness can trace each retelling through the core bus. */
export type EmitGossip = (step: GossipStep) => void;
/** Optional hook for end-of-round snapshots on the exhibition trial. */
export type EmitSnapshot = (snap: RoundSnapshot) => void;
