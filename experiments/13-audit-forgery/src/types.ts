/** Shared contracts for the audit-forgery (Sonder signed-event-bus tampering) experiment. */

/** One record on the signed causal event bus (a Sonder audit-trail event). */
export interface AuditEvent {
  /** Content-addressed id: H(author ∥ seq ∥ prev ∥ h). Uniquely names this record. */
  id: number;
  /** Author key id (index into the honest key set). */
  author: number;
  /** Global monotone sequence number assigned at append time. */
  seq: number;
  /** Logical timestamp; advances by a positive delta each append. */
  ts: number;
  /** Opaque payload (a small integer here; the content the event asserts). */
  payload: number;
  /** Content hash H(payload). Binds the payload to the record. */
  h: number;
  /** Id of the immediately preceding event (-1 for genesis). The hash-chain link. */
  prev: number;
  /** Signature over (id ∥ h ∥ prev ∥ seq ∥ ts) with the author's key. Forgeable only with the key. */
  sig: number;
}

/** The five adversarial moves against the trail. */
export type Attack = 'insert' | 'drop' | 'reorder' | 'backdate' | 'tamper-payload';

/** The four independent verifier invariants. A verifier enforces a subset of these. */
export type Invariant = 'SIG' | 'HASH' | 'CHAIN' | 'SEQ';

/** A verifier is a named subset of invariants. */
export interface Verifier {
  name: string;
  checks: ReadonlySet<Invariant>;
}

export interface TrialConfig {
  /** Number of honest signing authors. */
  authorCount: number;
  /** Length of the honest trail before the attack. */
  eventCount: number;
  /** Which forgery the adversary applies. */
  attack: Attack;
  /** If true, the adversary re-stitches every structural field it can (prev/hash). */
  stitch: boolean;
  /** If true the adversary holds a valid signing key (insider); it can re-sign edits. */
  keyCompromised: boolean;
}

/** The verifier's ruling on a (possibly forged) trail. */
export interface Verdict {
  /** True = verifier saw nothing wrong. On a forged trail this is a FALSE-CLEAN. */
  clean: boolean;
  /** The invariant that first fired, or 'none' if clean. */
  reason: Invariant | 'none';
}

/** One honest append on the exhibition trial (bus-visible). */
export interface AppendStep {
  seq: number;
  author: number;
  h: number;
  prev: number;
  ts: number;
}

/** The adversary's move on the exhibition trial (bus-visible). */
export interface AttackStep {
  attack: Attack;
  stitch: boolean;
  keyCompromised: boolean;
  /** The seq of the event the attack targeted. */
  targetSeq: number;
}

/** One verifier ruling on the exhibition trial (bus-visible). */
export interface VerdictStep {
  verifier: string;
  attack: Attack;
  clean: boolean;
  reason: Invariant | 'none';
}

export type EmitAppend = (step: AppendStep) => void;
export type EmitAttack = (step: AttackStep) => void;
export type EmitVerdict = (step: VerdictStep) => void;
