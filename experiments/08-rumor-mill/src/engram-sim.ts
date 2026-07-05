/**
 * Engram mode (Spec 16 B1) — the same gossip engine as `sim.ts`, but adoption is
 * decided by the REAL shipped Engram reconciliation module instead of
 * first-write-wins. Nothing about reconcile/anti-entropy is reimplemented here:
 * we import `@openengram/reconciliation` (a `file:` dep on the built output of
 * `~/projects/engram/src/reconciliation`) and exercise its `makeVersionedFact`,
 * `verifyFact`, `reconcile`, and `antiEntropySync` directly.
 *
 * The honest model of drift (spec B1): the seed AUTHORS the fact as a
 * `VersionedFact` (content = the truth token string, digest bound at origin).
 * A per-hop retelling corrupts `content` WITHOUT recomputing the digest — a
 * retelling, not a new authorship — so any drifted copy fails `verifyFact`. Each
 * receiving node runs `reconcile(held, incoming)`; every gossip round is followed
 * by ONE anti-entropy pass over each live edge (pairwise `antiEntropySync`), the
 * mechanism that shortens the effective path from every node to a verified copy.
 *
 * The RNG stream is kept BYTE-IDENTICAL to the baseline through graph build, seed
 * selection, neighbor picking, and per-token drift, so the only measured
 * differences are (a) reconcile replacing first-write-wins and (b) the added
 * anti-entropy repair — not a different random walk.
 */
import {
  makeVersionedFact,
  reconcile,
  antiEntropySync,
  type VersionedFact,
} from '@openengram/reconciliation';
import type { Rand } from './rng.js';
import { buildGraph, hopDistances } from './graph.js';
import { round3 } from './sim.js';
import type { EmitGossip, EmitSnapshot, TrialConfig, TrialResult } from './types.js';

const TRUTH_SYMBOL = 0;
const FACT_ID = 'rumor';
const ORIGIN = 'seed';
/** Printable base for encoding a token (0..alphabet-1) as a single content char. */
const TOKEN_BASE = 65; // 'A'

/** Encode a token vector as a fixed-width content string (one char per token). */
function encode(version: readonly number[]): string {
  let s = '';
  for (const t of version) s += String.fromCharCode(TOKEN_BASE + t);
  return s;
}

/** Decode a content string back to a token vector. */
function decode(content: string): number[] {
  const out = new Array<number>(content.length);
  for (let i = 0; i < content.length; i += 1) out[i] = content.charCodeAt(i) - TOKEN_BASE;
  return out;
}

/** Fraction of tokens still matching ground truth (all-zeros). */
function fidelity(version: readonly number[]): number {
  if (version.length === 0) return 1;
  let matches = 0;
  for (const tok of version) if (tok === TRUTH_SYMBOL) matches += 1;
  return matches / version.length;
}

function fidelityOf(fact: VersionedFact | null): number {
  return fact === null ? 0 : fidelity(decode(fact.content));
}

/**
 * Re-encode one retelling: each token drifts to a wrong symbol w.p. mutationRate.
 * IDENTICAL draw order to the baseline `retell` so the corruption pattern matches;
 * the difference is only that we return a corrupted *VersionedFact* (content
 * mutated, digest carried over from the origin fact — so a drifted copy no longer
 * verifies), not a bare token vector.
 */
function retellFact(
  held: VersionedFact,
  cfg: TrialConfig,
  rand: Rand,
): VersionedFact {
  const version = decode(held.content);
  const out = new Array<number>(version.length);
  for (let i = 0; i < version.length; i += 1) {
    const tok = version[i] ?? TRUTH_SYMBOL;
    if (rand() < cfg.mutationRate) {
      out[i] = 1 + Math.floor(rand() * Math.max(1, cfg.alphabet - 1));
    } else {
      out[i] = tok;
    }
  }
  // A retelling: content changes, digest is NOT recomputed (relays never
  // re-author). If any token drifted, verifyFact(this) === false.
  return { ...held, content: encode(out) };
}

function pickNeighbors(neighbors: readonly number[], fanout: number, rand: Rand): number[] {
  if (neighbors.length <= fanout) return [...neighbors];
  const pool = [...neighbors];
  const picked: number[] = [];
  for (let f = 0; f < fanout; f += 1) {
    const j = f + Math.floor(rand() * (pool.length - f));
    const a = pool[f];
    const b = pool[j];
    if (a !== undefined && b !== undefined) {
      pool[f] = b;
      pool[j] = a;
    }
    const chosen = pool[f];
    if (chosen !== undefined) picked.push(chosen);
  }
  return picked;
}

/**
 * Run one engram-mode trial. Same graph, seed, and per-hop drift draws as the
 * baseline; adoption via the real `reconcile`, plus one `antiEntropySync` pass
 * per live edge after each gossip round.
 */
export function runEngramTrial(
  cfg: TrialConfig,
  rand: Rand,
  emit?: EmitGossip,
  emitSnap?: EmitSnapshot,
): TrialResult {
  const graph = buildGraph(cfg.size, cfg.degree, cfg.rewire, rand);
  const seed = Math.floor(rand() * cfg.size);
  const dist = hopDistances(graph, seed);

  const truth: number[] = new Array<number>(cfg.tokenCount).fill(TRUTH_SYMBOL);
  const held: (VersionedFact | null)[] = new Array<VersionedFact | null>(cfg.size).fill(null);
  // The seed AUTHORS the fact at the origin: digest is bound to the truth content.
  held[seed] = makeVersionedFact(FACT_ID, 1, ORIGIN, encode(truth));

  let informed = 1;
  let saturated = false;
  let timeToSaturation = cfg.maxRounds;
  const satCount = Math.ceil(cfg.saturationThreshold * cfg.size);

  let healedNodes = 0;
  let rejectedCorrupt = 0;

  const coverageNow = (): number => informed / cfg.size;
  const meanFidelityNow = (): number => {
    let sum = 0;
    let n = 0;
    for (const v of held) {
      if (v) {
        sum += fidelityOf(v);
        n += 1;
      }
    }
    return n === 0 ? 0 : sum / n;
  };

  for (let round = 0; round < cfg.maxRounds; round += 1) {
    // Snapshot the informed set at round start (retellings within a round don't cascade).
    const senders: number[] = [];
    for (let i = 0; i < cfg.size; i += 1) if (held[i]) senders.push(i);

    // --- gossip step: each informed node retells; receivers reconcile ---
    for (const from of senders) {
      const version = held[from];
      if (!version) continue;
      const targets = pickNeighbors(graph.neighbors[from] ?? [], cfg.fanout, rand);
      for (const to of targets) {
        const wire = retellFact(version, cfg, rand);
        const wasInformed = held[to] !== null;
        const r = reconcile(held[to] ?? null, wire);
        if (r.outcome === 'healed') healedNodes += 1;
        if (r.outcome === 'rejected_corrupt' && wasInformed) rejectedCorrupt += 1;
        // Apply the reconciled result (null only when nothing held + corrupt arrival).
        if (r.result !== null) held[to] = r.result;
        const nowInformed = held[to] !== null;
        if (!wasInformed && nowInformed) informed += 1;
        emit?.({
          round,
          from,
          to,
          adopted: !wasInformed && nowInformed,
          fidelity: round3(fidelityOf(held[to] ?? null)),
        });
      }
    }

    // --- anti-entropy pass: one pairwise sync over every live edge ---
    // Undirected edges once (a<b). Each side offers its held fact; both reconcile
    // via the shipped antiEntropySync. This shortens the effective path to a
    // verified copy without throttling spread (spec: repair, not damping). A
    // verified copy can only heal a corrupt neighbor one hop per pass, so repair
    // must keep running until the mesh converges — see the post-loop condition.
    let healsThisRound = 0;
    for (let a = 0; a < cfg.size; a += 1) {
      for (const b of graph.neighbors[a] ?? []) {
        if (b <= a) continue;
        const fa = held[a];
        const fb = held[b];
        if (fa === null && fb === null) continue;
        const mapA = new Map<string, VersionedFact>();
        const mapB = new Map<string, VersionedFact>();
        if (fa) mapA.set(FACT_ID, fa);
        if (fb) mapB.set(FACT_ID, fb);
        const res = antiEntropySync(mapA, mapB);
        healedNodes += res.aHealed + res.bHealed;
        healsThisRound += res.aHealed + res.bHealed;
        // Write back reconciled copies; count newly-informed nodes (a side that
        // was empty and adopted from its neighbor during the exchange).
        const na = mapA.get(FACT_ID) ?? null;
        const nb = mapB.get(FACT_ID) ?? null;
        if (na !== null && held[a] === null) informed += 1;
        if (nb !== null && held[b] === null) informed += 1;
        held[a] = na;
        held[b] = nb;
      }
    }

    emitSnap?.({
      round,
      coverage: round3(coverageNow()),
      meanFidelity: round3(meanFidelityNow()),
    });

    if (!saturated && informed >= satCount) {
      saturated = true;
      timeToSaturation = round;
    }
    // Terminate only once coverage is complete AND anti-entropy has converged
    // (a full pass produced no heal). Full coverage alone must NOT stop the run:
    // corrupt copies in a noisy region are healed one hop per anti-entropy pass,
    // so cutting off at coverage would freeze residual corruption. This continued
    // repair is spread-neutral — it never lowers coverage or delays saturation
    // (timeToSaturation is already latched above) — it only lets the verified
    // copy finish diffusing to every node.
    if (informed >= cfg.size && healsThisRound === 0) break;
  }

  const fidelityAtSaturation = round3(meanFidelityNow());

  let nearSum = 0;
  let nearN = 0;
  let farSum = 0;
  let farN = 0;
  for (let i = 0; i < cfg.size; i += 1) {
    const v = held[i];
    if (!v) continue;
    const f = fidelityOf(v);
    if ((dist[i] ?? Number.POSITIVE_INFINITY) <= 2) {
      nearSum += f;
      nearN += 1;
    } else {
      farSum += f;
      farN += 1;
    }
  }

  return {
    saturated,
    timeToSaturation,
    finalCoverage: round3(coverageNow()),
    fidelityAtSaturation,
    fidelityNearHop: round3(nearN === 0 ? 0 : nearSum / nearN),
    fidelityFarHop: round3(farN === 0 ? 0 : farSum / farN),
    coverageByRound: [],
    healedNodes,
    rejectedCorrupt,
  };
}
