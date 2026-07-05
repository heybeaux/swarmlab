/**
 * The genetic operators: seed a population, mutate a genome, breed two parents,
 * and build the next generation from ranked survivors. All deterministic given a
 * seeded RNG so a config replays identically.
 *
 * Mutation operators (spec: word swap, instruction add/drop, tone shift):
 *   - ADD:  insert a random directive from the gene pool
 *   - DROP: remove a random directive
 *   - SWAP: replace a random directive with a fresh one from the pool
 *   - TONE: replace a directive with a meta (verbosity) directive
 * These are the *only* way theme genes can enter the pool from the raw pool, and
 * the only way they can be lost — so selection is the sole force that keeps them.
 */
import type { Directive, Genome, GenePool } from './genome.js';
import { fingerprint } from './genome.js';
import type { Rand } from './rng.js';
import { pick } from './rng.js';

const MAX_LEN = 10;

let counter = 0;
function nextId(gen: number): string {
  counter += 1;
  return `g${gen}-${counter.toString(36)}`;
}

function anyGene(rand: Rand, pool: GenePool): Directive | undefined {
  // Weighted toward distract+meta so theme genes are RARE to acquire by chance —
  // discovery must come from selection surviving a lucky mutation, not from a
  // pool that hands out the answer. This is what makes the climb non-trivial.
  const roll = rand();
  if (roll < 0.12) return pick(rand, pool.theme);
  if (roll < 0.56) return pick(rand, pool.distract);
  return pick(rand, pool.meta);
}

/** Seed an initial genome: mostly noise (distract/meta), rarely a theme gene. */
export function seedGenome(rand: Rand, pool: GenePool, gen: number): Genome {
  const len = 2 + Math.floor(rand() * 4);
  const directives: Directive[] = [];
  for (let i = 0; i < len; i += 1) {
    const g = anyGene(rand, pool);
    if (g) directives.push(g);
  }
  return { id: nextId(gen), directives };
}

export function seedPopulation(rand: Rand, pool: GenePool, n: number, gen: number): Genome[] {
  const pop: Genome[] = [];
  for (let i = 0; i < n; i += 1) pop.push(seedGenome(rand, pool, gen));
  return pop;
}

/** Apply one mutation operator to a genome, returning a NEW genome. */
export function mutate(rand: Rand, pool: GenePool, parent: Genome, gen: number): Genome {
  const d = [...parent.directives];
  const op = rand();
  if (op < 0.35 && d.length < MAX_LEN) {
    // ADD
    const g = anyGene(rand, pool);
    if (g) d.splice(Math.floor(rand() * (d.length + 1)), 0, g);
  } else if (op < 0.6 && d.length > 1) {
    // DROP
    d.splice(Math.floor(rand() * d.length), 1);
  } else if (op < 0.85 && d.length > 0) {
    // SWAP
    const g = anyGene(rand, pool);
    if (g) d[Math.floor(rand() * d.length)] = g;
  } else if (d.length > 0) {
    // TONE shift: force a meta directive in
    const m = pick(rand, pool.meta);
    if (m) d[Math.floor(rand() * d.length)] = m;
  }
  return { id: nextId(gen), directives: d.slice(0, MAX_LEN) };
}

/**
 * Single-point crossover of two parents' directive lists, then one mutation.
 * Offspring inherits a prefix of parent A and a suffix of parent B.
 */
export function breed(
  rand: Rand,
  pool: GenePool,
  a: Genome,
  b: Genome,
  gen: number,
): Genome {
  const cutA = Math.floor(rand() * (a.directives.length + 1));
  const cutB = Math.floor(rand() * (b.directives.length + 1));
  const child: Directive[] = [
    ...a.directives.slice(0, cutA),
    ...b.directives.slice(cutB),
  ].slice(0, MAX_LEN);
  const crossed: Genome = { id: nextId(gen), directives: child };
  return mutate(rand, pool, crossed, gen);
}

/** A scored genome: the harness attaches fitness after grading its output. */
export interface Scored {
  genome: Genome;
  fitness: number;
  detail: Record<string, number>;
}

/**
 * Build the next generation from this generation's scored population.
 * Elitism: top-`eliteK` survive unchanged. The rest are bred from the top half
 * (tournament-free, rank-weighted parent selection) with mutation. This is the
 * "breed the winners" step. Deterministic given `rand`.
 */
export function nextGeneration(
  rand: Rand,
  pool: GenePool,
  scored: readonly Scored[],
  opts: { size: number; eliteK: number; gen: number },
): Genome[] {
  const ranked = [...scored].sort((x, y) => y.fitness - x.fitness);
  const elites = ranked.slice(0, opts.eliteK).map((s) => s.genome);
  // Parent pool = top half (at least 2), so losers don't breed.
  const cutoff = Math.max(2, Math.floor(ranked.length / 2));
  const parents = ranked.slice(0, cutoff).map((s) => s.genome);
  const next: Genome[] = [...elites];
  while (next.length < opts.size) {
    const a = pick(rand, parents);
    const b = pick(rand, parents);
    if (!a || !b) break;
    next.push(breed(rand, pool, a, b, opts.gen));
  }
  return next.slice(0, opts.size);
}

/** Diversity = distinct genome fingerprints / population size (1 = all unique). */
export function diversity(pop: readonly Genome[]): number {
  if (pop.length === 0) return 0;
  const fps = new Set(pop.map(fingerprint));
  return fps.size / pop.length;
}
