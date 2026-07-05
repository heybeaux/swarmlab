/**
 * Deterministic simulation of an agent's phenotype (DARWIN_MODE=sim or no claude
 * CLI). Seeded, so a config replays identically.
 *
 * HONESTY: the sim only stands in for the agent's *output production* — the
 * mapping from a system prompt to a word list. It NEVER computes or reports a
 * fitness; the harness grades the list (task.ts). The mapping is mechanical and
 * faithful to what a literal prompt-follower does:
 *
 *   - Each `theme`/`distract` directive `name:W` makes the agent emit word W
 *     (with a small seeded drop rate — an imperfect follower sometimes skips a
 *     hint). So a genome that carries on-theme directives really does recover
 *     more of the hidden set; a genome full of distractors really does spam.
 *   - `meta` directives change verbosity: `style:verbose` / `style:think-step`
 *     make the agent pad the list with extra off-theme filler (lowering
 *     precision); `style:concise` / `style:list-only` suppress a little filler.
 *
 * The result is that fitness is a genuine, non-gameable function of the genome's
 * gene content. Selection climbs only if it actually accumulates theme genes.
 */
import type { Executor } from './executor.js';
import type { Directive, Genome } from './genome.js';
import type { Task } from './task.js';
import { fingerprint } from './genome.js';
import { fnv1a, mulberry32 } from './rng.js';

const DROP_RATE = 0.1; // an imperfect follower skips ~10% of its own hints

export class SimExecutor implements Executor {
  readonly mode = 'sim' as const;
  readonly model = 'sim-mulberry32';
  readonly #seed: string;
  readonly #distractorPool: readonly string[];

  constructor(seed: string, task: Task) {
    this.#seed = seed;
    this.#distractorPool = task.distractors;
  }

  async run(genome: Genome): Promise<string[]> {
    // Per-genome deterministic RNG: same genome → same output, always.
    const rand = mulberry32(fnv1a(this.#seed + '::' + fingerprint(genome) + '::' + genome.id));
    const out: string[] = [];
    let verbosity = 0;
    for (const d of genome.directives) {
      applyMeta(d, () => (verbosity += 1), () => (verbosity -= 1));
    }
    for (const d of genome.directives) {
      if ((d.kind === 'theme' || d.kind === 'distract') && d.word) {
        if (rand() >= DROP_RATE) out.push(d.word); // faithfully emits the hinted word
      }
    }
    // Verbosity pads the output with off-theme filler — real precision cost.
    const filler = Math.max(0, verbosity);
    for (let i = 0; i < filler && this.#distractorPool.length > 0; i += 1) {
      const w = this.#distractorPool[Math.floor(rand() * this.#distractorPool.length)];
      if (w) out.push(w);
    }
    return out;
  }
}

function applyMeta(d: Directive, inc: () => void, dec: () => void): void {
  if (d.kind !== 'meta') return;
  if (d.token === 'style:verbose' || d.token === 'style:think-step') inc();
  if (d.token === 'style:concise' || d.token === 'style:list-only') dec();
}
