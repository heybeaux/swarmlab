/**
 * Two divergent data models for the SAME domain (an e-commerce "order"), plus a
 * factory that constructs a matched (A, B) pair for a given overlap % and a given
 * number of false-friend collisions.
 *
 * Three kinds of divergence, exactly per the spec:
 *   1. SHARED     — same concept, same wire name (e.g. both call it "orderId").
 *   2. RENAMED    — same concept, different wire name (A "grandTotal" vs B "total_due").
 *   3. FALSE FRIEND — same wire name, DIFFERENT concept/units. The trap:
 *        - `total`     : A = subtotal (pre-tax) ,  B = grandTotal (post-tax)
 *        - `id`        : A = orderId (string)   ,  B = customerId (int)
 *        - `created`   : A = createdAtMs (ms)   ,  B = createdAtSec (seconds)
 * Names collide, encodings look plausibly similar, values overlap in range — so a
 * name/type/value heuristic pairs them and both agents "agree". Nobody is wrong on
 * the wire; everybody is wrong about meaning.
 */
import type { Rand } from './rng.js';
import { shuffle } from './rng.js';
import type { Concept, FieldDef, Schema, WireType } from './types.js';

/** Canonical concepts, paired with their natural wire encoding. */
interface ConceptDef {
  concept: Concept;
  wire: WireType;
  /** A's natural name for this concept. */
  aName: string;
  /** B's natural name for this concept (renamed when different from A's). */
  bName: string;
}

/** The full concept catalogue for the order domain. */
const CATALOGUE: readonly ConceptDef[] = [
  { concept: 'orderId', wire: 'string', aName: 'orderId', bName: 'order_ref' },
  { concept: 'customerId', wire: 'int', aName: 'customerId', bName: 'buyer_id' },
  { concept: 'itemCount', wire: 'int', aName: 'itemCount', bName: 'qty' },
  { concept: 'subtotal', wire: 'int', aName: 'subtotal', bName: 'net_amount' },
  { concept: 'grandTotal', wire: 'int', aName: 'grandTotal', bName: 'total_due' },
  { concept: 'currencyCode', wire: 'enum', aName: 'currency', bName: 'ccy' },
  { concept: 'createdAtMs', wire: 'int', aName: 'createdAtMs', bName: 'ts_millis' },
  { concept: 'status', wire: 'enum', aName: 'status', bName: 'state' },
  { concept: 'shippingCents', wire: 'int', aName: 'shipping', bName: 'ship_fee' },
];

/**
 * False-friend recipes: a shared wire NAME assigned to DIFFERENT concepts on each side.
 * The encodings are close enough that a naive matcher treats them as the same field.
 */
interface FalseFriend {
  sharedName: string;
  aConcept: Concept;
  aWire: WireType;
  bConcept: Concept;
  bWire: WireType;
}

const FALSE_FRIENDS: readonly FalseFriend[] = [
  // Classic: "total" means pre-tax to A, post-tax to B. Same encoding, values overlap.
  { sharedName: 'total', aConcept: 'subtotal', aWire: 'int', bConcept: 'grandTotal', bWire: 'int' },
  // "id" is a string order id to A, an int customer id to B.
  { sharedName: 'id', aConcept: 'orderId', aWire: 'string', bConcept: 'customerId', bWire: 'int' },
  // "created" is epoch-ms to A, epoch-seconds to B (units diverge, both ints).
  { sharedName: 'created', aConcept: 'createdAtMs', aWire: 'int', bConcept: 'createdAtSec', bWire: 'int' },
];

export interface SchemaPair {
  a: Schema;
  b: Schema;
  /** The wire names that are genuine false friends in this pair (for scoring). */
  falseFriendNames: readonly string[];
}

/**
 * Build an (A, B) schema pair.
 *
 * @param overlap Fraction (0..1) of catalogue concepts both agents share. The rest are
 *   held by A only or B only (private fields that have no honest counterpart).
 * @param falseFriends How many false-friend collisions to inject (capped at the recipe count).
 * @param rand Seeded RNG so the concept partition is deterministic per trial.
 */
export function buildSchemaPair(overlap: number, falseFriends: number, rand: Rand): SchemaPair {
  const catalogue = shuffle([...CATALOGUE], rand);
  const shareCount = Math.max(1, Math.round(overlap * catalogue.length));

  const aFields: FieldDef[] = [];
  const bFields: FieldDef[] = [];

  for (let i = 0; i < catalogue.length; i += 1) {
    const def = catalogue[i];
    if (!def) continue;
    if (i < shareCount) {
      // Shared concept: A uses aName, B uses bName. If names are equal it's a "shared"
      // field; if they differ it's a "renamed" field. Either way the concept matches.
      aFields.push({ name: def.aName, concept: def.concept, wire: def.wire });
      bFields.push({ name: def.bName, concept: def.concept, wire: def.wire });
    } else if (rand() < 0.5) {
      // Private to A only.
      aFields.push({ name: def.aName, concept: def.concept, wire: def.wire });
    } else {
      // Private to B only.
      bFields.push({ name: def.bName, concept: def.concept, wire: def.wire });
    }
  }

  // Inject false friends: append a collision field to BOTH sides under the SAME name,
  // but pointing at different concepts. These are what negotiation may silently mismap.
  const ffCount = Math.max(0, Math.min(falseFriends, FALSE_FRIENDS.length));
  const injected: string[] = [];
  for (let i = 0; i < ffCount; i += 1) {
    const ff = FALSE_FRIENDS[i];
    if (!ff) continue;
    // Only inject if neither side already used that name (keep the collision clean).
    const clash = aFields.some((f) => f.name === ff.sharedName) || bFields.some((f) => f.name === ff.sharedName);
    if (clash) continue;
    aFields.push({ name: ff.sharedName, concept: ff.aConcept, wire: ff.aWire });
    bFields.push({ name: ff.sharedName, concept: ff.bConcept, wire: ff.bWire });
    injected.push(ff.sharedName);
  }

  return {
    a: { owner: 'A', fields: aFields },
    b: { owner: 'B', fields: bFields },
    falseFriendNames: injected,
  };
}

/**
 * Produce a deterministic example value for a concept, used both to seed records and to
 * give the negotiator "sample values" to sniff. Ranges are chosen so false friends look
 * plausibly interchangeable (e.g. subtotal and grandTotal are both mid-range cent ints).
 */
export function sampleValue(concept: Concept, rand: Rand): string | number {
  switch (concept) {
    case 'orderId':
      return `ord_${Math.floor(rand() * 1_000_000).toString(36)}`;
    case 'customerId':
      return 100_000 + Math.floor(rand() * 900_000);
    case 'itemCount':
      return 1 + Math.floor(rand() * 20);
    case 'subtotal':
      return 1_000 + Math.floor(rand() * 40_000); // pre-tax cents
    case 'grandTotal':
      return 1_100 + Math.floor(rand() * 44_000); // post-tax cents (overlapping range!)
    case 'currencyCode':
      return ['USD', 'EUR', 'GBP', 'JPY'][Math.floor(rand() * 4)] ?? 'USD';
    case 'createdAtMs':
      return 1_700_000_000_000 + Math.floor(rand() * 100_000_000);
    case 'createdAtSec':
      return 1_700_000_000 + Math.floor(rand() * 100_000);
    case 'status':
      return ['new', 'paid', 'shipped', 'closed'][Math.floor(rand() * 4)] ?? 'new';
    case 'shippingCents':
      return Math.floor(rand() * 2_000);
    default:
      return 0;
  }
}
