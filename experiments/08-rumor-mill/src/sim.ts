/**
 * Deterministic gossip engine. A fact — a fixed-length vector of `tokenCount` symbols —
 * is planted in one node of a small-world mesh. Each round, every informed node picks
 * `fanout` of its neighbors at random and retells its held version. A retelling is a
 * LOSSY RE-ENCODE: every token independently drifts to a wrong symbol with probability
 * `mutationRate`, so the version that reaches a node depends on how many hops (and how
 * much noise) it crossed. Adoption is FIRST-WRITE-WINS (Engram's "memory is sticky"):
 * a node keeps whatever version it first heard; later, possibly-better retellings do not
 * overwrite it. That asymmetry is the whole point — coverage races ahead while the frozen
 * early (often mangled) versions never self-correct.
 */
import type { Rand } from './rng.js';
import { buildGraph, hopDistances } from './graph.js';
import type {
  EmitGossip,
  EmitSnapshot,
  TrialConfig,
  TrialResult,
} from './types.js';

const TRUTH_SYMBOL = 0;

/** Fraction of tokens still matching ground truth (all-zeros). Higher = more faithful. */
function fidelity(version: readonly number[]): number {
  if (version.length === 0) return 1;
  let matches = 0;
  for (const tok of version) if (tok === TRUTH_SYMBOL) matches += 1;
  return matches / version.length;
}

/** Re-encode a version for one retelling: each token drifts to a wrong symbol w.p. mutationRate. */
function retell(version: readonly number[], cfg: TrialConfig, rand: Rand): number[] {
  const out = new Array<number>(version.length);
  for (let i = 0; i < version.length; i += 1) {
    const tok = version[i] ?? TRUTH_SYMBOL;
    if (rand() < cfg.mutationRate) {
      // Drift to some symbol in [1, alphabet-1] (never back to truth by mutation).
      out[i] = 1 + Math.floor(rand() * Math.max(1, cfg.alphabet - 1));
    } else {
      out[i] = tok;
    }
  }
  return out;
}

function pickNeighbors(neighbors: readonly number[], fanout: number, rand: Rand): number[] {
  if (neighbors.length <= fanout) return [...neighbors];
  // Partial Fisher–Yates: draw `fanout` distinct neighbors.
  const pool = [...neighbors];
  const picked: number[] = [];
  for (let f = 0; f < fanout; f += 1) {
    const j = f + Math.floor(rand() * (pool.length - f));
    const a = pool[f];
    const b = pool[j];
    if (a !== undefined && b !== undefined) {
      pool[f] = b;
      pool[j] = a;
    }
    const chosen = pool[f];
    if (chosen !== undefined) picked.push(chosen);
  }
  return picked;
}

export function runTrial(
  cfg: TrialConfig,
  rand: Rand,
  emit?: EmitGossip,
  emitSnap?: EmitSnapshot,
): TrialResult {
  const graph = buildGraph(cfg.size, cfg.degree, cfg.rewire, rand);
  const seed = Math.floor(rand() * cfg.size);
  const dist = hopDistances(graph, seed);

  const truth: number[] = new Array<number>(cfg.tokenCount).fill(TRUTH_SYMBOL);
  const held: (number[] | null)[] = new Array<number[] | null>(cfg.size).fill(null);
  held[seed] = [...truth];

  const coverageByRound: number[] = [];
  let informed = 1;
  let saturated = false;
  let timeToSaturation = cfg.maxRounds;
  const satCount = Math.ceil(cfg.saturationThreshold * cfg.size);

  const coverageNow = (): number => informed / cfg.size;
  const meanFidelityNow = (): number => {
    let sum = 0;
    let n = 0;
    for (const v of held) {
      if (v) {
        sum += fidelity(v);
        n += 1;
      }
    }
    return n === 0 ? 0 : sum / n;
  };

  for (let round = 0; round < cfg.maxRounds; round += 1) {
    // Snapshot the informed set at round start so retellings within a round don't cascade.
    const senders: number[] = [];
    for (let i = 0; i < cfg.size; i += 1) if (held[i]) senders.push(i);

    for (const from of senders) {
      const version = held[from];
      if (!version) continue;
      const targets = pickNeighbors(graph.neighbors[from] ?? [], cfg.fanout, rand);
      for (const to of targets) {
        const wire = retell(version, cfg, rand);
        const first = held[to] === null;
        if (first) {
          held[to] = wire;
          informed += 1;
        }
        emit?.({ round, from, to, adopted: first, fidelity: round3(fidelity(wire)) });
      }
    }

    coverageByRound.push(round3(coverageNow()));
    emitSnap?.({
      round,
      coverage: round3(coverageNow()),
      meanFidelity: round3(meanFidelityNow()),
    });

    if (!saturated && informed >= satCount) {
      saturated = true;
      timeToSaturation = round;
    }
    if (informed >= cfg.size) break;
  }

  const fidelityAtSaturation = round3(meanFidelityNow());

  // Hop-bucketed fidelity: near (≤2 hops) vs far (>2) from the seed.
  let nearSum = 0;
  let nearN = 0;
  let farSum = 0;
  let farN = 0;
  for (let i = 0; i < cfg.size; i += 1) {
    const v = held[i];
    if (!v) continue;
    const f = fidelity(v);
    if ((dist[i] ?? Number.POSITIVE_INFINITY) <= 2) {
      nearSum += f;
      nearN += 1;
    } else {
      farSum += f;
      farN += 1;
    }
  }

  return {
    saturated,
    timeToSaturation,
    finalCoverage: round3(coverageNow()),
    fidelityAtSaturation,
    fidelityNearHop: round3(nearN === 0 ? 0 : nearSum / nearN),
    fidelityFarHop: round3(farN === 0 ? 0 : farSum / farN),
    coverageByRound,
  };
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
