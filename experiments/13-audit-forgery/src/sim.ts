/**
 * One audit-forgery trial: build an honest signed trail, let the adversary apply one attack,
 * then run every verifier against the forged trail and record whether each caught it. Ground
 * truth is known (the trail IS forged), so a `clean` verdict is a false-clean — a silent
 * forgery. The exhibition trial emits appends, the attack, and every verdict onto the bus.
 */
import type { Rand } from './rng.js';
import { applyAttack, buildHonestTrail, verify } from './trail.js';
import type {
  EmitAppend,
  EmitAttack,
  EmitVerdict,
  TrialConfig,
  Verdict,
  Verifier,
} from './types.js';

/** The four canonical verifiers, from weakest (sig-only) to strongest (full). */
export const VERIFIERS: readonly Verifier[] = [
  { name: 'sig-only', checks: new Set(['SIG']) },
  { name: 'hash+sig', checks: new Set(['SIG', 'HASH']) },
  { name: 'chain+sig', checks: new Set(['SIG', 'CHAIN']) },
  { name: 'full', checks: new Set(['SIG', 'HASH', 'CHAIN', 'SEQ']) },
];

export interface TrialResult {
  /** verdicts[i] is the ruling of VERIFIERS[i] on the forged trail. */
  verdicts: Verdict[];
  /** The seq the attack targeted (for the trace). */
  targetSeq: number;
}

export function runTrial(
  cfg: TrialConfig,
  rand: Rand,
  emitAppend?: EmitAppend,
  emitAttack?: EmitAttack,
  emitVerdict?: EmitVerdict,
): TrialResult {
  const honest = buildHonestTrail(cfg, rand);

  if (emitAppend) {
    for (const ev of honest) {
      emitAppend({ seq: ev.seq, author: ev.author, h: ev.h, prev: ev.prev, ts: ev.ts });
    }
  }

  const { forged, targetSeq } = applyAttack(honest, cfg, rand);

  emitAttack?.({
    attack: cfg.attack,
    stitch: cfg.stitch,
    keyCompromised: cfg.keyCompromised,
    targetSeq,
  });

  const verdicts: Verdict[] = [];
  for (const v of VERIFIERS) {
    const verdict = verify(forged, v);
    verdicts.push(verdict);
    emitVerdict?.({
      verifier: v.name,
      attack: cfg.attack,
      clean: verdict.clean,
      reason: verdict.reason,
    });
  }

  return { verdicts, targetSeq };
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
