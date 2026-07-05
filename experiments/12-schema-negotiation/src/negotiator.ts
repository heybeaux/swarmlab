/**
 * Refereeless schema negotiation between agent A and agent B.
 *
 * Neither agent can see the other's `concept` labels — only wire NAMES, wire TYPES, and
 * example VALUES. They must bootstrap a shared field mapping from that surface alone. The
 * protocol is a bounded proposal / counter-proposal exchange:
 *
 *   Round r, turn A->B (propose): A offers, for each of its fields, its best guess at the
 *     matching B field, scored by a name/type/value heuristic. It only proposes rows whose
 *     confidence clears `acceptThreshold`.
 *   Turn B->A (counter): B independently scores the same candidate pairs from ITS side. It
 *     keeps the rows it also finds plausible, drops the ones it can't corroborate, and may
 *     add rows A missed. This is the counter-proposal.
 *   Convergence: when a full A->B / B->A exchange produces no change to the committed set,
 *     both sides `accept` and negotiation ends.
 *
 * The heuristic is deliberately naive — it is exactly the "schema matcher without typed
 * contracts" that Sonder replaces. Its blind spot is the whole experiment: an EXACT NAME
 * MATCH is treated as near-certain, so a false friend ("total" pre-tax vs post-tax) sails
 * through with high confidence and is never questioned. There is no oracle for meaning.
 */
import type { Rand } from './rng.js';
import type {
  Agreement,
  FieldDef,
  MappingRow,
  MatchBasis,
  NegotiationTurn,
  Schema,
  WireType,
} from './types.js';

/** How strongly two encodings resemble each other (0..1). */
function typeAffinity(a: WireType, b: WireType): number {
  if (a === b) return 1;
  // Ints and floats are numerically confusable; enums and strings shade into each other.
  const numeric = (t: WireType): boolean => t === 'int' || t === 'float';
  const texty = (t: WireType): boolean => t === 'string' || t === 'enum';
  if (numeric(a) && numeric(b)) return 0.8;
  if (texty(a) && texty(b)) return 0.6;
  return 0.1;
}

/** Cheap lexical similarity on wire names (token overlap + prefix), 0..1. */
function nameAffinity(a: string, b: string): number {
  if (a === b) return 1;
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  if (na === nb) return 1;
  const ta = new Set(na.split(/[^a-z0-9]+/).filter(Boolean));
  const tb = new Set(nb.split(/[^a-z0-9]+/).filter(Boolean));
  let shared = 0;
  for (const tok of ta) if (tb.has(tok)) shared += 1;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union === 0 ? 0 : shared / union;
  // A shared 3+ char prefix (orderId / order_ref) nudges the score.
  const prefix = na.slice(0, 3) === nb.slice(0, 3) ? 0.25 : 0;
  return Math.min(1, jaccard * 0.7 + prefix);
}

/**
 * Confidence that A-field and B-field are the same concept, from wire surface only.
 * Returns the score and the basis that dominated it.
 */
function pairConfidence(af: FieldDef, bf: FieldDef): { score: number; basis: MatchBasis } {
  const nameScore = nameAffinity(af.name, bf.name);
  const typeScore = typeAffinity(af.wire, bf.wire);
  if (af.name === bf.name) {
    // Exact-name match — the heuristic's strongest and most dangerous signal. Type still
    // gates it slightly, but a same-name/same-type pair is treated as near-certain.
    return { score: Math.min(1, 0.7 + 0.3 * typeScore), basis: 'exact-name' };
  }
  const combined = 0.55 * nameScore + 0.45 * typeScore;
  const basis: MatchBasis = nameScore > 0.15 ? 'renamed' : 'type-value';
  return { score: combined, basis };
}

export interface NegotiationConfig {
  /** Minimum confidence to propose/commit a mapping row. */
  acceptThreshold: number;
  /** Round budget before the pair gives up. */
  maxRounds: number;
}

/**
 * Run the negotiation. `rand` breaks ties deterministically (which of two equally-good
 * candidates a side reaches for first). `emit` surfaces each turn as an A<->B message.
 */
export function negotiate(
  a: Schema,
  b: Schema,
  cfg: NegotiationConfig,
  rand: Rand,
  emit?: (turn: NegotiationTurn) => void,
): Agreement {
  // Each side builds its own view of the candidate rows; the committed set is the overlap
  // both sides currently endorse. We iterate propose/counter until it stabilises.
  const committedKey = (aName: string, bName: string): string => `${aName}\u0000${bName}`;

  /** A greedily proposes: for each A field, its single best B field above threshold. */
  const proposeFrom = (self: Schema, peer: Schema): MappingRow[] => {
    const rows: MappingRow[] = [];
    const usedPeer = new Set<string>();
    // Deterministic tie jitter so equal scores resolve identically across replays.
    const jitter = (name: string): number => rand() * 1e-6 + name.length * 1e-9;
    for (const sf of self.fields) {
      let best: { pf: FieldDef; score: number; basis: MatchBasis } | undefined;
      for (const pf of peer.fields) {
        if (usedPeer.has(pf.name)) continue;
        const { score, basis } = pairConfidence(sf, pf);
        const s = score + jitter(pf.name);
        if (!best || s > best.score) best = { pf, score, basis };
      }
      if (best && best.score >= cfg.acceptThreshold) {
        usedPeer.add(best.pf.name);
        const aName = self.owner === 'A' ? sf.name : best.pf.name;
        const bName = self.owner === 'A' ? best.pf.name : sf.name;
        rows.push({ aName, bName, basis: best.basis, confidence: round3(best.score) });
      }
    }
    return rows;
  };

  let committed: MappingRow[] = [];
  let rounds = 0;

  for (let r = 0; r < cfg.maxRounds; r += 1) {
    rounds = r + 1;

    // --- A -> B : propose ---
    const aProposal = proposeFrom(a, b);
    emit?.({ round: r, from: 'A', to: 'B', kind: r === 0 ? 'propose' : 'counter', rows: aProposal });

    // --- B -> A : counter ---
    // B independently scores each proposed pair from its own side and keeps only the ones
    // it also finds plausible (mutual endorsement). It cannot see A's concepts either.
    const bByName = new Map<string, FieldDef>(b.fields.map((f) => [f.name, f]));
    const aByName = new Map<string, FieldDef>(a.fields.map((f) => [f.name, f]));
    const endorsed: MappingRow[] = [];
    for (const row of aProposal) {
      const af = aByName.get(row.aName);
      const bf = bByName.get(row.bName);
      if (!af || !bf) continue;
      const { score, basis } = pairConfidence(af, bf);
      if (score >= cfg.acceptThreshold) {
        endorsed.push({ aName: row.aName, bName: row.bName, basis, confidence: round3(score) });
      }
    }
    emit?.({ round: r, from: 'B', to: 'A', kind: 'counter', rows: endorsed });

    // Convergence check: did the mutually-endorsed set change from last round?
    const prevKeys = new Set(committed.map((row) => committedKey(row.aName, row.bName)));
    const nextKeys = new Set(endorsed.map((row) => committedKey(row.aName, row.bName)));
    const changed =
      prevKeys.size !== nextKeys.size || [...nextKeys].some((k) => !prevKeys.has(k));
    committed = endorsed;

    if (!changed) {
      emit?.({ round: r, from: 'A', to: 'B', kind: 'accept', rows: committed });
      emit?.({ round: r, from: 'B', to: 'A', kind: 'accept', rows: committed });
      return { agreed: true, rounds, mapping: committed };
    }
  }

  // Budget exhausted without a stable fixpoint. Commit whatever last stood — but flag as
  // not-agreed so the sim can distinguish forced agreement from genuine convergence.
  return { agreed: false, rounds, mapping: committed };
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
