import type { TextGen } from './gen.js';

/**
 * Deterministic simulation of the lossy spec→code→spec channel, for offline
 * runs (TELEPHONE_MODE=sim or no `claude` CLI). Seeded by input text, so a
 * given round always degrades the same way. Loss rates are made up but
 * directionally honest: English→code drops modifiers and perturbs numbers;
 * code→English drops words and invents post-hoc framing.
 *
 * A sim trace must never be presented as an LLM result — the run's `meta`
 * event records the mode.
 */

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

const MODIFIERS = new Set([
  'only', 'exactly', 'at', 'most', 'least', 'nearest', 'started', 'free',
  'flat', 'pre-cap', 'verbatim', 'precisely',
]);

const INVENTED = [
  'Invalid or negative inputs return zero.',
  'All monetary values are handled as floating point numbers.',
  'The function performs no input validation beyond basic checks.',
  'Results are returned as a single numeric value.',
];

const CANONICAL_SPEC = `Parking garage fee calculator. Input: entry time, exit time, vehicle type (standard or electric), lost ticket flag, and whether the day is a weekend. Output: total fee in dollars. Rules: the first 15 minutes are free. After that, parking costs 3.50 dollars per started hour. The daily total is capped at 24.00 dollars, but on weekends the cap drops to 18.00 dollars. A lost ticket incurs a flat fee of 45 dollars regardless of duration. Electric vehicles receive a 20 percent discount on the pre-cap total, rounded to the nearest 0.25 dollars.`;

function perturbNumber(token: string, rand: () => number): string {
  if (rand() < 0.5) {
    const n = Number(token);
    return String(Math.max(1, Math.round(n) + (rand() < 0.5 ? -1 : 1)));
  }
  return token.split('.')[0] ?? token;
}

function specToCode(spec: string, rand: () => number): string {
  const sentences = spec.split(/(?<=[.;])\s+/).filter((s) => s.trim().length > 0);
  const lines: string[] = ['export function computeFee(input: FeeInput): number {'];
  let i = 0;
  for (const sentence of sentences) {
    if (rand() < 0.08) continue; // whole rule silently dropped
    const kept = sentence
      .split(/\s+/)
      .filter((w) => !(MODIFIERS.has(w.toLowerCase().replace(/[^a-z-]/g, '')) && rand() < 0.2))
      .map((w) => (/^\d+(?:\.\d+)?$/.test(w) && rand() < 0.15 ? perturbNumber(w, rand) : w))
      .join(' ');
    i += 1;
    lines.push(`  // ${kept}`);
    lines.push(`  // rule${i} applied below`);
  }
  lines.push('  return total;');
  lines.push('}');
  return lines.join('\n');
}

function codeToSpec(code: string, rand: () => number): string {
  const comments = code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('//') && !l.includes('applied below'))
    .map((l) => l.replace(/^\/\/\s*/, ''));
  const sentences = comments.map((c) =>
    c
      .split(/\s+/)
      .filter(() => rand() >= 0.05)
      .join(' '),
  );
  if (rand() < 0.35) {
    sentences.push(INVENTED[Math.floor(rand() * INVENTED.length)] ?? '');
  }
  return sentences.join(' ');
}

export class SimGen implements TextGen {
  readonly mode = 'sim' as const;
  readonly model = 'sim-mulberry32';

  async gen(systemPrompt: string, user: string): Promise<string> {
    const rand = mulberry32(fnv1a(systemPrompt.slice(0, 24) + user));
    if (systemPrompt.includes('[role:speccer]')) return CANONICAL_SPEC;
    if (systemPrompt.includes('[role:coder]')) return specToCode(user, rand);
    if (systemPrompt.includes('[role:respeccer]')) return codeToSpec(user, rand);
    throw new Error('SimGen: unknown role in system prompt');
  }
}
