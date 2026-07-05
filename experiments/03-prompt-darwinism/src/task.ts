/**
 * The task the population is evolving to solve, and the HARNESS-COMPUTED fitness
 * function that grades an output. No agent (LLM or sim) ever reports its own
 * fitness — it emits a raw artifact (a word list) and the harness scores it here.
 *
 * The task: "name the members of a hidden category." There is a hidden target
 * vocabulary (a themed set of words). An agent's output is a list of words. The
 * harness measures how well that list recovers the hidden set — a set-overlap
 * F1, with a penalty for spam (padding the list with off-theme filler to game
 * recall). The agents never see the target set; only its *fitness feedback* (a
 * scalar) flows back, exactly like a real ACR fitness signal tuning a prompt.
 *
 * Because the score is a pure function of (output, hiddenTarget), it is
 * deterministic, cheap, and identical in llm and sim mode. That is the honesty
 * seam: fitness is arithmetic over the artifact, never a claim.
 */

/** The hidden category the population is (blindly) evolving to recover. */
export interface Task {
  readonly id: string;
  /** Human-legible description (NOT shown to agents in llm mode). */
  readonly theme: string;
  /** The hidden target vocabulary — the ground truth the harness scores against. */
  readonly target: ReadonlySet<string>;
  /** A large pool of plausible-but-off-theme words used to model spam/filler. */
  readonly distractors: readonly string[];
}

/** Canonicalize a word for set membership: lowercased, trimmed, alnum only. */
export function canon(word: string): string {
  return word.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function set(words: readonly string[]): ReadonlySet<string> {
  return new Set(words.map(canon).filter((w) => w.length > 0));
}

/**
 * The default task: recover the set of "primary + secondary colors" from a sea
 * of near-miss color-ish and object words. A small, sharp target (good signal),
 * a big distractor pool (spam is possible and must be punished).
 */
export const DEFAULT_TASK: Task = {
  id: 'colors',
  theme: 'primary and secondary colors of the RYB color wheel',
  target: set(['red', 'yellow', 'blue', 'orange', 'green', 'purple']),
  distractors: [
    'crimson', 'scarlet', 'maroon', 'teal', 'cyan', 'magenta', 'violet',
    'indigo', 'turquoise', 'amber', 'gold', 'silver', 'bronze', 'beige',
    'brown', 'black', 'white', 'gray', 'pink', 'lime', 'olive', 'navy',
    'coral', 'salmon', 'lavender', 'plum', 'rust', 'ochre', 'sand', 'ivory',
    'apple', 'banana', 'grape', 'sky', 'grass', 'fire', 'ocean', 'sun',
    'leaf', 'blood', 'rose', 'lemon', 'berry', 'coal', 'chalk', 'ash',
  ],
};

/** Grade breakdown for one output. All fields are harness-computed. */
export interface Grade {
  /** Number of distinct target words the output correctly named. */
  hits: number;
  /** Number of distinct off-target words the output emitted (spam / wrong). */
  misses: number;
  /** Distinct words in the output total. */
  size: number;
  precision: number;
  recall: number;
  /** F1 of precision & recall — the *primary* honest fitness. */
  f1: number;
}

/** Grade a raw list of words against the task's hidden target. Pure & honest. */
export function grade(output: readonly string[], task: Task): Grade {
  const seen = new Set<string>();
  let hits = 0;
  let misses = 0;
  for (const raw of output) {
    const w = canon(raw);
    if (w.length === 0 || seen.has(w)) continue; // dedupe: no free recall from repeats
    seen.add(w);
    if (task.target.has(w)) hits += 1;
    else misses += 1;
  }
  const size = seen.size;
  const precision = size === 0 ? 0 : hits / size;
  const recall = task.target.size === 0 ? 0 : hits / task.target.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { hits, misses, size, precision, recall, f1 };
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
