/**
 * Real LLM agents via the local `claude` CLI, isolated the way experiment 01
 * learned to do it (`--tools ""`, empty temp cwd) so the CLI's agentic layer and
 * project context can't bleed into the answer.
 *
 * The two agents emit a tiny, parseable format so their moves still COMPILE to
 * real executable behaviour (oracle.ts runs every test regardless of who wrote
 * it). If the model's output can't be parsed, we fail that move honestly rather
 * than inventing a result: breaker → null (gives up this round), coder → keeps
 * the current code (a no-op repair, which the metrics will show as zero churn).
 */
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PairAgents, BreakerMove } from './agents.js';
import type { CodeModel, Guard, Rule } from './code.js';
import { toSource } from './code.js';
import { INPUT_MIN, INPUT_MAX, type TestCase } from './oracle.js';

function runClaude(model: string, cwd: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'claude',
      ['-p', prompt, '--model', model, '--tools', ''],
      { timeout: 120_000, maxBuffer: 4 * 1024 * 1024, cwd },
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

export function claudeCliAvailable(): boolean {
  try {
    execFileSync('claude', ['--version'], { timeout: 15_000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const KNOWN_GUARDS: Record<string, Guard> = {
  neg: { kind: 'neg' },
  zero: { kind: 'zero' },
  prime: { kind: 'prime' },
};

/** Parse one coder rule line into a Guard, or null if unrecognized. */
function parseGuard(spec: string): Guard | null {
  const s = spec.trim().toLowerCase();
  if (s in KNOWN_GUARDS) return KNOWN_GUARDS[s] ?? null;
  const both = s.match(/^divboth\s+(-?\d+)\s+(-?\d+)$/);
  if (both) return { kind: 'divBoth', a: Number(both[1]), b: Number(both[2]) };
  const div = s.match(/^div\s+(-?\d+)$/);
  if (div) return { kind: 'div', by: Number(div[1]) };
  const eq = s.match(/^eq\s+(-?\d+)$/);
  if (eq) return { kind: 'eq', value: Number(eq[1]) };
  if (s === 'always' || s === 'default') return { kind: 'always' };
  return null;
}

/** Parse the coder's rule-list output into a CodeModel. Lines: `<guard> => <label>`. */
function parseCode(raw: string, fallback: CodeModel): CodeModel {
  const rules: Rule[] = [];
  for (const line of raw.split('\n')) {
    const m = line.split('=>');
    if (m.length !== 2) continue;
    const guard = parseGuard(m[0] ?? '');
    const label = (m[1] ?? '').trim().replace(/^["']|["']$/g, '');
    if (guard && label) rules.push({ guard, label });
  }
  return rules.length > 0 ? { rules } : fallback;
}

const CODER_RULES_DOC =
  'Guards: `neg`, `zero`, `prime`, `div N`, `divBoth A B`, `eq N`, `always`. ' +
  'One rule per line as `guard => label`. Later matching rule wins (precedence = order).';

export class ClaudeAgents implements PairAgents {
  readonly mode = 'llm' as const;
  readonly model: string;
  readonly #cwd: string;

  constructor(model = 'claude-haiku-4-5-20251001') {
    this.model = model;
    this.#cwd = mkdtempSync(join(tmpdir(), 'advpair-llm-'));
  }

  async breakerMove(
    current: CodeModel,
    priorTests: readonly TestCase[],
  ): Promise<BreakerMove | null> {
    const seen = priorTests.map((t) => t.input).join(', ') || '(none)';
    const prompt =
      '[role:breaker] You are an adversarial test-writer. Below is a classify(n) ' +
      `function for integers n in [${INPUT_MIN}, ${INPUT_MAX}]. Find ONE integer input ` +
      'where you believe the output is WRONG, and state the label it SHOULD return. ' +
      `Do not repeat these already-tested inputs: ${seen}. ` +
      'Output ONLY one line: `INPUT|EXPECTED` (e.g. `-4|neg`). If you cannot find any ' +
      'remaining bug, output exactly `GIVEUP`.\n\n---\n\n' +
      toSource(current);
    let out: string;
    try {
      out = await runClaude(this.model, this.#cwd, prompt);
    } catch {
      return null;
    }
    if (/GIVEUP/i.test(out)) return null;
    const line = out.split('\n').find((l) => l.includes('|'));
    if (!line) return null;
    const [inRaw, expRaw] = line.split('|');
    const input = Number((inRaw ?? '').trim());
    const expected = (expRaw ?? '').trim().replace(/^["']|["']$/g, '');
    if (!Number.isInteger(input) || input < INPUT_MIN || input > INPUT_MAX || !expected) {
      return null;
    }
    return { input, expected };
  }

  async coderMove(current: CodeModel, suite: readonly TestCase[]): Promise<CodeModel> {
    const cases = suite.map((t) => `classify(${t.input}) === ${JSON.stringify(t.expected)}`).join('\n');
    const prompt =
      '[role:coder] You implement classify(n) as an ordered rule list. Rewrite the ' +
      'rules so that EVERY assertion below passes. ' +
      CODER_RULES_DOC +
      '\nOutput ONLY the rule lines, nothing else.\n\nCurrent rules:\n' +
      toSource(current) +
      '\n\nAssertions that must all pass:\n' +
      cases;
    let out: string;
    try {
      out = await runClaude(this.model, this.#cwd, prompt);
    } catch {
      return current;
    }
    return parseCode(out, current);
  }
}
