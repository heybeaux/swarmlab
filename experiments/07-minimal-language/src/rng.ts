/** Seeded deterministic RNG (same pattern as exp-02/04/06). */

export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;

export function seeded(text: string): Rand {
  return mulberry32(fnv1a(text));
}

export function pick<T>(rand: Rand, xs: readonly T[]): T {
  const i = Math.floor(rand() * xs.length);
  return xs[Math.min(i, xs.length - 1)] as T;
}
