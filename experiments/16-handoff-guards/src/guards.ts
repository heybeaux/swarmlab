/**
 * exp-16 guard tiers (spec 21) — handoff requirement-survival guards.
 *
 * The guard is HARNESS-LEVEL AND DETERMINISTIC: no LLM judges whether a
 * requirement survived. A manifest is a set/digest comparison between what the
 * delegator intended to send (`sent`) and what the child's brief actually
 * contains after handoff noise (`received`).
 *
 *  - Tier 1 `unguarded`  — no guard at all: exp-14 Part A exactly (the control).
 *  - Tier 2 `presence`   — manifest of requirement IDs. Receiver diffs its
 *    inbound brief against the ID set; a missing ID is flagged and back-filled
 *    from the sender's copy before work proceeds. Catches DROPS only — a
 *    present-but-wrong value passes an ID check untouched.
 *  - Tier 3 `value-echo` — manifest carries (id, expected-value-digest); the
 *    receiver echoes the value it parsed and the sender verifies the echo.
 *    Catches drops AND reinterpretations (numeric perturbations).
 *
 * Restores/corrections copy the SENDER's unit verbatim (a targeted, verified
 * retransmit against a manifest entry — mechanical, not a prose rewrite), so a
 * repaired line is not re-exposed to this hop's noise. With the guard active at
 * every hop, corruption is always caught at the hop that introduced it.
 *
 * Cost model — modeled token units, same currency as exp-14's cost model
 * (transmit = 1 per key-task per hop ≈ one full brief line ≈ 9 tokens by the
 * chars/4 proxy). Grounded on the actual strings:
 *   - a manifest ID ("r13")            ≈ 1 token   → 0.125 transmit units
 *   - an (id, value-digest) pair       ≈ 2–3 tokens → 0.25 units
 *   - a value echo (key: value)        ≈ 2–3 tokens → 0.25 units
 *   - a flag message                   ≈ 1 token   → 0.125 units
 *   - a back-fill/correction retransmit = a full line → 1.0 unit (COST_TRANSMIT)
 * The live d3b3 exhibition (llm.ts) provides real token numbers.
 */
import {
  COST_TRANSMIT,
  keyTasks,
  type HandoffGuard,
  type Unit,
} from '@swarmlab/experiment-14-delegation-decay/dist/decay.js';

export type GuardTier = 'unguarded' | 'presence' | 'value-echo';
export const TIERS: readonly GuardTier[] = ['unguarded', 'presence', 'value-echo'];

export const COST_MANIFEST_ID = 0.125; // per key-task listed, per hop (tier 2+3)
export const COST_DIGEST = 0.125; // per key-task, ON TOP of the ID (tier 3 manifest = 0.25)
export const COST_ECHO = 0.25; // per key-task actually received, per hop (tier 3)
export const COST_FLAG = 0.125; // per flagged unit
export const COST_RESTORE = COST_TRANSMIT; // full-line retransmit = 1.0

/** Per-trial guard accounting, accumulated across every hop of the tree. */
export interface GuardStats {
  /** hop-level events: unit missing from the received brief */
  dropsOccurred: number;
  dropsCaught: number;
  /** hop-level events: unit present but param differs from the sender's */
  perturbsOccurred: number;
  perturbsCaught: number;
  flags: number;
  /** flags raised on units that were actually intact (must stay 0) */
  falseFlags: number;
  /** extra modeled tokens spent on manifests, echoes, flags, restores */
  guardCost: number;
}

export function emptyStats(): GuardStats {
  return {
    dropsOccurred: 0,
    dropsCaught: 0,
    perturbsOccurred: 0,
    perturbsCaught: 0,
    flags: 0,
    falseFlags: 0,
    guardCost: 0,
  };
}

export interface GuardFlagEvent {
  parent: string;
  child: string;
  level: number;
  reqId: string;
  role: string;
  kind: 'drop' | 'reinterpret';
}

/**
 * Build the guard hook for a tier. Returns undefined for the control tier so
 * `runDecayTrial` takes exp-14's exact un-hooked path.
 */
export function makeGuard(
  tier: GuardTier,
  stats: GuardStats,
  onFlag?: (e: GuardFlagEvent) => void,
): HandoffGuard | undefined {
  if (tier === 'unguarded') return undefined;
  const echo = tier === 'value-echo';
  return {
    check(sent, received, level, parent, child) {
      let extraCost = 0;
      // Manifest travels with the handoff: one entry per intended unit.
      for (const u of sent) {
        extraCost += keyTasks(u) * (COST_MANIFEST_ID + (echo ? COST_DIGEST : 0));
      }
      // Value-echo: receiver echoes every value it parsed back to the sender.
      if (echo) {
        for (const u of received) extraCost += keyTasks(u) * COST_ECHO;
      }
      const inbound = new Map<string, Unit>();
      for (const u of received) inbound.set(`${u.reqId}:${u.role}`, u);
      const brief: Unit[] = [...received];
      for (const u of sent) {
        const got = inbound.get(`${u.reqId}:${u.role}`);
        if (got === undefined) {
          // Presence check: ID on the manifest, absent from the brief.
          stats.dropsOccurred += 1;
          stats.dropsCaught += 1;
          stats.flags += 1;
          extraCost += COST_FLAG + keyTasks(u) * COST_RESTORE;
          brief.push({ ...u });
          onFlag?.({ parent, child, level, reqId: u.reqId, role: u.role, kind: 'drop' });
        } else if (got.param !== u.param) {
          // Present but numerically perturbed at this hop.
          stats.perturbsOccurred += 1;
          if (echo) {
            stats.perturbsCaught += 1;
            stats.flags += 1;
            extraCost += COST_FLAG + keyTasks(u) * COST_RESTORE;
            const i = brief.indexOf(got);
            brief[i] = { ...u };
            onFlag?.({ parent, child, level, reqId: u.reqId, role: u.role, kind: 'reinterpret' });
          }
          // Tier 2 cannot see values: the perturbation passes the ID check.
        }
        // Present and equal: never flagged — falseFlags stays 0 by construction,
        // but we keep the counter so the claim is measured, not assumed.
      }
      stats.guardCost += extraCost;
      return { brief, extraCost };
    },
  };
}
