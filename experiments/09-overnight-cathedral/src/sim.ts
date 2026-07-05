/**
 * Deterministic long-horizon build engine. A fixed spec is a bit vector of `specSize`
 * requirements, all required (target = all ones). The artifact starts all-zeros. A ring of
 * `builders` agents takes turns committing one unit of work per step; the NEXT agent reviews
 * that unit before the chain moves on.
 *
 * Each build step does three independent things:
 *   1. BUILD  — with p `pProgress`, flip an unmet requirement to met (quality up).
 *   2. REGRESS— with p `pRegress·fatigueMul`, flip an already-met requirement back to unmet
 *               (a silent regression — the load-bearing stone knocked loose).
 *   3. DRIFT  — with p `pDrift·fatigueMul`, set an out-of-spec bit (a feature nobody asked for).
 *
 * `fatigueMul = 1 + fatigue·(step/iterations)` compounds the hazards with horizon depth: late
 * in a long unsupervised chain, context is thinner and inherited assumptions are shakier.
 *
 * Then the NEXT agent REVIEWS: it reverts a regression w.p. `reviewSkill`, and reverts a drift
 * bit w.p. `reviewSkill·driftVisibility` (drift is stealthier — the artifact still "works").
 * Under the no-review baseline `reviewSkill = 0` and nothing is caught. This is the whole
 * governance seam: the review link is the only thing between accumulating drift and the artifact.
 */
import type { Rand } from './rng.js';
import type {
  CommitStep,
  EmitCommit,
  EmitReview,
  EmitSnapshot,
  ReviewStep,
  Snapshot,
  TrialConfig,
  TrialResult,
} from './types.js';

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Pick a random index where `bits[i] === want`, or -1 if none. */
function pickBit(bits: readonly boolean[], want: boolean, rand: Rand): number {
  const candidates: number[] = [];
  for (let i = 0; i < bits.length; i += 1) if (bits[i] === want) candidates.push(i);
  if (candidates.length === 0) return -1;
  const idx = Math.floor(rand() * candidates.length);
  return candidates[idx] ?? -1;
}

export function runTrial(
  cfg: TrialConfig,
  rand: Rand,
  emitCommit?: EmitCommit,
  emitReview?: EmitReview,
  emitSnap?: EmitSnapshot,
): TrialResult {
  // The spec: `specSize` requirements. met[i] = true once requirement i is satisfied.
  const met: boolean[] = new Array<boolean>(cfg.specSize).fill(false);
  // Out-of-spec tail: driftBits[j] = true once a spurious feature j has been added.
  const driftBits: boolean[] = new Array<boolean>(cfg.driftCapacity).fill(false);

  const qualityNow = (): number => {
    let m = 0;
    for (const b of met) if (b) m += 1;
    return m / cfg.specSize;
  };
  const driftNow = (): number => {
    let d = 0;
    for (const b of driftBits) if (b) d += 1;
    return d;
  };

  let peakQuality = 0;
  let regressionsAttempted = 0;
  let regressionsCaught = 0;
  const qualityByStep: number[] = [];

  for (let step = 0; step < cfg.iterations; step += 1) {
    const builder = `b${step % cfg.builders}`;
    const reviewer = `b${(step + 1) % cfg.builders}`;
    const fatigueMul = 1 + cfg.fatigue * (step / cfg.iterations);

    // --- 1. BUILD: lay a new stone. ---
    let built = false;
    if (rand() < cfg.pProgress) {
      const unmet = pickBit(met, false, rand);
      if (unmet >= 0) {
        met[unmet] = true;
        built = true;
      }
    }

    // --- 2. REGRESS: silently break an already-met requirement. ---
    let regressed = false;
    let regressedIdx = -1;
    if (rand() < cfg.pRegress * fatigueMul) {
      const done = pickBit(met, true, rand);
      if (done >= 0) {
        met[done] = false;
        regressed = true;
        regressedIdx = done;
        regressionsAttempted += 1;
      }
    }

    // --- 3. DRIFT: add an out-of-spec feature nobody asked for. ---
    let drifted = false;
    let driftedIdx = -1;
    if (rand() < cfg.pDrift * fatigueMul) {
      const empty = pickBit(driftBits, false, rand);
      if (empty >= 0) {
        driftBits[empty] = true;
        drifted = true;
        driftedIdx = empty;
      }
    }

    emitCommit?.({
      step,
      builder,
      built,
      regressed,
      drifted,
      quality: round3(qualityNow()),
      drift: driftNow(),
    });

    // --- 4. REVIEW: the next agent inspects this commit. ---
    let caughtRegression = false;
    let caughtDrift = false;
    if (cfg.reviewSkill > 0) {
      if (regressed && regressedIdx >= 0 && rand() < cfg.reviewSkill) {
        met[regressedIdx] = true; // revert the regression — restore the stone.
        caughtRegression = true;
        regressionsCaught += 1;
      }
      if (drifted && driftedIdx >= 0 && rand() < cfg.reviewSkill * cfg.driftVisibility) {
        driftBits[driftedIdx] = false; // revert the out-of-spec addition.
        caughtDrift = true;
      }
    }

    const q = qualityNow();
    if (q > peakQuality) peakQuality = q;

    emitReview?.({
      step,
      reviewer,
      caughtRegression,
      caughtDrift,
      quality: round3(q),
      drift: driftNow(),
    });

    if (step % cfg.snapshotEvery === 0 || step === cfg.iterations - 1) {
      const snap: Snapshot = { step, quality: round3(q), drift: driftNow() };
      qualityByStep.push(snap.quality);
      emitSnap?.(snap);
    }
  }

  const finalQuality = qualityNow();

  return {
    finalQuality: round3(finalQuality),
    finalDrift: driftNow(),
    peakQuality: round3(peakQuality),
    qualityDecay: round3(peakQuality - finalQuality),
    regressionRate: round3(regressionsAttempted / cfg.iterations),
    reviewCatchRate: round3(regressionsAttempted === 0 ? 0 : regressionsCaught / regressionsAttempted),
    qualityByStep,
  };
}
