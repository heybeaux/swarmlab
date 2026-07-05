/** Shared contracts for the reverse-engineer (black-box behavioral inference) experiment. */

/**
 * A probe input into the oracle. Kept as a small record so a "stateful" oracle can
 * read the running session state (accumulated spend) alongside the raw quantity.
 */
export interface Probe {
  /** The quantity being priced (units purchased in this request). */
  qty: number;
  /** Whether the caller flags this request as a promo/coupon order. */
  promo: boolean;
}

/** The oracle's response to one probe. Prices are integer cents to keep equality exact. */
export interface Observation {
  qty: number;
  promo: boolean;
  /** Price in cents the oracle charged for this probe (post all rules). */
  price: number;
}

/**
 * Complexity tier of the sealed oracle. Higher tiers layer on hidden behavior that
 * is invisible to typical (happy-path) probing:
 *  - stateless:      pure tiered price ladder, no memory, no coupons.
 *  - tiered:         adds a bulk-discount band + a rounding cliff at a hidden threshold.
 *  - stateful:       adds session memory (loyalty band once cumulative spend crosses a
 *                    hidden bar) plus a promo path that only fires on rare inputs.
 */
export type OracleComplexity = 'stateless' | 'tiered' | 'stateful';

/** Fully sealed configuration of Agent A's oracle. B never sees this object. */
export interface OracleSpec {
  complexity: OracleComplexity;
  /** Ascending break-points (qty) where the per-unit rate steps down. */
  breakpoints: readonly number[];
  /** Per-unit rate (cents) for each band; rates[i] applies below breakpoints[i]. */
  rates: readonly number[];
  /** Flat handling fee (cents) added to every order. */
  handling: number;
  /** Hidden rounding cliff: orders at/above this qty are rounded up to a round number. */
  roundingCliff: number;
  /** Cumulative-spend bar (cents) after which the session earns a loyalty rate cut. */
  loyaltyBar: number;
  /** Multiplier applied to the running price once loyalty is active (e.g. 0.9 = 10% off). */
  loyaltyMult: number;
  /** Promo orders at exactly this qty trigger a hidden "buy-one-free" style rebate. */
  promoQty: number;
  /** Rebate (cents) applied when the promo path fires. */
  promoRebate: number;
}

/** Which region of the input space a test case belongs to, for split scoring. */
export type CaseKind = 'happy' | 'edge';

/** One held-out test case with the region label used to split agreement. */
export interface TestCase {
  probe: Probe;
  kind: CaseKind;
  /** Ground-truth price from A's real oracle (recomputed fresh per session). */
  truth: number;
}

/** The prober's reconstructed model: a guessed price ladder inferred from observations. */
export interface ReconModel {
  /** Inferred breakpoints (qty) where the fitted per-unit rate changes. */
  breakpoints: number[];
  /** Inferred per-unit rate (cents) for each band. */
  rates: number[];
  /** Inferred flat handling fee (cents). */
  handling: number;
  /** Number of distinct probes the model was fit from. */
  probesUsed: number;
}

/** Outcome of scoring a reconstruction against a held-out test set. */
export interface ScoreResult {
  /** Overall fraction of test cases whose reconstructed price matches truth. */
  agreement: number;
  /** Agreement restricted to happy-path (typical) cases. */
  happyPathAgreement: number;
  /** Agreement restricted to edge / hidden-state cases. */
  edgeCaseAgreement: number;
  /** Number of probes B actually spent. */
  probesUsed: number;
}

/** One aggregate cell: fixed (complexity, budget) averaged over seeded trials. */
export interface CellAggregate {
  complexity: OracleComplexity;
  probeBudget: number;
  agreement: number;
  happyPathAgreement: number;
  edgeCaseAgreement: number;
  probesUsed: number;
}

/** Optional hook so the harness can trace each probe (B->A) and response (A->B) on the bus. */
export type EmitProbe = (obs: Observation) => void;
