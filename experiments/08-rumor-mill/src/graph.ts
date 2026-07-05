/**
 * Watts–Strogatz-style small-world mesh builder. Start from a ring lattice where each
 * node is wired to its `2·degree` nearest ring-neighbors, then rewire each edge with
 * probability `rewire` to a random target — this injects the long shortcuts that make
 * gossip reach the far side of the ring fast without abandoning local structure.
 *
 * The graph is undirected: an edge added during rewiring is mirrored on both endpoints.
 */
import type { Rand } from './rng.js';

export interface Graph {
  size: number;
  /** neighbors[i] = sorted unique node ids adjacent to i. */
  neighbors: readonly (readonly number[])[];
}

export function buildGraph(
  size: number,
  degree: number,
  rewire: number,
  rand: Rand,
): Graph {
  const sets: Set<number>[] = Array.from({ length: size }, () => new Set<number>());
  const link = (a: number, b: number): void => {
    if (a === b) return;
    sets[a]?.add(b);
    sets[b]?.add(a);
  };

  // Ring lattice: each node to its `degree` nearest neighbors on each side.
  for (let i = 0; i < size; i += 1) {
    for (let k = 1; k <= degree; k += 1) {
      link(i, (i + k) % size);
    }
  }

  // Rewire: for each lattice edge (i, i+k), with prob `rewire` move it to a random target.
  for (let i = 0; i < size; i += 1) {
    for (let k = 1; k <= degree; k += 1) {
      const j = (i + k) % size;
      if (rand() >= rewire) continue;
      sets[i]?.delete(j);
      sets[j]?.delete(i);
      let target = Math.floor(rand() * size);
      let guard = 0;
      while ((target === i || sets[i]?.has(target)) && guard < size) {
        target = (target + 1) % size;
        guard += 1;
      }
      link(i, target);
    }
  }

  const neighbors: number[][] = sets.map((s) => [...s].sort((a, b) => a - b));
  return { size, neighbors };
}

/**
 * BFS graph distance from `source` to every node. Unreachable nodes get Infinity.
 * Used to bucket fidelity by hop-distance from the seed (the telephone gradient).
 */
export function hopDistances(graph: Graph, source: number): number[] {
  const dist = new Array<number>(graph.size).fill(Number.POSITIVE_INFINITY);
  dist[source] = 0;
  const queue: number[] = [source];
  let head = 0;
  while (head < queue.length) {
    const node = queue[head];
    head += 1;
    if (node === undefined) continue;
    const d = dist[node] ?? Number.POSITIVE_INFINITY;
    for (const nb of graph.neighbors[node] ?? []) {
      if ((dist[nb] ?? Number.POSITIVE_INFINITY) > d + 1) {
        dist[nb] = d + 1;
        queue.push(nb);
      }
    }
  }
  return dist;
}
