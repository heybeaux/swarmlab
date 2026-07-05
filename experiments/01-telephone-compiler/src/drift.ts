/**
 * Deterministic, offline drift metrics. spec_N is always measured against
 * spec_0 — no embeddings, so the observatory can recompute these on replay.
 */

const STOPWORDS = new Set(
  (
    'a an and are as at be but by for from has have if in into is it its of on or ' +
    'that the this to was were will with you your not no than then when which who ' +
    'each per any all must should shall may can do does did done given returns return ' +
    'function value values number amount total input inputs output outputs'
  ).split(' '),
);

export function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z'-]*|\d+(?:\.\d+)?/g) ?? [];
}

export function contentWords(text: string): Set<string> {
  return new Set(words(text).filter((w) => !STOPWORDS.has(w) && w.length > 2 && !/^\d/.test(w)));
}

/** Numeric literals, normalized (3.50 and 3.5 count as the same cargo). */
export function numericLiterals(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.match(/\d+(?:\.\d+)?/g) ?? []) {
    out.add(String(Number(m)));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function retention(original: Set<string>, current: Set<string>): number {
  if (original.size === 0) return 1;
  let kept = 0;
  for (const w of original) if (current.has(w)) kept += 1;
  return kept / original.size;
}

export interface DriftScores extends Record<string, number> {
  round: number;
  jaccard: number;
  numberRetention: number;
  contentRetention: number;
  lengthRatio: number;
}

export function drift(spec0: string, specN: string, round: number): DriftScores {
  const w0 = words(spec0);
  const wN = words(specN);
  return {
    round,
    jaccard: round3(jaccard(contentWords(spec0), contentWords(specN))),
    numberRetention: round3(retention(numericLiterals(spec0), numericLiterals(specN))),
    contentRetention: round3(retention(contentWords(spec0), contentWords(specN))),
    lengthRatio: round3(w0.length === 0 ? 1 : wN.length / w0.length),
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
