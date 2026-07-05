/** Shared contracts for the schema-negotiation experiment. */

/**
 * The concept space every canonical field ultimately means. Two agents can use
 * DIFFERENT wire names for the same concept (renamed fields), and — the dangerous
 * case — the SAME wire name for DIFFERENT concepts ("false friends"). Semantics are
 * ground truth; names are just the negotiable surface.
 */
export type Concept =
  | 'orderId'
  | 'customerId'
  | 'itemCount'
  | 'subtotal' // pre-tax amount, in whole cents
  | 'grandTotal' // post-tax amount, in whole cents
  | 'currencyCode' // ISO 4217 alpha string, e.g. "USD"
  | 'createdAtMs' // unix epoch milliseconds
  | 'createdAtSec' // unix epoch seconds
  | 'status'
  | 'shippingCents';

/** How a field's payload is physically encoded on the wire. */
export type WireType = 'string' | 'int' | 'float' | 'enum';

/**
 * One field as an agent locally understands it. `name` is what the agent calls it on
 * the wire; `concept` is what it actually MEANS (never transmitted — the agent never
 * gets to see the peer's concepts, only names + example values). `wire` is the local
 * physical encoding.
 */
export interface FieldDef {
  /** The wire name this agent uses (the only thing the peer observes by label). */
  name: string;
  /** The real semantic meaning (ground truth, hidden from the peer). */
  concept: Concept;
  /** Local physical encoding. */
  wire: WireType;
}

/** A complete local data model: an ordered set of fields keyed by wire name. */
export interface Schema {
  /** Which agent owns this schema. */
  owner: 'A' | 'B';
  fields: readonly FieldDef[];
}

/** A record instance in one agent's local schema: wire-name -> encoded value. */
export type Record_ = Readonly<globalThis.Record<string, string | number>>;

/**
 * A single agreed mapping row: "when I (proposer) send my field `fromName`, you
 * (acceptor) should treat it as your field `toName`." Both sides believe this maps
 * the same concept. Whether it ACTUALLY does is what the sim measures.
 */
export interface MappingRow {
  /** Field name in A's schema. */
  aName: string;
  /** Field name in B's schema. */
  bName: string;
  /** Match evidence the agents used to agree (name/type/value heuristics). */
  basis: MatchBasis;
  /** The confidence the negotiators assigned (0..1) when they agreed this row. */
  confidence: number;
}

/** Why two fields were paired during negotiation. */
export type MatchBasis =
  | 'exact-name' // identical wire name (the false-friend trap)
  | 'renamed' // different name, matched by type + value shape
  | 'type-value'; // matched on encoding + example-value distribution only

/** The negotiated agreement: a wire format (ordered A-field list) + the field mapping. */
export interface Agreement {
  /** True if A and B converged before the round budget ran out. */
  agreed: boolean;
  /** Negotiation rounds consumed to reach `agreed` (or the budget if it failed). */
  rounds: number;
  /** The mapping both sides committed to. */
  mapping: readonly MappingRow[];
}

/** One negotiation utterance, surfaced to the trace as an A<->B message. */
export interface NegotiationTurn {
  round: number;
  from: 'A' | 'B';
  to: 'A' | 'B';
  kind: 'propose' | 'counter' | 'accept';
  /** The mapping rows this turn asserts/adjusts. */
  rows: readonly MappingRow[];
}

/** Config for a single negotiation+round-trip cell. */
export interface TrialConfig {
  /** Fraction of B's concepts that also appear in A's schema (schema overlap). */
  overlap: number;
  /** How many false-friend collisions to inject (same wire name, different concept). */
  falseFriends: number;
  /** How many records to round-trip A->B->A when scoring fidelity. */
  batchSize: number;
  /** Negotiation round budget before the pair gives up. */
  maxRounds: number;
}

/** Per-field outcome after a round-trip, bucketed for the headline metric. */
export interface FieldOutcome {
  aName: string;
  bName: string;
  basis: MatchBasis;
  /** Both agents believed this pairing was correct (it was in the agreement). */
  believedMatched: boolean;
  /** The concepts were actually identical (true semantic match). */
  trulyMatched: boolean;
  /** The round-tripped value equalled the original after decode/re-encode. */
  valuePreserved: boolean;
}

export interface TrialResult {
  agreed: boolean;
  rounds: number;
  /** Fraction of A's fields whose round-tripped value survived intact. */
  fidelity: number;
  /**
   * SILENT-CORRUPTION rate: fraction of agreed mappings that both agents believed
   * matched but whose concepts actually differed (false friends that slipped through).
   * The headline number.
   */
  silentCorruption: number;
  /** Fraction of the injected false friends that negotiation actually caught/rejected. */
  falseFriendsCaught: number;
  /** Count of agreed mapping rows. */
  mappedFields: number;
}

/** Optional hook so the harness can trace each negotiation turn onto the core bus. */
export type EmitTurn = (turn: NegotiationTurn) => void;
