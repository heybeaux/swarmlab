/**
 * Deterministic bug-telephone engine. A bug of a given subtlety is inspected by a
 * chain of reviewers in series. Each reviewer's catch probability is shaped by four
 * forces, and the first to catch it stops the chain:
 *
 *   competence  — per-reviewer skill (drawn around meanCompetence).
 *   attention   — a review window that FATIGUES with chain position: deep reviewers
 *                 skim (effective attention = 1 / (1 + fatigue · pos)).
 *   subtlety    — how hidden the bug is; catch scales with (1 - subtlety).
 *   complacency — the rubber-stamp effect: under the `serial` policy, each upstream
 *                 PASS multiplies scrutiny by (1 - rubberStamp), so "it already passed
 *                 3 reviews, LGTM" makes the 4th reviewer measurably lazier. Under the
 *                 `independent` (blind) policy complacency is pinned at 1.
 *
 *   p_catch(k) = clamp( baseCatch · competence_k · attention_k · (1 - subtlety) · complacency_k )
 *
 * The single governance variable between policies is whether the PASS trail is visible.
 */
import type { Rand } from './rng.js';
import type { EmitReview, ReviewStep, TrialConfig, TrialResult } from './types.js';

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 0.99) return 0.99;
  return x;
}

/** Per-reviewer competence: meanCompetence ± competenceSpread, clamped to (0,1). */
function drawCompetence(cfg: TrialConfig, rand: Rand): number {
  const jitter = (rand() * 2 - 1) * cfg.competenceSpread;
  return Math.min(0.99, Math.max(0.05, cfg.meanCompetence + jitter));
}

export function runTrial(cfg: TrialConfig, rand: Rand, emit?: EmitReview): TrialResult {
  const steps: ReviewStep[] = [];
  let upstreamPasses = 0;

  for (let pos = 0; pos < cfg.chainLen; pos += 1) {
    const competence = drawCompetence(cfg, rand);
    const attention = 1 / (1 + cfg.fatigue * pos);
    const complacency =
      cfg.policy === 'independent' ? 1 : Math.pow(1 - cfg.rubberStamp, upstreamPasses);
    const pCatch = clamp01(
      cfg.baseCatch * competence * attention * (1 - cfg.subtlety) * complacency,
    );
    const caught = rand() < pCatch;

    const step: ReviewStep = {
      pos,
      competence: round3(competence),
      attention: round3(attention),
      complacency: round3(complacency),
      pCatch: round3(pCatch),
      caught,
    };
    steps.push(step);
    emit?.(step);

    if (caught) {
      return { survivalDepth: pos, shipped: false, reviewsUsed: pos + 1, steps };
    }
    upstreamPasses += 1;
  }

  // Nobody caught it — the bug ships.
  return { survivalDepth: cfg.chainLen, shipped: true, reviewsUsed: cfg.chainLen, steps };
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
