/**
 * Deterministic, offline metrics for the adversarial pair. All replayable by the
 * observatory with zero API calls: churn is computed from the code text in the
 * trace, everything else from executed suite results.
 */

/** Split source into tokens for edit-distance churn. */
export function tokenize(source: string): string[] {
  return source.match(/[A-Za-z_]\w*|\d+|\S/g) ?? [];
}

/** Levenshtein distance over token arrays (O(n*m), fine for short sources). */
export function editDistance(a: readonly string[], b: readonly string[]): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);
  for (let j = 0; j <= m; j += 1) prev[j] = j;
  for (let i = 1; i <= n; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= m; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m] ?? 0;
}

/** Normalized token churn between two source revisions, 0 (identical) .. 1. */
export function churn(prevSource: string, nextSource: string): number {
  const a = tokenize(prevSource);
  const b = tokenize(nextSource);
  const denom = Math.max(a.length, b.length);
  if (denom === 0) return 0;
  return round3(editDistance(a, b) / denom);
}

/**
 * Convergence tracker: the fight is a fixed point once the suite is fully green
 * AND the code has stopped moving for a stable window. Both conditions matter —
 * green-but-still-churning means the coder is still fighting; quiet-but-red means
 * a contradiction (poison) it cannot satisfy.
 */
export class ConvergenceTracker {
  #window: number;
  #quietGreenRounds = 0;

  constructor(window = 3) {
    this.#window = window;
  }

  /** Feed a round; returns 1 if converged as of this round, else 0. */
  update(passRate: number, roundChurn: number): number {
    if (passRate >= 1 && roundChurn === 0) this.#quietGreenRounds += 1;
    else this.#quietGreenRounds = 0;
    return this.#quietGreenRounds >= this.#window ? 1 : 0;
  }
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
