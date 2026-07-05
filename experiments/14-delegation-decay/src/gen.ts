/**
 * Real LLM calls via the local `claude` CLI, isolated per exp-01's "hijack"
 * lesson: `--tools ""` + empty temp cwd so the agentic layer and workspace
 * context can't bleed into the agents' reasoning.
 */
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class ClaudeCliGen {
  readonly model: string;
  readonly #cwd: string;
  charCount = 0; // prompt + response chars, for the tokens≈chars/4 proxy

  constructor(model = 'claude-haiku-4-5-20251001') {
    this.model = model;
    this.#cwd = mkdtempSync(join(tmpdir(), 'dd-llm-'));
  }

  gen(systemPrompt: string, user: string): Promise<string> {
    const prompt = `${systemPrompt}\n\n---\n\n${user}`;
    return new Promise((resolve, reject) => {
      execFile(
        'claude',
        ['-p', prompt, '--model', this.model, '--tools', ''],
        { timeout: 180_000, maxBuffer: 4 * 1024 * 1024, cwd: this.#cwd },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`claude CLI failed: ${err.message}\n${stderr.slice(0, 500)}`));
            return;
          }
          const out = stdout.trim();
          this.charCount += prompt.length + out.length;
          resolve(out);
        },
      );
    });
  }
}

export function claudeCliAvailable(): boolean {
  try {
    execFileSync('claude', ['--version'], { timeout: 15_000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Pull the first JSON array/object out of an LLM reply (fences, prose, etc.). */
export function extractJson(text: string): unknown {
  const stripped = text.replace(/^```[a-z]*\n?|\n?```$/gim, '');
  const start = stripped.search(/[[{]/);
  if (start === -1) throw new Error(`no JSON in reply: ${text.slice(0, 200)}`);
  const open = stripped[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  for (let i = start; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return JSON.parse(stripped.slice(start, i + 1));
    }
  }
  throw new Error(`unterminated JSON in reply: ${text.slice(0, 200)}`);
}

/** Run async jobs with a small concurrency cap (sibling agents in parallel). */
export async function pool<T>(jobs: readonly (() => Promise<T>)[], limit = 6): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const i = next;
      next += 1;
      const job = jobs[i];
      if (!job) continue;
      results[i] = await job();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}
