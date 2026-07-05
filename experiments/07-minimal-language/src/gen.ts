/**
 * Real LLM calls via the local `claude` CLI (one-shot `claude -p`), following the
 * isolation pattern established in exp-01 (see experiments/01-telephone-compiler/src/gen.ts
 * and its README "the hijack"): `--tools ""` so the agentic layer can't try to write
 * files or emit permission chatter as the answer, and an empty temp dir as cwd so no
 * workspace CLAUDE.md / auto-memory bleeds into the prompt. The system prompt is
 * prepended to the user prompt so we don't depend on CLI flag availability.
 */
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TextGen {
  readonly mode: 'llm';
  readonly model: string;
  gen(systemPrompt: string, user: string): Promise<string>;
}

export class ClaudeCliGen implements TextGen {
  readonly mode = 'llm' as const;
  readonly model: string;
  readonly #cwd: string;

  constructor(model = 'claude-haiku-4-5-20251001') {
    this.model = model;
    this.#cwd = mkdtempSync(join(tmpdir(), 'minlang-llm-'));
  }

  gen(systemPrompt: string, user: string): Promise<string> {
    const prompt = `${systemPrompt}\n\n---\n\n${user}`;
    return new Promise((resolve, reject) => {
      execFile(
        'claude',
        ['-p', prompt, '--model', this.model, '--tools', ''],
        { timeout: 120_000, maxBuffer: 4 * 1024 * 1024, cwd: this.#cwd },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`claude CLI failed: ${err.message}\n${stderr.slice(0, 500)}`));
            return;
          }
          resolve(stdout.trim());
        },
      );
    });
  }
}

/** Models sometimes wrap output in ``` fences despite instructions. */
export function stripFences(text: string): string {
  const m = text.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  return m?.[1] ?? text;
}

export function claudeCliAvailable(): boolean {
  try {
    execFileSync('claude', ['--version'], { timeout: 15_000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
