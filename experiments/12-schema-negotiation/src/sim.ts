/**
 * The round-trip experiment. Given an (A, B) schema pair:
 *
 *   1. NEGOTIATE a field mapping with no referee (see negotiator.ts).
 *   2. ROUND-TRIP a batch of A records: A encodes each record onto the agreed wire, B
 *      DECODES it into B's local model using the mapping, then re-encodes and echoes it
 *      back, and A decodes the echo into A's model. Score field-by-field whether the value
 *      that returned to A equals the value A sent.
 *   3. BUCKET every agreed mapping row into the outcome grid:
 *        believedMatched = true (they agreed on it) AND
 *        trulyMatched    = (concepts actually identical)
 *      A row that was believed-matched but NOT truly-matched is a SILENT CORRUPTION: both
 *      agents are certain the field mapped, the bytes round-trip cleanly, and the MEANING is
 *      wrong. Nobody throws. That count over total agreed rows is the headline metric.
 *
 * Value corruption is realistic, not random: when a false friend maps `subtotal`(pre-tax)
 * onto `grandTotal`(post-tax), B reads a pre-tax number as a post-tax one — the bytes are a
 * valid int, so the round-trip "succeeds" while the number now means something else. We model
 * that by asking: after decode/re-encode, is the value A gets back the value A sent? For a
 * true match it is; for a units false friend (ms vs sec) it survives the byte round-trip but
 * is semantically wrong (silent); for a type false friend (string id vs int id) it can also
 * mangle the bytes (a caught-late corruption). The sim records all three.
 */
import type { Rand } from './rng.js';
import { negotiate, type NegotiationConfig } from './negotiator.js';
import { buildSchemaPair, sampleValue } from './schemas.js';
import type {
  Concept,
  FieldDef,
  FieldOutcome,
  MappingRow,
  NegotiationTurn,
  Record_,
  Schema,
  TrialConfig,
  TrialResult,
} from './types.js';

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Look up a field's concept by wire name in a schema. */
function conceptOf(schema: Schema, name: string): Concept | undefined {
  return schema.fields.find((f) => f.name === name)?.concept;
}

function fieldOf(schema: Schema, name: string): FieldDef | undefined {
  return schema.fields.find((f) => f.name === name);
}

/** Build one A record: every A field populated with a deterministic sample value. */
function makeRecord(a: Schema, rand: Rand): Record_ {
  const rec: { [k: string]: string | number } = {};
  for (const f of a.fields) rec[f.name] = sampleValue(f.concept, rand);
  return rec;
}

/**
 * Simulate the full A->B->A byte round-trip for a single field pairing and decide whether
 * the value that returns equals the value sent. The only way a value survives is if B's
 * decode/re-encode is an identity on that byte payload — which it is UNLESS the wire types
 * disagree in a way that forces a lossy coercion (e.g. B parses a string id as an int and
 * loses the non-numeric part). Units mismatches (ms vs sec) are byte-identical, so they
 * survive the round-trip yet are semantically wrong — the essence of silent corruption.
 */
function valueSurvivesRoundTrip(af: FieldDef, bf: FieldDef, value: string | number): boolean {
  // Same physical encoding: the payload is echoed back unchanged.
  if (af.wire === bf.wire) return true;
  // Cross-type coercion. B decodes A's bytes into B's type, then re-encodes for the echo.
  // int/float are lossless enough to survive both directions; string<->int is not.
  const af2b = coerce(value, bf.wire);
  const back = coerce(af2b, af.wire);
  return back === value;
}

function coerce(value: string | number, to: 'string' | 'int' | 'float' | 'enum'): string | number {
  switch (to) {
    case 'string':
    case 'enum':
      return String(value);
    case 'int': {
      const n = typeof value === 'number' ? value : Number.parseInt(value, 10);
      return Number.isFinite(n) ? Math.trunc(n) : 0;
    }
    case 'float': {
      const n = typeof value === 'number' ? value : Number.parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    }
    default:
      return value;
  }
}

export interface SimHooks {
  emit?: (turn: NegotiationTurn) => void;
}

/**
 * Run one full trial for the given config. Builds a fresh schema pair, negotiates, round-trips
 * a batch, and scores. `rand` seeds both schema partition and negotiation tie-breaks.
 */
export function runTrial(cfg: TrialConfig, rand: Rand, hooks?: SimHooks): TrialResult {
  const pair = buildSchemaPair(cfg.overlap, cfg.falseFriends, rand);
  const negCfg: NegotiationConfig = { acceptThreshold: 0.55, maxRounds: cfg.maxRounds };
  const agreement = negotiate(pair.a, pair.b, negCfg, rand, hooks?.emit);

  const outcomes = scoreMapping(pair.a, pair.b, agreement.mapping, cfg, rand);

  const mappedFields = outcomes.length;
  const preserved = outcomes.filter((o) => o.valuePreserved).length;
  const silent = outcomes.filter((o) => o.believedMatched && !o.trulyMatched).length;

  // How many injected false friends were correctly NOT mapped as a true match (caught).
  const ffNames = new Set(pair.falseFriendNames);
  const mappedFf = new Set<string>();
  for (const o of outcomes) {
    if (ffNames.has(o.aName) && ffNames.has(o.bName) && o.believedMatched) mappedFf.add(o.aName);
  }
  const totalFf = pair.falseFriendNames.length;
  const caughtFf = totalFf - mappedFf.size;

  return {
    agreed: agreement.agreed,
    rounds: agreement.rounds,
    fidelity: round3(mappedFields === 0 ? 0 : preserved / mappedFields),
    silentCorruption: round3(mappedFields === 0 ? 0 : silent / mappedFields),
    falseFriendsCaught: round3(totalFf === 0 ? 1 : caughtFf / totalFf),
    mappedFields,
  };
}

/**
 * Score every agreed mapping row by round-tripping a batch of records through it, then
 * comparing the value A gets back against the value A sent. `believedMatched` is always true
 * for an agreed row; `trulyMatched` consults the (hidden) concepts as ground truth.
 */
export function scoreMapping(
  a: Schema,
  b: Schema,
  mapping: readonly MappingRow[],
  cfg: TrialConfig,
  rand: Rand,
): FieldOutcome[] {
  const batch: Record_[] = [];
  for (let i = 0; i < cfg.batchSize; i += 1) batch.push(makeRecord(a, rand));

  const outcomes: FieldOutcome[] = [];
  for (const row of mapping) {
    const af = fieldOf(a, row.aName);
    const bf = fieldOf(b, row.bName);
    if (!af || !bf) continue;

    const aConcept = conceptOf(a, row.aName);
    const bConcept = conceptOf(b, row.bName);
    const trulyMatched = aConcept !== undefined && aConcept === bConcept;

    // Value fidelity across the whole batch: a row is "preserved" only if EVERY record's
    // value survived the byte round-trip. (One coercion loss taints the field.)
    let allPreserved = true;
    for (const rec of batch) {
      const v = rec[row.aName];
      if (v === undefined) continue;
      if (!valueSurvivesRoundTrip(af, bf, v)) {
        allPreserved = false;
        break;
      }
    }

    outcomes.push({
      aName: row.aName,
      bName: row.bName,
      basis: row.basis,
      believedMatched: true,
      trulyMatched,
      valuePreserved: allPreserved,
    });
  }
  return outcomes;
}
