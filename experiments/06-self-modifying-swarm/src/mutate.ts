/**
 * The self-modification engine: agents rewriting each other's prompts.
 *
 * Editing policy (no human in the loop): each round, with probability pEdit, an
 * agent becomes an EDITOR and rewrites one peer's prompt. Its move is driven by
 * the fitness signal:
 *   - If the editor is fitter than its target, it IMPOSES its own genome
 *     (clone/overwrite) — "do what I do." This is the homogenizing pressure.
 *   - If the target is fitter, the editor APPENDS a directive it believes helped
 *     (append) — "you're winning, do more." This is the bloating pressure.
 *   - With low aggression it makes a small random tweak (append/delete).
 * FLATTER edits add a no-op LOUD token: social noise that only burns budget.
 *
 * Every rewrite is clamped to the prompt-size rail. No edit ever touches state
 * outside the passed-in agent array — the sandbox boundary is structural.
 */
import type { Agent, Directive, Mutation, RailConfig, SwarmConfig } from './types.js';
import { ALL_DIRECTIVES } from './types.js';
import { pick, type Rand } from './rng.js';

/** Enforce the prompt-size rail. Returns a clamped copy; never mutates input. */
export function clampPrompt(prompt: readonly Directive[], rails: RailConfig): Directive[] {
  const out = prompt.slice(0, rails.maxPromptLen);
  // A prompt must never be empty (degenerate); the kill-switch handles the
  // population-level case, but an individual empty prompt would divide-by-zero
  // the diversity metric, so we floor it at one HOLD.
  return out.length === 0 ? ['HOLD'] : out;
}

/** Choose the target of an edit: a random peer that is not the editor. */
function chooseTarget(editor: Agent, agents: readonly Agent[], rand: Rand): Agent | undefined {
  const peers = agents.filter((a) => a.id !== editor.id);
  if (peers.length === 0) return undefined;
  return pick(rand, peers);
}

/**
 * Produce (but do not yet apply) an editor's rewrite of a target's prompt.
 * Pure w.r.t. the agents array so it can be traced before application.
 */
export function proposeEdit(
  editor: Agent,
  target: Agent,
  cfg: SwarmConfig,
  round: number,
  rand: Rand,
): Mutation {
  const before = target.prompt.slice();
  const editorWins = editor.fitness >= target.fitness;
  const aggressive = rand() < cfg.editAggression;

  let kind: Mutation['kind'];
  let after: Directive[];

  if (editorWins && aggressive) {
    // Impose my genome. Occasionally flatter it with a LOUD filler token.
    const flatter = rand() < 0.25;
    after = editor.prompt.slice();
    if (flatter) after.push('LOUD');
    kind = flatter ? 'clone' : 'overwrite';
  } else if (!editorWins && aggressive) {
    // Target is winning: tell it to "do more" by appending a directive.
    after = before.concat(pick(rand, ALL_DIRECTIVES));
    kind = 'append';
  } else {
    // Low-confidence tweak: 50/50 append a random directive or delete one.
    if (rand() < 0.5 || before.length <= 1) {
      after = before.concat(pick(rand, ALL_DIRECTIVES));
      kind = 'append';
    } else {
      const drop = Math.floor(rand() * before.length);
      after = before.filter((_, i) => i !== drop);
      kind = 'delete';
    }
  }

  after = clampPrompt(after, cfg.rails);
  return { round, editor: editor.id, target: target.id, kind, before, after };
}

/**
 * Run the editing phase for one round. Returns the mutations that were applied,
 * in order. Applies them immediately (edits can cascade within a round: an
 * agent edited early can itself be an editor later — this is intentional and is
 * a source of the runaway dynamics).
 */
export function editingPhase(
  agents: Agent[],
  cfg: SwarmConfig,
  round: number,
  rand: Rand,
): Mutation[] {
  const applied: Mutation[] = [];
  const byId = new Map(agents.map((a) => [a.id, a]));
  for (const editor of agents) {
    if (rand() >= cfg.pEdit) continue;
    const target = chooseTarget(editor, agents, rand);
    if (!target) continue;
    const m = proposeEdit(editor, target, cfg, round, rand);
    const live = byId.get(m.target);
    if (live) live.prompt = m.after.slice();
    applied.push(m);
  }
  return applied;
}
