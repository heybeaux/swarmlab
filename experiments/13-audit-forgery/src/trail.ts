/**
 * The Sonder audit trail: a signed, causally-chained, append-only event log — and the
 * machinery to forge it and to verify it.
 *
 * An honest trail is a list of `AuditEvent`s where every event carries a content hash,
 * a prev-link to its predecessor (a hash chain), a strictly-increasing seq, a
 * non-decreasing ts, and a signature binding the whole record to the author's key. A
 * *verifier* enforces a subset of four independent invariants (SIG, HASH, CHAIN, SEQ);
 * an *attack* mutates the trail; the question is which invariant subset catches which
 * attack, and when a compromised key blinds the SIG check, whether the structural
 * invariants still bite.
 */
import type { Rand } from './rng.js';
import { fnv1a } from './rng.js';
import type {
  AuditEvent,
  Invariant,
  TrialConfig,
  Verdict,
  Verifier,
} from './types.js';

/** A per-author secret: signatures are H(secret ∥ bound-tuple). Un-forgeable without the secret. */
function keySecret(author: number): number {
  return fnv1a(`sonder-key-#${author}`);
}

/** Content hash of a payload. */
function hashPayload(payload: number): number {
  return fnv1a(`payload:${payload}`);
}

/** The bound tuple a signature commits to. Changing any field invalidates the signature. */
function bind(ev: Pick<AuditEvent, 'id' | 'h' | 'prev' | 'seq' | 'ts'>): string {
  return `${ev.id}|${ev.h}|${ev.prev}|${ev.seq}|${ev.ts}`;
}

/** Sign the bound tuple with the author's secret. */
function sign(ev: Pick<AuditEvent, 'id' | 'h' | 'prev' | 'seq' | 'ts'>, author: number): number {
  return fnv1a(`${keySecret(author)}::${bind(ev)}`);
}

/** Content-address an event id from its structural fields (author, seq, prev, h). */
function makeId(author: number, seq: number, prev: number, h: number): number {
  return fnv1a(`id:${author}:${seq}:${prev}:${h}`);
}

/** Verify a signature against the author's key (the honest verifier's SIG check). */
export function verifySig(ev: AuditEvent): boolean {
  return ev.sig === sign(ev, ev.author);
}

/**
 * Build a clean, fully-valid honest trail: authors round-robin (with seeded jitter) to
 * append events, each linked to the previous by prev, each with a monotone seq and a
 * strictly-increasing ts, each signed by its author.
 */
export function buildHonestTrail(cfg: TrialConfig, rand: Rand): AuditEvent[] {
  const trail: AuditEvent[] = [];
  let ts = 1000;
  let prev = -1;
  for (let seq = 0; seq < cfg.eventCount; seq += 1) {
    // Round-robin author with occasional seeded jitter so authorship isn't perfectly regular.
    const base = seq % cfg.authorCount;
    const author = rand() < 0.25 ? Math.floor(rand() * cfg.authorCount) : base;
    const payload = seq * 7 + Math.floor(rand() * 5);
    const h = hashPayload(payload);
    const id = makeId(author, seq, prev, h);
    ts += 1 + Math.floor(rand() * 4);
    const sig = sign({ id, h, prev, seq, ts }, author);
    trail.push({ id, author, seq, ts, payload, h, prev, sig });
    prev = id;
  }
  return trail;
}

/** Deep-copy a trail so an attack never mutates the honest original. */
function cloneTrail(trail: readonly AuditEvent[]): AuditEvent[] {
  return trail.map((e) => ({ ...e }));
}

/**
 * Re-sign an event as the adversary. With a compromised key the signature is valid; without
 * one the adversary produces a bogus signature that will not verify (modelled as a hash of
 * a forged-key marker), so the SIG check catches it.
 */
function adversarySign(
  ev: Pick<AuditEvent, 'id' | 'h' | 'prev' | 'seq' | 'ts'>,
  author: number,
  keyCompromised: boolean,
): number {
  if (keyCompromised) return sign(ev, author);
  return fnv1a(`FORGED::${bind(ev)}`); // no access to keySecret(author) → invalid sig
}

/**
 * Apply one attack to a copy of the honest trail. `stitch` controls sophistication: a
 * naive attacker leaves structural breakage (broken prev-links / stale hashes); a
 * sophisticated one repairs every field it *can*, but can only produce a valid signature
 * when the key is compromised. Returns the forged trail and the targeted seq.
 */
export function applyAttack(
  honest: readonly AuditEvent[],
  cfg: TrialConfig,
  rand: Rand,
): { forged: AuditEvent[]; targetSeq: number } {
  const trail = cloneTrail(honest);
  const n = trail.length;
  // Choose an interior target (avoid genesis so prev-relations are always exercised).
  const idx = 1 + Math.floor(rand() * Math.max(1, n - 2));
  const target = trail[idx];
  if (!target) return { forged: trail, targetSeq: -1 };
  const targetSeq = target.seq;

  switch (cfg.attack) {
    case 'insert': {
      const before = trail[idx - 1];
      const prevId = before ? before.id : -1;
      const seq = before ? before.seq : 0; // duplicate/blur seq — a real interior splice
      const payload = 999_000 + Math.floor(rand() * 1000);
      const h = hashPayload(payload);
      const author = Math.floor(rand() * cfg.authorCount);
      const ts = before ? before.ts : 1000; // sits between neighbours (not strictly increasing)
      const id = makeId(author, seq, prevId, h);
      const sig = adversarySign({ id, h, prev: prevId, seq, ts }, author, cfg.keyCompromised);
      const fabricated: AuditEvent = { id, author, seq, ts, payload, h, prev: prevId, sig };
      trail.splice(idx, 0, fabricated);
      if (cfg.stitch) {
        // Re-point the following event's prev to the fabricated event so the chain "links".
        const after = trail[idx + 1];
        if (after) {
          after.prev = id;
          const reid = makeId(after.author, after.seq, after.prev, after.h);
          after.id = reid;
          after.sig = adversarySign(after, after.author, cfg.keyCompromised);
        }
      }
      return { forged: trail, targetSeq };
    }
    case 'drop': {
      const removed = trail.splice(idx, 1)[0];
      if (cfg.stitch && removed) {
        // Re-stitch: the event after the hole now points to the event before the hole.
        const after = trail[idx];
        const before = trail[idx - 1];
        if (after && before) {
          after.prev = before.id;
          const reid = makeId(after.author, after.seq, after.prev, after.h);
          after.id = reid;
          after.sig = adversarySign(after, after.author, cfg.keyCompromised);
        }
      }
      return { forged: trail, targetSeq };
    }
    case 'reorder': {
      const a = trail[idx];
      const b = trail[idx - 1];
      if (a && b) {
        trail[idx] = b;
        trail[idx - 1] = a;
        if (cfg.stitch) {
          // Repair prev-links to match the new order (but seq now runs backwards here).
          const before = trail[idx - 2];
          const first = trail[idx - 1];
          const second = trail[idx];
          if (first) {
            first.prev = before ? before.id : -1;
            first.id = makeId(first.author, first.seq, first.prev, first.h);
            first.sig = adversarySign(first, first.author, cfg.keyCompromised);
          }
          if (first && second) {
            second.prev = first.id;
            second.id = makeId(second.author, second.seq, second.prev, second.h);
            second.sig = adversarySign(second, second.author, cfg.keyCompromised);
          }
        }
      }
      return { forged: trail, targetSeq };
    }
    case 'backdate': {
      const before = trail[idx - 1];
      // Push ts to sit strictly before the predecessor — the event looks older than it is.
      target.ts = (before ? before.ts : 1000) - 1;
      if (cfg.stitch) {
        // Re-sign so the tampered ts is bound (only valid with a compromised key).
        target.id = makeId(target.author, target.seq, target.prev, target.h);
        target.sig = adversarySign(target, target.author, cfg.keyCompromised);
      }
      return { forged: trail, targetSeq };
    }
    case 'tamper-payload': {
      target.payload += 500 + Math.floor(rand() * 500);
      if (cfg.stitch) {
        // Sophisticated: update the hash to match the new payload (and re-sign if possible).
        target.h = hashPayload(target.payload);
        target.id = makeId(target.author, target.seq, target.prev, target.h);
        target.sig = adversarySign(target, target.author, cfg.keyCompromised);
      }
      return { forged: trail, targetSeq };
    }
    default:
      return { forged: trail, targetSeq };
  }
}

// --- verifier invariants -----------------------------------------------------

/** SIG: every event's signature verifies against its author's key. */
function checkSig(trail: readonly AuditEvent[]): boolean {
  return trail.every((e) => verifySig(e));
}

/** HASH: every event's stored h equals H(payload). */
function checkHash(trail: readonly AuditEvent[]): boolean {
  return trail.every((e) => e.h === hashPayload(e.payload));
}

/**
 * CHAIN: prev-links form an unbroken causal chain. Exactly one genesis (prev=-1) at the
 * head; every other event's prev must equal the id of the immediately preceding event
 * (a strict hash chain — any splice/drop/reorder that isn't perfectly re-stitched breaks it).
 */
function checkChain(trail: readonly AuditEvent[]): boolean {
  if (trail.length === 0) return true;
  const head = trail[0];
  if (!head || head.prev !== -1) return false;
  for (let i = 1; i < trail.length; i += 1) {
    const cur = trail[i];
    const prior = trail[i - 1];
    if (!cur || !prior) return false;
    if (cur.prev !== prior.id) return false; // dangling / mis-stitched link
    if (cur.prev === -1) return false; // a second genesis in the interior
  }
  return true;
}

/** SEQ: seq strictly increasing AND ts non-decreasing across trail order. */
function checkSeq(trail: readonly AuditEvent[]): boolean {
  for (let i = 1; i < trail.length; i += 1) {
    const cur = trail[i];
    const prior = trail[i - 1];
    if (!cur || !prior) return false;
    if (cur.seq <= prior.seq) return false;
    if (cur.ts < prior.ts) return false;
  }
  return true;
}

const CHECKERS: Record<Invariant, (t: readonly AuditEvent[]) => boolean> = {
  SIG: checkSig,
  HASH: checkHash,
  CHAIN: checkChain,
  SEQ: checkSeq,
};

/** Run a verifier: it is clean iff every enforced invariant holds. Report the first to fail. */
export function verify(trail: readonly AuditEvent[], verifier: Verifier): Verdict {
  // Deterministic invariant order so `reason` is stable across replays.
  const order: readonly Invariant[] = ['SIG', 'HASH', 'CHAIN', 'SEQ'];
  for (const inv of order) {
    if (!verifier.checks.has(inv)) continue;
    if (!CHECKERS[inv](trail)) return { clean: false, reason: inv };
  }
  return { clean: true, reason: 'none' };
}
