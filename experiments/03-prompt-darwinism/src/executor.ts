/**
 * The seam between a genome (system prompt) and its PHENOTYPE (the word list the
 * agent produces). An Executor turns a rendered prompt into a raw output list.
 * The harness then grades that list (task.ts). Crucially the executor NEVER
 * scores — it only produces the artifact. LLM and sim executors are
 * interchangeable behind this contract, exactly like exp-02's PairAgents seam.
 */
import type { Genome } from './genome.js';

export interface Executor {
  readonly mode: 'llm' | 'sim';
  readonly model: string;
  /** Produce the raw output word list for a genome's rendered prompt. */
  run(genome: Genome): Promise<string[]>;
}
