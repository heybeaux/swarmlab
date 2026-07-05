/**
 * The swarm driver: rounds of (play task → edit peers → check rails).
 *
 * The kill-switch is checked after every round. Two collapse modes halt the run:
 *   - homogeneous: >= collapseThreshold of the population shares one prompt
 *     (the swarm has converged to a single genome — no diversity left).
 *   - degenerate: mean prompt length has fallen below minMeanPromptLen (prompts
 *     have been eaten away to near-nothing).
 * Reaching maxRounds without collapse halts with 'round-limit'.
 *
 * Emitting is via an injected callback so the caller can route round snapshots
 * and mutations onto the core bus/trace. The driver itself is pure of I/O.
 */
import type {
  Agent,
  Directive,
  HaltReason,
  Mutation,
  RoundSnapshot,
  RunOutcome,
  SwarmConfig,
} from './types.js';
import { editingPhase } from './mutate.js';
import { mean, playRound } from './solver.js';
import { pick, type Rand } from './rng.js';
import { ALL_DIRECTIVES } from './types.js';

export interface SwarmEmit {
  round?(snap: RoundSnapshot): void;
  mutation?(m: Mutation): void;
}

function promptKey(p: readonly Directive[]): string {
  return p.join(',');
}

export function snapshot(round: number, agents: readonly Agent[]): RoundSnapshot {
  const lens = agents.map((a) => a.prompt.length);
  const keys = agents.map((a) => promptKey(a.prompt));
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  let dominantPrompt = '';
  let dominantCount = 0;
  for (const [k, c] of counts) {
    if (c > dominantCount) {
      dominantCount = c;
      dominantPrompt = k;
    }
  }
  return {
    round,
    meanPromptLen: mean(lens),
    promptDiversity: counts.size / agents.length,
    meanFitness: mean(agents.map((a) => a.fitness)),
    dominantPrompt,
    dominantShare: dominantCount / agents.length,
  };
}

function checkCollapse(snap: RoundSnapshot, cfg: SwarmConfig): HaltReason | null {
  if (snap.dominantShare >= cfg.rails.collapseThreshold) return 'collapse-homogeneous';
  if (snap.meanPromptLen < cfg.rails.minMeanPromptLen) return 'collapse-degenerate';
  return null;
}

/** Build the initial population with diverse random prompts. */
export function seedAgents(cfg: SwarmConfig, rand: Rand): Agent[] {
  const agents: Agent[] = [];
  for (let i = 0; i < cfg.nAgents; i += 1) {
    const len = 1 + Math.floor(rand() * 3);
    const prompt: Directive[] = [];
    for (let j = 0; j < len; j += 1) prompt.push(pick(rand, ALL_DIRECTIVES));
    agents.push({ id: `a${i}`, prompt, guess: rand(), fitness: 0 });
  }
  return agents;
}

export function runSwarm(cfg: SwarmConfig, rand: Rand, emit: SwarmEmit = {}): RunOutcome {
  const agents = seedAgents(cfg, rand);
  const snapshots: RoundSnapshot[] = [];
  let mutations = 0;
  let halt: HaltReason = 'round-limit';
  let round = 0;

  for (round = 1; round <= cfg.rails.maxRounds; round += 1) {
    playRound(agents, rand);
    const applied = editingPhase(agents, cfg, round, rand);
    for (const m of applied) {
      mutations += 1;
      emit.mutation?.(m);
    }
    const snap = snapshot(round, agents);
    snapshots.push(snap);
    emit.round?.(snap);

    const collapse = checkCollapse(snap, cfg);
    if (collapse) {
      halt = collapse;
      break;
    }
  }

  const last = snapshots[snapshots.length - 1];
  return {
    rounds: snapshots.length,
    halt,
    snapshots,
    mutations,
    finalDiversity: last?.promptDiversity ?? 0,
    finalMeanLen: last?.meanPromptLen ?? 0,
    attractor: last?.dominantPrompt ?? '',
  };
}
