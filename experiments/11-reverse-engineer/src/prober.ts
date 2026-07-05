/**
 * Agent B — the reverse engineer. B never sees A's OracleSpec or source. It can only
 * spend a probe budget of (input -> output) queries against a fresh OracleSession and
 * then reconstruct an equivalent pricing model from what it observed.
 *
 * B's inference procedure is deterministic (given the seed) and mirrors how a real agent
 * would probe a black box:
 *   1. Sweep the observable qty range with `promo=false` to trace the price curve.
 *   2. Recover per-unit rates from consecutive differences (marginal price of one unit).
 *   3. Detect breakpoints where the marginal rate changes.
 *   4. Recover the flat handling fee from the intercept at the smallest probe.
 *
 * Crucially B fits ONLY the smooth tiered ladder. It has no way to see session state,
 * the rounding cliff band, or the promo path unless a probe happens to land on them — and
 * even then, a single anomalous point is discarded as noise by the ladder fit. This is the
 * whole point: the residual gap is exactly the un-probeable hidden behavior.
 */
import type { Rand } from './rng.js';
import { OracleSession } from './oracle.js';
import type { EmitProbe, Observation, OracleSpec, Probe, ReconModel } from './types.js';

/** The observable quantity window B knows to sweep (a public "reasonable order size" range). */
export const MAX_PROBE_QTY = 40;

/**
 * Choose which quantities to probe given a budget. Small budgets get a coarse even spread;
 * larger budgets fill in the range so breakpoints resolve. Always deterministic.
 */
function probePlan(budget: number, rand: Rand): number[] {
  const qtys = new Set<number>();
  // Anchor the two ends so the intercept + far band are always sampled.
  qtys.add(1);
  qtys.add(MAX_PROBE_QTY);
  // Even spread across the range for the remaining budget.
  const remaining = Math.max(0, budget - qtys.size);
  for (let i = 0; i < remaining; i += 1) {
    const frac = remaining <= 1 ? 0.5 : i / (remaining - 1);
    const q = 1 + Math.round(frac * (MAX_PROBE_QTY - 1));
    qtys.add(q);
  }
  // If dedup left us under budget, fill random distinct points (still deterministic).
  let guard = 0;
  while (qtys.size < budget && qtys.size < MAX_PROBE_QTY && guard < budget * 4) {
    qtys.add(1 + Math.floor(rand() * MAX_PROBE_QTY));
    guard += 1;
  }
  return [...qtys].sort((a, b) => a - b).slice(0, budget);
}

/** Fit a per-unit-rate ladder from the observed (qty -> price) curve. */
function fitLadder(obs: readonly Observation[], probesUsed: number): ReconModel {
  const sorted = [...obs].sort((a, b) => a.qty - b.qty);
  const first = sorted[0];
  if (!first) {
    return { breakpoints: [], rates: [100], handling: 0, probesUsed };
  }

  // Marginal rate between consecutive probes = (dPrice / dQty), rounded to a cent.
  // NOTE: the oracle applies a band's per-unit rate to the WHOLE quantity, so a segment
  // that STRADDLES a breakpoint shows a spurious (often negative) marginal from the
  // intercept jump. Those straddle steps are outliers B must reject — inside a band the
  // marginal is exactly the band's true per-unit rate.
  interface Seg {
    fromQty: number;
    toQty: number;
    rate: number;
  }
  const segs: Seg[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (!a || !b || b.qty === a.qty) continue;
    const rate = Math.round((b.price - a.price) / (b.qty - a.qty));
    segs.push({ fromQty: a.qty, toQty: b.qty, rate });
  }

  // A plausible per-unit rate is positive and in a sane retail band; straddle/cliff steps
  // fall outside this and are dropped so they can't corrupt the fitted ladder.
  const plausible = segs.filter((s) => s.rate > 0 && s.rate < 1000);

  // Walk the plausible segments in qty order; a sustained rate change (confirmed by the
  // NEXT plausible segment agreeing) marks a real breakpoint. A lone divergent segment is
  // treated as noise. This yields the banded rate ladder without straddle artifacts.
  const breakpoints: number[] = [];
  const rates: number[] = [];
  let prevRate: number | undefined;
  for (let i = 0; i < plausible.length; i += 1) {
    const seg = plausible[i];
    if (!seg) continue;
    if (prevRate === undefined) {
      rates.push(seg.rate);
      prevRate = seg.rate;
      continue;
    }
    if (Math.abs(seg.rate - prevRate) > 1) {
      const next = plausible[i + 1];
      const confirmed = next ? Math.abs(next.rate - seg.rate) <= 1 : true;
      if (confirmed) {
        breakpoints.push(seg.fromQty);
        rates.push(seg.rate);
        prevRate = seg.rate;
      }
    }
  }
  if (rates.length === 0) rates.push(prevRate ?? 100);

  // Handling = intercept at the smallest probe: price(q0) - q0 * rate0. Only valid if the
  // smallest probe sits in the first band (below the first inferred breakpoint).
  const rate0 = rates[0] ?? 100;
  const firstBp = breakpoints[0] ?? Number.POSITIVE_INFINITY;
  const anchor = first.qty < firstBp ? first : (sorted.find((o) => o.qty < firstBp) ?? first);
  const handling = Math.round(anchor.price - anchor.qty * rate0);

  return { breakpoints, rates, handling: Math.max(0, handling), probesUsed };
}

/** Predict a price from B's reconstructed ladder (its best guess of the oracle). */
export function predict(model: ReconModel, probe: Probe): number {
  let rate = model.rates[0] ?? 100;
  for (let i = 0; i < model.breakpoints.length; i += 1) {
    const bp = model.breakpoints[i];
    if (bp !== undefined && probe.qty >= bp) rate = model.rates[i + 1] ?? rate;
  }
  return probe.qty * rate + model.handling;
}

/**
 * Run B against a fresh oracle session: spend the probe budget, observe, reconstruct.
 * `emit` (if given) fires once per probe so the harness can put B->A and A->B on the bus.
 */
export function reverseEngineer(
  spec: OracleSpec,
  budget: number,
  rand: Rand,
  emit?: EmitProbe,
): ReconModel {
  const session = new OracleSession(spec);
  const plan = probePlan(budget, rand);
  const obs: Observation[] = [];
  for (const qty of plan) {
    const observation = session.ask({ qty, promo: false });
    obs.push(observation);
    emit?.(observation);
  }
  return fitLadder(obs, obs.length);
}
