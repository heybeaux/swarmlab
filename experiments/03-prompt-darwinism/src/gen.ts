/**
 * Real-LLM phenotype via the local `claude` CLI, isolated the way exp 01/02
 * learned to (`--tools ""`, empty temp cwd) so the CLI's agentic layer and
 * project context can't bleed into the answer.
 *
 * The genome's rendered system prompt (genome.ts::renderPrompt) is fed as the
 * driving instruction. The model returns a comma-separated word list, which we
 * parse into a raw string[]. The harness grades that list — the model NEVER sees
 * the hidden target and NEVER reports a fitness. If the CLI errors or returns
 * garbage, we return whatever parsed (possibly empty) rather than inventing a
 * result: a low-fitness genome is an honest outcome, not a failure to hide.
 */
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Executor } from './executor.js';
import type { Genome } from './genome.js';
import { renderPrompt } from './genome.js';

function runClaude(model: string, cwd: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'claude',
      ['-p', prompt, '--model', model, '--tools', ''],
      { timeout: 120_000, maxBuffer: 4 * 1024 * 1024, cwd },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`claude CLI failed: ${err.message}\n${stderr.slice(0, 400)}`));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

export function claudeCliAvailable(): boolean {
  try {
    execFileSync('claude', ['--version'], { timeout: 15_000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Parse a model reply into a word list: split on commas/newlines, take words. */
function parseWords(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 30 && !s.includes(' '));
}

export class ClaudeExecutor implements Executor {
  readonly mode = 'llm' as const;
  readonly model: string;
  readonly #cwd: string;

  constructor(model = 'claude-haiku-4-5-20251001') {
    this.model = model;
    this.#cwd = mkdtempSync(join(tmpdir(), 'darwin-llm-'));
  }

  async run(genome: Genome): Promise<string[]> {
    const prompt = renderPrompt(genome);
    let out: string;
    try {
      out = await runClaude(this.model, this.#cwd, prompt);
    } catch {
      return [];
    }
    return parseWords(out);
  }
}
