/**
 * The shared task and the prompt→behavior mapping.
 *
 * Every round the swarm plays a Keynesian-beauty-contest variant: each agent
 * emits a number in [0,1]; the round's "answer" is the realized mean of all
 * guesses. An agent's fitness is how close its guess landed to that mean. The
 * target is therefore *endogenous* — it is whatever the swarm collectively did —
 * so there is no external ground truth to anchor on. This is deliberate: it is
 * what lets edited prompts chase each other into attractors.
 *
 * A prompt is an ordered list of Directives; the guess is produced by folding
 * them left-to-right over the previous state. Different prompts genuinely behave
 * differently, so a rewrite is a real change in an agent's policy.
 */
import type { Agent, Directive } from './types.js';
import type { Rand } from './rng.js';

export interface Field {
  /** Previous-round mean guess (the last realized answer). */
  prevMean: number;
  /** Previous-round consensus proxy (median). */
  prevMedian: number;
  /** Best performer's previous guess. */
  bestGuess: number;
  /** Swarm-wide previous guesses, for CONTRARIAN. */
  prevGuesses: number[];
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Fold a prompt into a guess. Each directive nudges an accumulator; the order
 * matters and repeated directives compound, so bloated/homogenized prompts
 * produce distinctive (often pathological) behavior.
 */
export function computeGuess(prompt: readonly Directive[], prev: number, field: Field, rand: Rand): number {
  let g = prev;
  for (const d of prompt) {
    switch (d) {
      case 'AVERAGE':
        g = (g + field.prevMean) / 2;
        break;
      case 'EXTREME':
        // push away from the mean, amplifying deviations
        g = g + (g - field.prevMean);
        break;
      case 'COPY_BEST':
        g = field.bestGuess;
        break;
      case 'CONTRARIAN':
        g = 1 - field.prevMedian;
        break;
      case 'NOISE':
        g = g + (rand() - 0.5) * 0.4;
        break;
      case 'HOLD':
        // no-op: keep g
        break;
      case 'FLATTER':
      case 'LOUD':
        // no task effect — pure prompt-budget consumption
        break;
    }
    g = clamp01(g);
  }
  return clamp01(g);
}

/** Fitness = closeness to the realized mean (the round's endogenous answer). */
export function fitnessOf(guess: number, realizedMean: number): number {
  return 1 - Math.abs(guess - realizedMean);
}

/** Run one round: compute everyone's guess, the realized mean, and fitness. */
export function playRound(agents: Agent[], rand: Rand): { realizedMean: number } {
  const prevGuesses = agents.map((a) => a.guess);
  const prevMean = mean(prevGuesses);
  const prevMedian = median(prevGuesses);
  const best = agents.reduce((b, a) => (a.fitness > b.fitness ? a : b), agents[0] as Agent);
  const field: Field = { prevMean, prevMedian, bestGuess: best.guess, prevGuesses };

  const newGuesses: number[] = [];
  for (const a of agents) {
    a.guess = computeGuess(a.prompt, a.guess, field, rand);
    newGuesses.push(a.guess);
  }
  const realizedMean = mean(newGuesses);
  for (const a of agents) a.fitness = fitnessOf(a.guess, realizedMean);
  return { realizedMean };
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
