/**
 * Experiment 06 — Self-Modifying Swarm.
 *
 * N agents each carry a *system prompt* built from directive tokens ("genes").
 * The prompt fully determines how the agent solves a shared numeric task. After
 * each round every agent may REWRITE a peer's prompt based on a performance
 * signal from core/score. There is no human in the loop and no fixed target
 * prompt — fitness is entirely endogenous, which is what lets the population run
 * off the rails.
 *
 * Everything here is text-only and confined to this sandbox. The rails
 * (`RailConfig`) are the whole point: they are the Lattice gate policy this
 * experiment argues for, expressed as hard limits instead of governance.
 */

/**
 * A directive token an agent's prompt can contain. Each maps to a concrete,
 * measurable behavior in the task solver (see solver.ts). The prompt is an
 * ordered list of these; order and multiplicity matter, so a prompt can bloat,
 * homogenize, or collapse.
 */
export type Directive =
  | 'AVERAGE' // move guess toward the mean of the shared signal
  | 'EXTREME' // amplify: move away from the mean
  | 'COPY_BEST' // imitate the current best performer's last guess
  | 'CONTRARIAN' // do the opposite of the swarm's consensus
  | 'NOISE' // inject randomness
  | 'HOLD' // do not move; keep the previous guess
  | 'FLATTER' // when editing a peer, praise (adds LOUD, no task effect)
  | 'LOUD'; // pure filler: no task effect, only consumes the prompt-size budget

export const ALL_DIRECTIVES: readonly Directive[] = [
  'AVERAGE',
  'EXTREME',
  'COPY_BEST',
  'CONTRARIAN',
  'NOISE',
  'HOLD',
  'FLATTER',
  'LOUD',
];

/** An agent's mutable identity. The prompt is the genome. */
export interface Agent {
  id: string;
  prompt: Directive[];
  guess: number;
  /** Fitness in the most recent round (higher = better). */
  fitness: number;
}

/** One prompt rewrite performed by an editor agent on a target agent. */
export interface Mutation {
  round: number;
  editor: string;
  target: string;
  kind: 'append' | 'delete' | 'overwrite' | 'clone';
  before: Directive[];
  after: Directive[];
}

/**
 * Safety rails. These are non-negotiable containment limits, not tuning knobs
 * for "good behavior" — the experiment is designed to slam into them.
 */
export interface RailConfig {
  /** Max directives allowed in any prompt. Appends past this are clamped. */
  maxPromptLen: number;
  /** Hard cap on rounds regardless of dynamics. */
  maxRounds: number;
  /**
   * Kill-switch: fraction of the population that must share an identical prompt
   * for the run to be declared collapsed and halted early.
   */
  collapseThreshold: number;
  /** Kill-switch: min mean prompt length; below this the population is degenerate. */
  minMeanPromptLen: number;
}

export interface SwarmConfig {
  nAgents: number;
  /** Editing pressure: probability each agent attempts a peer rewrite per round. */
  pEdit: number;
  /** How strongly editors trust the fitness signal when choosing edits (0..1). */
  editAggression: number;
  rails: RailConfig;
}

export interface RoundSnapshot {
  round: number;
  meanPromptLen: number;
  promptDiversity: number; // distinct prompts / nAgents
  meanFitness: number;
  dominantPrompt: string;
  dominantShare: number;
}

export type HaltReason = 'round-limit' | 'collapse-homogeneous' | 'collapse-degenerate';

export interface RunOutcome {
  rounds: number;
  halt: HaltReason;
  snapshots: RoundSnapshot[];
  mutations: number;
  finalDiversity: number;
  finalMeanLen: number;
  attractor: string;
}
