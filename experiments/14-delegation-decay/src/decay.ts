/**
 * Part A engine — deterministic delegation-decay simulation.
 *
 * A root agent holds the 20-requirement task and delegates down a tree of
 * depth `d` and branching `b` (d=0: the root does everything alone). Noise
 * lives in the HANDOFFS, exp-01 style: every time a delegator writes a child's
 * brief, each brief item is independently
 *   - dropped   w.p. 0.08  (exp-01 sim: whole rule silently dropped, 0.08/hop)
 *   - drifted   w.p. 0.15  (exp-01 sim: numeric perturbation, 0.15/hop)
 * Leaf workers execute their (possibly corrupted) brief faithfully; reassembly
 * is mechanical. Relational requirements travel as ONE brief line while their
 * two keys are co-located and FORK into two independent parameter copies the
 * moment a partition splits the keys across siblings — the integration seam.
 *
 * Determinism: every random draw comes from a stream keyed by
 * (seed, trial, purpose, requirement, role, level) — so the same trial seed
 * produces the same per-requirement fates in EVERY cell that reaches the same
 * hop, giving the sweep literal same-seeds comparability across cells.
 */
import { seeded, type Rand } from './rng.js';
import { assess, N_KEY_TASKS, REQUIREMENTS } from './task.js';
import type { DecayTrialResult } from './types.js';

export const P_DROP = 0.08;
export const P_REINTERPRET = 0.15;

/** Modeled token costs (units): transmit/key-task/hop, work/key-task, merge/child. */
export const COST_TRANSMIT = 1;
export const COST_WORK = 3;
export const COST_MERGE = 1;
export const BASELINE_COST = N_KEY_TASKS * COST_WORK; // d=0: 84

export type Role = 'U' | 'P' | 'A' | 'B';

export interface Unit {
  reqId: string;
  role: Role;
  param: number;
  offset: number;
  keyU?: string;
  keyA?: string;
  keyB?: string;
}

export function keyTasks(u: Unit): number {
  return u.role === 'P' ? 2 : 1;
}

function initialUnits(): Unit[] {
  return REQUIREMENTS.map((r) =>
    r.kind === 'unary'
      ? { reqId: r.id, role: 'U' as const, param: r.value, offset: 0, keyU: r.key }
      : { reqId: r.id, role: 'P' as const, param: r.param, offset: r.offset, keyA: r.keyA, keyB: r.keyB },
  );
}

function perturb(value: number, stream: Rand): number {
  const sign = stream() < 0.5 ? -1 : 1;
  return value + sign * (1 + Math.floor(stream() * 3));
}

export interface DecayEmit {
  brief(parent: string, child: string, level: number, items: number, keyTaskCount: number): void;
  leaf(agent: string, keys: readonly string[]): void;
}

/**
 * Manifest hook (exp-16, spec 21): a handoff guard sees what the delegator
 * intended to send (`sent`, pre-noise) and what actually arrived (`received`,
 * post-noise) and may return a corrected brief plus the extra token cost the
 * check/repair spent. Purely additive — when `guard` is undefined the trial is
 * byte-identical to the un-hooked engine (all RNG draws are key-addressed, so
 * no draw-order sensitivity exists).
 */
export interface HandoffGuard {
  check(
    sent: readonly Unit[],
    received: readonly Unit[],
    level: number,
    parent: string,
    child: string,
  ): { brief: Unit[]; extraCost: number };
}

export function runDecayTrial(
  depth: number,
  branching: number,
  seedBase: string,
  emit?: DecayEmit,
  guard?: HandoffGuard,
): DecayTrialResult {
  const config = new Map<string, number>();
  const forked = new Set<string>();
  let cost = 0;

  const execute = (agent: string, units: readonly Unit[]): void => {
    const keys: string[] = [];
    for (const u of units) {
      if (u.role === 'U' && u.keyU) {
        config.set(u.keyU, u.param);
        keys.push(u.keyU);
      } else if (u.role === 'P' && u.keyA && u.keyB) {
        config.set(u.keyA, u.param + u.offset);
        config.set(u.keyB, u.param);
        keys.push(u.keyA, u.keyB);
      } else if (u.role === 'A' && u.keyA) {
        config.set(u.keyA, u.param + u.offset);
        keys.push(u.keyA);
      } else if (u.role === 'B' && u.keyB) {
        config.set(u.keyB, u.param);
        keys.push(u.keyB);
      }
      cost += keyTasks(u) * COST_WORK;
    }
    emit?.leaf(agent, keys);
  };

  const assignDraw = (reqId: string, role: 'U' | 'A' | 'B', level: number): number =>
    Math.floor(seeded(`${seedBase}:assign:${reqId}:${role}:L${level}`)() * branching);

  const delegate = (agent: string, units: readonly Unit[], level: number, remaining: number): void => {
    if (remaining === 0) {
      execute(agent, units);
      return;
    }
    const slices: Unit[][] = Array.from({ length: branching }, () => []);
    for (const u of units) {
      if (u.role === 'P') {
        const cA = assignDraw(u.reqId, 'A', level);
        const cB = assignDraw(u.reqId, 'B', level);
        if (cA === cB) {
          slices[cA]?.push(u);
        } else {
          // The partition split the pair: the shared parameter forks into two
          // independent copies, one per sibling brief. Divergence starts here.
          forked.add(u.reqId);
          slices[cA]?.push({ reqId: u.reqId, role: 'A', param: u.param, offset: u.offset, ...(u.keyA !== undefined ? { keyA: u.keyA } : {}) });
          slices[cB]?.push({ reqId: u.reqId, role: 'B', param: u.param, offset: u.offset, ...(u.keyB !== undefined ? { keyB: u.keyB } : {}) });
        }
      } else {
        const c = assignDraw(u.reqId, u.role === 'U' ? 'U' : u.role, level);
        slices[c]?.push(u);
      }
    }
    for (let c = 0; c < branching; c += 1) {
      const slice = slices[c];
      if (!slice) continue;
      const child = `${agent}.${c}`;
      let brief: Unit[] = [];
      let transmitted = 0;
      for (const u of slice) {
        const stream = seeded(`${seedBase}:noise:${u.reqId}:${u.role}:h${level}`);
        if (stream() < P_DROP) continue; // brief line silently omitted
        const drifted = stream() < P_REINTERPRET ? { ...u, param: perturb(u.param, stream) } : u;
        brief.push(drifted);
        transmitted += keyTasks(u);
        cost += keyTasks(u) * COST_TRANSMIT;
      }
      emit?.brief(agent, child, level, brief.length, transmitted);
      if (guard) {
        const g = guard.check(slice, brief, level, agent, child);
        brief = g.brief;
        cost += g.extraCost;
      }
      if (brief.length > 0 || remaining - 1 === 0) {
        delegate(child, brief, level + 1, remaining - 1);
      }
      cost += COST_MERGE;
    }
  };

  const root = 'a0';
  if (depth === 0) {
    execute(root, initialUnits());
  } else {
    delegate(root, initialUnits(), 1, depth);
  }

  const outcomes = assess(config, forked);
  let satisfied = 0;
  let reinterpreted = 0;
  let dropped = 0;
  let integration = 0;
  for (const o of outcomes.values()) {
    if (o === 'satisfied') satisfied += 1;
    else if (o === 'reinterpreted') reinterpreted += 1;
    else if (o === 'dropped') dropped += 1;
    else integration += 1;
  }
  return {
    survival: satisfied / REQUIREMENTS.length,
    reinterpreted,
    dropped,
    integration,
    cost,
    costAmplification: cost / BASELINE_COST,
  };
}
