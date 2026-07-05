/**
 * Agent A's SEALED oracle — the black box B is trying to reverse-engineer.
 *
 * The oracle prices an order given a quantity and a promo flag. Its behavior is a
 * layered pricing engine whose deeper layers are deliberately hard to observe from
 * typical probing:
 *
 *  1. A tiered per-unit ladder (breakpoints + rates) + a flat handling fee. This is the
 *     "happy path": smooth, monotone, and easy to fit from a handful of ordinary probes.
 *  2. A hidden ROUNDING CLIFF: orders at/above `roundingCliff` qty get the total rounded
 *     UP to the next multiple of 100 cents. Invisible unless you probe the exact band.
 *  3. Session STATE (stateful tier only): the oracle remembers cumulative spend across
 *     probes in a session; once it crosses `loyaltyBar`, every subsequent price is scaled
 *     by `loyaltyMult`. Pure input->output probing can never see this without replaying
 *     history in order.
 *  4. A rare PROMO path: `promo=true` at exactly `promoQty` applies a fixed rebate.
 *
 * Only Agent A holds the OracleSpec. B interacts through `OracleSession.ask()` and sees
 * nothing but prices. `buildOracleSpec` is A's construction; it is never handed to B.
 */
import type { Rand } from './rng.js';
import { randInt } from './rng.js';
import type { Observation, OracleComplexity, OracleSpec, Probe } from './types.js';

/** A's construction of a sealed oracle spec for the given complexity tier. */
export function buildOracleSpec(complexity: OracleComplexity, rand: Rand): OracleSpec {
  // Base tiered ladder: three descending per-unit rates across two breakpoints.
  const b1 = randInt(rand, 8, 14);
  const b2 = b1 + randInt(rand, 10, 24);
  const r0 = randInt(rand, 90, 120);
  const r1 = r0 - randInt(rand, 15, 30);
  const r2 = r1 - randInt(rand, 10, 25);
  const handling = randInt(rand, 40, 80);

  const stateless = complexity === 'stateless';
  const stateful = complexity === 'stateful';

  return {
    complexity,
    breakpoints: [b1, b2],
    rates: [r0, r1, r2],
    handling,
    // Stateless tier disables the cliff (cliff above any probeable qty).
    roundingCliff: stateless ? Number.POSITIVE_INFINITY : b2 + randInt(rand, 6, 14),
    loyaltyBar: stateful ? randInt(rand, 3000, 6000) : Number.POSITIVE_INFINITY,
    loyaltyMult: stateful ? 0.9 : 1,
    promoQty: stateful ? randInt(rand, 3, 7) : -1,
    promoRebate: stateful ? randInt(rand, 150, 300) : 0,
  };
}

/** The raw tiered ladder price (happy path only): per-unit bands + flat handling. */
function ladderPrice(spec: OracleSpec, qty: number): number {
  const [b1, b2] = spec.breakpoints;
  const [r0, r1, r2] = spec.rates;
  const rate0 = r0 ?? 0;
  const rate1 = r1 ?? rate0;
  const rate2 = r2 ?? rate1;
  const bp1 = b1 ?? Number.POSITIVE_INFINITY;
  const bp2 = b2 ?? Number.POSITIVE_INFINITY;
  let rate = rate0;
  if (qty >= bp2) rate = rate2;
  else if (qty >= bp1) rate = rate1;
  return qty * rate + spec.handling;
}

/**
 * A live session against the oracle. Holds hidden cumulative spend so the stateful tier
 * can apply the loyalty cut. Each `ask` returns only the price — never the internals.
 */
export class OracleSession {
  #spec: OracleSpec;
  #cumulativeSpend = 0;

  constructor(spec: OracleSpec) {
    this.#spec = spec;
  }

  /** Price one probe. Applies every hidden layer, mutates session state, returns the price. */
  ask(probe: Probe): Observation {
    const spec = this.#spec;
    let price = ladderPrice(spec, probe.qty);

    // Layer 2: hidden rounding cliff.
    if (probe.qty >= spec.roundingCliff) {
      price = Math.ceil(price / 100) * 100;
    }

    // Layer 3: session loyalty cut once cumulative spend has crossed the hidden bar.
    if (this.#cumulativeSpend >= spec.loyaltyBar) {
      price = Math.round(price * spec.loyaltyMult);
    }

    // Layer 4: rare promo rebate.
    if (probe.promo && probe.qty === spec.promoQty) {
      price = Math.max(0, price - spec.promoRebate);
    }

    this.#cumulativeSpend += price;
    return { qty: probe.qty, promo: probe.promo, price };
  }
}
