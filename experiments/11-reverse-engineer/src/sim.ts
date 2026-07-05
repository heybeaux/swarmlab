/**
 * Reverse-engineer sim engine. One trial:
 *   1. A builds a sealed oracle spec at the requested complexity.
 *   2. B (the prober) spends its probe budget against a fresh session and reconstructs
 *      a ladder model — seeing only prices.
 *   3. We build a held-out test set split into HAPPY-PATH cases (ordinary probes in the
 *      observable window) and EDGE cases (the rounding-cliff band, the promo path, and
 *      loyalty-active session states). Ground truth comes from A's real oracle.
 *   4. We score B's reconstruction against truth, split happy vs edge, so the divergence
 *      is visible in the trace.
 *
 * The edge cases are constructed to probe exactly the behavior a black-box sweep cannot
 * see: hidden state (loyalty), hidden thresholds (cliff), and rare inputs (promo).
 */
import type { Rand } from './rng.js';
import { buildOracleSpec, OracleSession } from './oracle.js';
import { MAX_PROBE_QTY, predict, reverseEngineer } from './prober.js';
import type {
  EmitProbe,
  OracleComplexity,
  OracleSpec,
  Probe,
  ReconModel,
  ScoreResult,
  TestCase,
} from './types.js';

const HAPPY_CASES = 24;

/** Ground-truth price of a single probe against a fresh (no-history) session. */
function truthFresh(spec: OracleSpec, probe: Probe): number {
  return new OracleSession(spec).ask(probe).price;
}

/**
 * Ground-truth price of a probe when the session has ALREADY crossed the loyalty bar.
 * We warm a session past `loyaltyBar` with large orders, then ask the target probe — so
 * the truth reflects the hidden loyalty state that pure sweep-probing never activates.
 */
function truthLoyaltyActive(spec: OracleSpec, probe: Probe): number {
  const session = new OracleSession(spec);
  // Warm past the loyalty bar with big orders (finite bar => stateful tier only).
  let spend = 0;
  let guard = 0;
  while (spend < spec.loyaltyBar && guard < 64) {
    spend += session.ask({ qty: MAX_PROBE_QTY, promo: false }).price;
    guard += 1;
  }
  return session.ask(probe).price;
}

/** Build the held-out test set for a spec: HAPPY ordinary probes + EDGE hidden-behavior probes. */
export function buildTestSet(spec: OracleSpec, rand: Rand): TestCase[] {
  const cases: TestCase[] = [];

  // Happy path: ordinary quantities in the observable window, no promo, fresh session.
  for (let i = 0; i < HAPPY_CASES; i += 1) {
    const qty = 1 + Math.floor(rand() * MAX_PROBE_QTY);
    const probe: Probe = { qty, promo: false };
    cases.push({ probe, kind: 'happy', truth: truthFresh(spec, probe) });
  }

  // Edge: rounding-cliff band (qty at/above the hidden cliff), fresh session.
  if (Number.isFinite(spec.roundingCliff)) {
    for (let k = 0; k < 6; k += 1) {
      const qty = Math.round(spec.roundingCliff) + k;
      const probe: Probe = { qty, promo: false };
      cases.push({ probe, kind: 'edge', truth: truthFresh(spec, probe) });
    }
  }

  // Edge: loyalty-active session state (stateful tier only).
  if (Number.isFinite(spec.loyaltyBar)) {
    for (let k = 0; k < 6; k += 1) {
      const qty = 1 + Math.floor(rand() * MAX_PROBE_QTY);
      const probe: Probe = { qty, promo: false };
      cases.push({ probe, kind: 'edge', truth: truthLoyaltyActive(spec, probe) });
    }
  }

  // Edge: the promo rebate path (stateful tier only).
  if (spec.promoQty >= 0) {
    for (let k = 0; k < 4; k += 1) {
      const probe: Probe = { qty: spec.promoQty, promo: true };
      cases.push({ probe, kind: 'edge', truth: truthFresh(spec, probe) });
    }
  }

  return cases;
}

/** Score B's reconstruction against a held-out test set, split happy vs edge. */
export function scoreReconstruction(
  model: ReconModel,
  tests: readonly TestCase[],
): ScoreResult {
  let all = 0;
  let allN = 0;
  let happy = 0;
  let happyN = 0;
  let edge = 0;
  let edgeN = 0;
  for (const tc of tests) {
    const guess = predict(model, tc.probe);
    const match = guess === tc.truth ? 1 : 0;
    all += match;
    allN += 1;
    if (tc.kind === 'happy') {
      happy += match;
      happyN += 1;
    } else {
      edge += match;
      edgeN += 1;
    }
  }
  return {
    agreement: round3(allN === 0 ? 0 : all / allN),
    happyPathAgreement: round3(happyN === 0 ? 0 : happy / happyN),
    // A complexity tier with NO hidden behavior (stateless) has zero edge cases; treat that
    // as vacuously perfect (1.0) so the happy-vs-edge gap reads 0 rather than a phantom drop.
    edgeCaseAgreement: round3(edgeN === 0 ? 1 : edge / edgeN),
    probesUsed: model.probesUsed,
  };
}

/** One full trial: build oracle, reverse-engineer under budget, score. */
export function runTrial(
  complexity: OracleComplexity,
  probeBudget: number,
  rand: Rand,
  emit?: EmitProbe,
): ScoreResult {
  const spec = buildOracleSpec(complexity, rand);
  const model = reverseEngineer(spec, probeBudget, rand, emit);
  const tests = buildTestSet(spec, rand);
  return scoreReconstruction(model, tests);
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
