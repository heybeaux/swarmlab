import { execFile, execFileSync } from 'node:child_process';
import type { AgentRuntime, AgentSpec, RuntimeAgent } from '@swarmlab/core';

/** One text completion. The seam between the experiment and any model. */
export interface TextGen {
  readonly mode: 'llm' | 'sim';
  readonly model: string;
  gen(systemPrompt: string, user: string): Promise<string>;
}

/**
 * Real LLM calls via the local `claude` CLI (one-shot `claude -p`).
 * The system prompt is prepended to the user prompt so we don't depend on
 * CLI flag availability across versions.
 */
export class ClaudeCliGen implements TextGen {
  readonly mode = 'llm' as const;
  readonly model: string;

  constructor(model = 'claude-haiku-4-5-20251001') {
    this.model = model;
  }

  gen(systemPrompt: string, user: string): Promise<string> {
    const prompt = `${systemPrompt}\n\n---\n\n${user}`;
    return new Promise((resolve, reject) => {
      execFile(
        'claude',
        ['-p', prompt, '--model', this.model],
        { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`claude CLI failed: ${err.message}\n${stderr.slice(0, 500)}`));
            return;
          }
          resolve(stripFences(stdout.trim()));
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

/**
 * Binds a TextGen to core's AgentRuntime seam: every `send(text)` to an agent
 * becomes one completion under that agent's system prompt, delivered back
 * through the normal handle listeners.
 */
export class GenRuntime implements AgentRuntime {
  #gen: TextGen;

  constructor(gen: TextGen) {
    this.#gen = gen;
  }

  async spawn(spec: AgentSpec, deliver: (msg: unknown) => void): Promise<RuntimeAgent> {
    const gen = this.#gen;
    let alive = true;
    return {
      async send(msg: unknown): Promise<void> {
        if (!alive) throw new Error(`agent ${spec.id} is dead`);
        const text = await gen.gen(spec.systemPrompt, String(msg));
        if (alive) deliver(text);
      },
      async kill(): Promise<void> {
        alive = false;
      },
    };
  }
}
