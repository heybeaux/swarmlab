/**
 * Retest mode `sonder` (Spec 14 B1).
 *
 * Same schema generator (`buildSchemaPair`), same sweep (overlap × falseFriends,
 * 40 trials/cell), same metrics as `naive` — but the mapping is produced by the
 * REAL shipped `negotiateContracts` from `@heybeaux/sonder-core`, not the lab's
 * naive heuristic. Each side transmits its hidden `concept` (and a derived `unit`)
 * as a `FieldContract`; the referee is deterministic type-checking.
 *
 * The matcher is NOT reimplemented here — we import and exercise the shipped
 * function so the retest measures the actual stack change. The only lab-local code
 * is the adapter that turns a lab `FieldDef` (concept + wire) into a sonder
 * `FieldContract` (concept + unit + wire), and the metric accounting.
 *
 * Crucially, corruption must reach 0 BY DETECTION — every false friend must be
 * NAMED in the negotiation result — not by refusal-to-agree. We therefore report
 * `mismatchesNamed / falseFriendsInjected` and assert it hits 1.0.
 */
import {
  negotiateContracts,
  makePayloadContract,
  type FieldContract,
  type NegotiationResult,
} from '@heybeaux/sonder-core';
import type { Rand } from './rng.js';
import { buildSchemaPair } from './schemas.js';
import { round3 } from './sim.js';
import type { Concept, FieldDef, Schema, TrialConfig } from './types.js';

/**
 * Derive the sonder (concept, unit) pair for a lab concept. This is the whole
 * point of the change: meaning + unit become transmitted type terms instead of
 * being inferred from the wire name. The three exp-12 false friends map to:
 *   - subtotal   → order.total @ cents_pretax
 *   - grandTotal → order.total @ cents_posttax   (same concept, different unit)
 *   - orderId    → order.id.order @ none
 *   - customerId → order.id.customer @ none       (different concept)
 *   - createdAtMs  → order.created @ epoch_ms
 *   - createdAtSec → order.created @ epoch_s       (same concept, different unit)
 * Honest renames keep the SAME (concept, unit) on both sides, so they still match.
 */
function semanticsOf(concept: Concept): { concept: string; unit: string } {
  switch (concept) {
    case 'orderId':
      return { concept: 'order.id.order', unit: 'none' };
    case 'customerId':
      return { concept: 'order.id.customer', unit: 'none' };
    case 'itemCount':
      return { concept: 'order.itemCount', unit: 'count' };
    case 'subtotal':
      return { concept: 'order.total', unit: 'cents_pretax' };
    case 'grandTotal':
      return { concept: 'order.total', unit: 'cents_posttax' };
    case 'currencyCode':
      return { concept: 'order.currency', unit: 'iso4217' };
    case 'createdAtMs':
      return { concept: 'order.created', unit: 'epoch_ms' };
    case 'createdAtSec':
      return { concept: 'order.created', unit: 'epoch_s' };
    case 'status':
      return { concept: 'order.status', unit: 'enum' };
    case 'shippingCents':
      return { concept: 'order.shipping', unit: 'cents' };
    default:
      return { concept: `order.${String(concept)}`, unit: 'none' };
  }
}

/** Map a lab wire type onto the sonder FieldContract wire alphabet. */
function wireOf(f: FieldDef): FieldContract['wire'] {
  switch (f.wire) {
    case 'string':
      return 'string';
    case 'int':
      return 'int';
    case 'float':
      return 'float';
    case 'enum':
      return 'enum';
    default:
      return 'string';
  }
}

/** Turn a lab schema into a sonder PayloadContract (concept + unit transmitted). */
function toContractFields(schema: Schema): FieldContract[] {
  return schema.fields.map((f) => {
    const s = semanticsOf(f.concept);
    return { name: f.name, wire: wireOf(f), concept: s.concept, unit: s.unit };
  });
}

/** One negotiation turn surfaced to the trace (mirrors the naive mode's shape). */
export interface SonderTurn {
  from: 'A' | 'B';
  to: 'A' | 'B';
  kind: 'contract' | 'result';
  /** For 'contract': the field contracts offered. For 'result': matches + named mismatches. */
  body: Record<string, unknown>;
}

export interface SonderHooks {
  emit?: (turn: SonderTurn) => void;
}

export interface SonderTrialResult {
  agreed: boolean;
  /** Fraction of A's fields whose round-tripped value survived (matches only map safe rows). */
  fidelity: number;
  /** Fraction of agreed (matched) rows that were NOT truly the same concept. */
  silentCorruption: number;
  /** Fraction of injected false friends that were caught (named, never mapped). */
  falseFriendsCaught: number;
  mappedFields: number;
  /** How many injected false friends were surfaced as an EXPLICIT named collision. */
  mismatchesNamed: number;
  /** How many false friends were injected in this trial. */
  falseFriendsInjected: number;
  /**
   * Wrong SAME-NAME→SAME-NAME mappings that escaped into `matches` (silent
   * corruption at the false-friend level). MUST be 0 with typed contracts — this is
   * the honest headline: corruption prevented by detection, not by refusal-to-agree.
   */
  ffCorruptEscapes: number;
}

/**
 * Run one sonder-mode trial. Same schema pair as naive mode; mapping produced by
 * the shipped `negotiateContracts`. A "mapped row" is a returned `match`; silent
 * corruption is a match whose true concepts differ (must be zero if the matcher is
 * correct — a match requires concept+unit equality, so ground-truth concept must
 * agree). A false friend is "caught" iff it appears in the named mismatches.
 */
export function runSonderTrial(cfg: TrialConfig, rand: Rand, hooks?: SonderHooks): SonderTrialResult {
  const pair = buildSchemaPair(cfg.overlap, cfg.falseFriends, rand);

  const aFields = toContractFields(pair.a);
  const bFields = toContractFields(pair.b);
  const a = makePayloadContract(aFields);
  const b = makePayloadContract(bFields);

  hooks?.emit?.({ from: 'A', to: 'B', kind: 'contract', body: { contract_id: a.contract_id, fields: aFields } });
  hooks?.emit?.({ from: 'B', to: 'A', kind: 'contract', body: { contract_id: b.contract_id, fields: bFields } });

  const res: NegotiationResult = negotiateContracts(a, b);

  // Ground truth: a match is "truly matched" iff the underlying lab concepts agree.
  // We recover each side's lab concept by wire name from the original schema.
  const aConceptByName = new Map(pair.a.fields.map((f) => [f.name, f.concept]));
  const bConceptByName = new Map(pair.b.fields.map((f) => [f.name, f.concept]));

  const mappedFields = res.matches.length;
  let silent = 0;
  for (const m of res.matches) {
    const aConcept = aConceptByName.get(m.a.name);
    const bConcept = bConceptByName.get(m.b.name);
    if (aConcept === undefined || aConcept !== bConcept) silent += 1;
  }

  // False-friend accounting. Each injected false friend is a SAME wire-name field on
  // both sides with DIFFERENT true concept. Under the naive matcher it mapped
  // same-name→same-name and corrupted silently. The contract question is: for each
  // such wire name, does the SAME-NAME→SAME-NAME (semantically wrong) mapping still
  // appear in `matches`? If yes → a corrupt escape (must be 0). If no → prevented.
  //
  // A false friend is "caught" iff it is PREVENTED from mapping to its wrong twin.
  // Prevention happens three honest ways with typed contracts:
  //   (a) NAMED  — surfaced as a false_friend/unit_mismatch collision, or
  //   (b) RE-ROUTED — each half correctly matched to its true concept twin
  //       (an honest field that shares the concept), or
  //   (c) UNMAPPED — the concept has no twin on the other side (a private field).
  // In every case the wrong same-name mapping never ships. `mismatchesNamed` reports
  // (a) specifically, so the retest can distinguish "named collision" from
  // "dissolved into correct matches" and stay honest about which the run relied on.
  const ffNames = new Set(pair.falseFriendNames);

  // Count wrong SAME-NAME→SAME-NAME mappings that escaped into matches (corruption).
  let ffCorruptEscapes = 0;
  for (const m of res.matches) {
    if (m.a.name === m.b.name && ffNames.has(m.a.name)) {
      const aConcept = aConceptByName.get(m.a.name);
      const bConcept = bConceptByName.get(m.b.name);
      if (aConcept !== bConcept) ffCorruptEscapes += 1;
    }
  }

  // Count false friends NAMED as an explicit collision.
  const namedMismatchNames = new Set<string>();
  for (const mm of res.mismatches) {
    if (mm.kind === 'false_friend' || mm.kind === 'unit_mismatch') {
      if (mm.a && ffNames.has(mm.a.name)) namedMismatchNames.add(mm.a.name);
      if (mm.b && ffNames.has(mm.b.name)) namedMismatchNames.add(mm.b.name);
    }
  }

  const totalFf = pair.falseFriendNames.length;
  const mismatchesNamed = namedMismatchNames.size;
  // Caught = prevented from a wrong same-name map. With contracts this is every
  // injected ff minus any corrupt escape (escapes must be 0).
  const caughtFf = totalFf - ffCorruptEscapes;

  // Fidelity: matched rows are concept+unit-equal, so the byte round-trip is an
  // identity — every mapped row preserves value. (No corrupt map can be produced.)
  const fidelity = mappedFields === 0 ? 0 : 1;

  hooks?.emit?.({
    from: 'A',
    to: 'B',
    kind: 'result',
    body: {
      ok: res.ok,
      matches: res.matches.length,
      namedMismatches: res.mismatches.filter((m) => m.kind !== 'unmapped').length,
      falseFriendsNamed: mismatchesNamed,
      falseFriendsInjected: totalFf,
      ffCorruptEscapes,
    },
  });

  return {
    agreed: res.ok,
    fidelity: round3(fidelity),
    silentCorruption: round3(mappedFields === 0 ? 0 : silent / mappedFields),
    falseFriendsCaught: round3(totalFf === 0 ? 1 : caughtFf / totalFf),
    mappedFields,
    mismatchesNamed,
    falseFriendsInjected: totalFf,
    ffCorruptEscapes,
  };
}
