/**
 * The genome under evolution IS the system prompt. We model a prompt as an
 * ordered list of directive tokens drawn from a fixed vocabulary. This keeps
 * mutation/breeding deterministic and reproducible (spec requirement) while
 * still rendering to a real, human-legible system-prompt string that a live LLM
 * can be driven with (see gen.ts).
 *
 * A directive is one hint the agent's prompt carries. Some directives are
 * *on-theme* (they steer the agent toward the hidden target — high fitness),
 * some are *off-theme* (distractors — they waste output budget), and some are
 * *meta* (tone/verbosity knobs that don't change the answer set but do change
 * prompt length — the seam Goodhart deception exploits).
 *
 * Evolution never knows which directives are good. It only sees fitness. The
 * whole point is to watch which tokens survive selection.
 */

/** One heritable unit of a prompt. */
export interface Directive {
  readonly token: string;
  readonly kind: 'theme' | 'distract' | 'meta';
  /** For theme/distract directives: the word this directive nudges the agent to emit. */
  readonly word?: string;
}

/** A genome is an ordered, bounded list of directives. */
export interface Genome {
  readonly id: string;
  readonly directives: readonly Directive[];
}

/**
 * The gene pool the mutation operator draws from. `theme` genes name real target
 * words; `distract` genes name plausible off-theme words; `meta` genes are pure
 * verbosity. The population must *discover* theme genes by selection pressure —
 * they are seeded rarely so early generations are mostly noise.
 */
export interface GenePool {
  readonly theme: readonly Directive[];
  readonly distract: readonly Directive[];
  readonly meta: readonly Directive[];
}

export function buildGenePool(
  targetWords: readonly string[],
  distractorWords: readonly string[],
): GenePool {
  return {
    theme: targetWords.map((w) => ({ token: `name:${w}`, kind: 'theme', word: w })),
    distract: distractorWords.map((w) => ({ token: `name:${w}`, kind: 'distract', word: w })),
    meta: [
      { token: 'style:concise', kind: 'meta' },
      { token: 'style:verbose', kind: 'meta' },
      { token: 'style:formal', kind: 'meta' },
      { token: 'style:list-only', kind: 'meta' },
      { token: 'style:no-prose', kind: 'meta' },
      { token: 'style:think-step', kind: 'meta' },
    ],
  };
}

/** Render a genome to a real system-prompt string (used verbatim in llm mode). */
export function renderPrompt(genome: Genome): string {
  const hints = genome.directives.map((d) => d.token).join(', ');
  return (
    'You are a word-list generator. Output ONLY a comma-separated list of single ' +
    'words, no prose. Your directives (hints about what to name): ' +
    (hints || '(none)') +
    '. Emit the words your directives point to.'
  );
}

/** Count directives by kind — used for legibility / convergence metrics. */
export function composition(genome: Genome): { theme: number; distract: number; meta: number } {
  const c = { theme: 0, distract: 0, meta: 0 };
  for (const d of genome.directives) c[d.kind] += 1;
  return c;
}

/** Structural fingerprint of a genome: sorted token multiset, for diversity. */
export function fingerprint(genome: Genome): string {
  return [...genome.directives.map((d) => d.token)].sort().join('|');
}
