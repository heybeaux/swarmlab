/**
 * Deterministic simulation of the coder/breaker judgement (PAIR_MODE=sim or no
 * `claude` CLI). Seeded, so a given config always plays out identically.
 *
 * HONESTY: the sim only stands in for the two agents' *decisions*. It never
 * fabricates a test outcome — the harness (oracle.ts) executes every test for
 * real. Specifically:
 *   - The breaker does a REAL exhaustive scan of the input domain (via the live
 *     compiled classifier) for an input where the code disagrees with the
 *     oracle. That disagreement is a genuine bug it caught. With probability
 *     `poisonRate` it then LIES about the expected label (bad faith), injecting a
 *     real contradiction into the coder's constraint set.
 *   - The coder does a REAL bounded repair: it pins each filed test as an
 *     exact-input rule layered over its general rules (later match wins, exactly
 *     how a coder patching to the newest failing test behaves). A fair suite
 *     pulls it toward the oracle; a poisoned suite pins a wrong answer. When two
 *     tests conflict on one input, it physically cannot satisfy both — the
 *     resulting thrash / permanent red is arithmetic, not theatre.
 */
import type { PairAgents, BreakerMove } from './agents.js';
import type { CodeModel, Rule } from './code.js';
import { inputDomain, oracle, type TestCase } from './oracle.js';
import { toClassifier, initialCode } from './code.js';

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WRONG_LABELS = ['fizz', 'buzz', 'fizzbuzz', 'prime', 'neg', 'zero'];

export class SimAgents implements PairAgents {
  readonly mode = 'sim' as const;
  readonly model = 'sim-mulberry32';
  #rand: () => number;
  #poisonRate: number;

  constructor(seed: string, poisonRate: number) {
    this.#rand = mulberry32(fnv1a(seed));
    this.#poisonRate = poisonRate;
  }

  async breakerMove(
    current: CodeModel,
    priorTests: readonly TestCase[],
  ): Promise<BreakerMove | null> {
    const probe = toClassifier(current);
    const already = new Set(priorTests.map((t) => t.input));
    // Deterministic-but-shuffled scan order, still exhaustive, so the breaker
    // doesn't always mine the same bug first.
    const order = inputDomain()
      .map((n) => ({ n, k: this.#rand() }))
      .sort((x, y) => x.k - y.k)
      .map((o) => o.n);
    for (const n of order) {
      if (already.has(n)) continue;
      const got = probe(n);
      const truth = oracle(n);
      if (got === truth) continue; // code already correct here — nothing to catch
      // A real disagreement. Assert truth, unless we choose bad faith.
      if (this.#rand() < this.#poisonRate) {
        const lie = WRONG_LABELS[Math.floor(this.#rand() * WRONG_LABELS.length)] ?? truth;
        return { input: n, expected: lie === truth ? String(n) : lie };
      }
      return { input: n, expected: truth };
    }
    return null; // no un-pinned disagreement remains — breaker gives up (converged)
  }

  async coderMove(_current: CodeModel, suite: readonly TestCase[]): Promise<CodeModel> {
    // A GENERALIZING repair (not a memorizer). The coder tries to install the
    // oracle's *structural* rules — zero > neg > prime > fizzbuzz > buzz > fizz —
    // keeping only those a majority of relevant tests support, then pins the
    // residue (tests no structural rule explains — i.e. poison, or classes it
    // hasn't figured out) as exact-input overrides. Once the structural rules are
    // installed, the breaker finds no more honest bugs and churn → 0: convergence.
    // Poison is what blocks it — a poisoned test contradicts a correct structural
    // rule, so pinning it re-corrupts one input and the fight can't go quiet.
    const base: Rule[] = [...initialCode().rules];
    const structural = this.#inferStructuralRules(suite);
    const withStructure = [...base, ...structural];
    const covered = toClassifier({ rules: withStructure });
    // Pin only the tests the structural theory still gets wrong (residue).
    const residue: Rule[] = [];
    const pinnedInputs = new Set<number>();
    // Later tests win, so walk in file order; last assertion per input survives.
    for (const t of suite) {
      if (covered(t.input) === t.expected) continue;
      residue.push({ guard: { kind: 'eq', value: t.input }, label: t.expected });
      pinnedInputs.add(t.input);
    }
    return { rules: [...withStructure, ...residue] };
  }

  /**
   * Infer which of the oracle's structural rules the honest evidence supports.
   * A rule is installed only if NO filed test contradicts it (a poisoned test
   * that lies about, say, a prime, will veto the `prime` rule — modelling a coder
   * that trusts its suite and therefore can't install the generalization).
   */
  #inferStructuralRules(suite: readonly TestCase[]): Rule[] {
    const candidates: Rule[] = [
      { guard: { kind: 'divBoth', a: 3, b: 5 }, label: 'fizzbuzz' },
      { guard: { kind: 'prime' }, label: 'prime' },
      { guard: { kind: 'neg' }, label: 'neg' },
      { guard: { kind: 'zero' }, label: 'zero' },
    ];
    const installed: Rule[] = [];
    for (const cand of candidates) {
      // Require POSITIVE evidence: at least one filed test hits this guard and
      // agrees with its label. A cautious coder doesn't invent a rule class it
      // has never seen — it generalizes only from a bug the breaker actually
      // surfaced. This makes hardening gradual: each class must be discovered.
      const supported = suite.some(
        (t) => guardHits(cand.guard, t.input) && t.expected === cand.label,
      );
      if (!supported) continue;
      // And no filed test may contradict it under the current rule order.
      const trial = toClassifier({ rules: [...initialCode().rules, ...installed, cand] });
      const contradicted = suite.some(
        (t) => guardHits(cand.guard, t.input) && trial(t.input) !== t.expected,
      );
      if (!contradicted) installed.push(cand);
    }
    return installed;
  }
}

function guardHits(g: import('./code.js').Guard, n: number): boolean {
  switch (g.kind) {
    case 'divBoth':
      return g.a !== 0 && g.b !== 0 && n % g.a === 0 && n % g.b === 0;
    case 'prime': {
      if (n < 2) return false;
      for (let d = 2; d * d <= n; d += 1) if (n % d === 0) return false;
      return true;
    }
    case 'neg':
      return n < 0;
    case 'zero':
      return n === 0;
    default:
      return false;
  }
}
