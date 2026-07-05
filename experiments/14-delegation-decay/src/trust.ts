/**
 * Part B engine — trust routing with a planted incapable delegate.
 *
 * Pool of 6 workers, all with plausible blurbs; `mercury` carries a
 * HARNESS-LEVEL handicap (reliably fails the `quota-policy` task class),
 * invisible to the root. The root runs R sequential rounds, choosing one
 * delegate per round. Three arms share seeds and the same environment draws:
 *
 *  1. amnesiac  — fresh context every round; chooses uniformly.
 *  2. incontext — carries a transcript truncated to the last WINDOW rounds.
 *  3. engram    — writes each observed outcome as a capability observation
 *     (`VersionedFact` via the REAL @openengram/reconciliation module, file:
 *     dep — never reimplemented) and queries the store before choosing.
 *
 * Failure styles (separate sub-arms): `loud` failures are visible before the
 * next round's decision; `confident-wrong` output only fails downstream —
 * detection lags one extra round and wastes integration tokens.
 *
 * Environment draws (capable-worker transient failures) are keyed by
 * (seed, style, trial, round, worker) — identical across arms, so arm
 * comparisons are exact controlled contrasts.
 */
import {
  makeVersionedFact,
  reconcile,
  verifyFact,
  type ReconcileOutcome,
  type VersionedFact,
} from '@openengram/reconciliation';
import { seeded, type Rand } from './rng.js';
import type { Arm, FailStyle, TrustTrialResult, WorkerProfile } from './types.js';

export const WORKERS: readonly WorkerProfile[] = [
  { id: 'atlas', blurb: 'Infra config specialist; strong on quota and rate policy work.' },
  { id: 'birch', blurb: 'Backend generalist; careful, verbose, reliable on config tasks.' },
  { id: 'cedar', blurb: 'Platform engineer; fast turnaround on policy and schema briefs.' },
  { id: 'mercury', blurb: 'Systems generalist; fast turnaround on config work of any class.' },
  { id: 'nimbus', blurb: 'SRE-flavored worker; conservative, checks its own output twice.' },
  { id: 'quill', blurb: 'Config-generation specialist; likes crisp machine-checkable briefs.' },
];

export const INCAPABLE = 'mercury';
export const TASK_CLASS = 'quota-policy';
export const ROUNDS = 30;
export const RESET_AFTER_ROUND = 15;
export const WINDOW = 10; // realistic in-context transcript truncation, in rounds

export const P_CAPABLE_TRANSIENT_FAIL = 0.05;
export const COST_BRIEF = 5;
export const COST_WORK = 10;
export const COST_INTEGRATION = 10; // paid integrating confident-wrong garbage before it fails downstream

const ASSERTIONS = ['quota_cap_set', 'burst_ratio_valid', 'policy_scope_bound', 'ttl_consistent'] as const;

interface Observation {
  round: number;
  worker: string;
  success: boolean;
  failedAssertion?: string;
  visibleAtRound: number;
}

/**
 * The Engram-backed capability store. Facts are written and reconciled through
 * the REAL shipped reconciliation module; the harness never reimplements any
 * of its logic. One fact per (agent, task class); each new observation
 * re-authors the fact at the origin with a bumped version and a cumulative
 * summary as content. Provenance (round, failed assertion) rides in the
 * content — this is the `verification_tier=provenance` path: the root
 * DIRECTLY MEASURED the outcome it is recording.
 */
export class CapabilityStore {
  #facts = new Map<string, VersionedFact>();
  readonly outcomes: Record<ReconcileOutcome, number> = {
    kept: 0,
    adopted: 0,
    healed: 0,
    rejected_corrupt: 0,
  };

  write(originId: string, obs: Observation): void {
    const factId = `cap:${obs.worker}:${TASK_CLASS}`;
    const held = this.#facts.get(factId) ?? null;
    const prev = held
      ? (JSON.parse(held.content) as { successes: number; failures: number })
      : { successes: 0, failures: 0 };
    const content = JSON.stringify({
      agent_id: obs.worker,
      task_class: TASK_CLASS,
      outcome: obs.success ? 'success' : 'failure',
      successes: prev.successes + (obs.success ? 1 : 0),
      failures: prev.failures + (obs.success ? 0 : 1),
      round: obs.round,
      failed_assertion: obs.failedAssertion ?? null,
      evidence_digest: `assert:${obs.failedAssertion ?? 'all-pass'}@r${obs.round}`,
      verification_tier: 'provenance',
    });
    const incoming = makeVersionedFact(factId, (held?.version ?? 0) + 1, originId, content);
    const { result, outcome } = reconcile(held, incoming);
    this.outcomes[outcome] += 1;
    if (result) this.#facts.set(factId, result);
  }

  /** Read a worker's verified capability summary; null if no verified fact. */
  read(worker: string): { successes: number; failures: number } | null {
    const fact = this.#facts.get(`cap:${worker}:${TASK_CLASS}`);
    if (!fact || !verifyFact(fact)) return null;
    const c = JSON.parse(fact.content) as { successes: number; failures: number };
    return { successes: c.successes, failures: c.failures };
  }

  factCount(): number {
    return this.#facts.size;
  }
}

function pickUniform(candidates: readonly string[], rand: Rand): string {
  const i = Math.floor(rand() * candidates.length);
  return candidates[i] ?? candidates[0] ?? INCAPABLE;
}

/** Shared exclusion rule: a worker with more observed failures than successes is avoided. */
function eligible(records: ReadonlyMap<string, { successes: number; failures: number }>): string[] {
  const ok = WORKERS.map((w) => w.id).filter((id) => {
    const r = records.get(id);
    return !r || r.failures <= r.successes;
  });
  return ok.length > 0 ? ok.map((id) => id) : WORKERS.map((w) => w.id);
}

export interface TrustEmit {
  choice(round: number, root: string, worker: string): void;
  outcome(round: number, worker: string, success: boolean, failedAssertion?: string): void;
  marker(topic: 'reset' | 'transfer', body: Record<string, unknown>): void;
}

export function runTrustTrial(
  arm: Arm,
  style: FailStyle,
  seedBase: string,
  emit?: TrustEmit,
): TrustTrialResult {
  const choiceRand = seeded(`${seedBase}:${arm}:choice`);
  const observations: Observation[] = [];
  const store = arm === 'engram' ? new CapabilityStore() : null;
  let transcript: Observation[] = []; // incontext arm's windowed memory
  let learnedUpTo = 0; // index into observations already written to store/transcript

  const selections: string[] = [];
  const incapableChosen: boolean[] = [];
  const wastedCum: number[] = [];
  let wasted = 0;
  let totalTokens = 0;

  const envFail = (round: number, worker: string): boolean =>
    seeded(`${seedBase}:env:r${round}:${worker}`)() < P_CAPABLE_TRANSIENT_FAIL;

  const learnVisible = (round: number): void => {
    // Everything that became visible by this decision point lands in the
    // root's memory surface (store write for engram, transcript for incontext).
    while (learnedUpTo < observations.length) {
      const obs = observations[learnedUpTo];
      if (!obs || obs.visibleAtRound > round) break;
      if (store) store.write('root', obs);
      transcript.push(obs);
      learnedUpTo += 1;
    }
  };

  const visibleRecords = (round: number): Map<string, { successes: number; failures: number }> => {
    const rec = new Map<string, { successes: number; failures: number }>();
    if (arm === 'incontext') {
      const windowStart = round - WINDOW;
      for (const obs of transcript) {
        if (obs.round <= windowStart) continue; // truncated out of the context window
        const r = rec.get(obs.worker) ?? { successes: 0, failures: 0 };
        if (obs.success) r.successes += 1;
        else r.failures += 1;
        rec.set(obs.worker, r);
      }
    } else if (arm === 'engram' && store) {
      for (const w of WORKERS) {
        const summary = store.read(w.id);
        if (summary) rec.set(w.id, summary);
      }
    }
    return rec;
  };

  const choose = (round: number): string => {
    if (arm === 'amnesiac') return pickUniform(WORKERS.map((w) => w.id), choiceRand);
    return pickUniform(eligible(visibleRecords(round)), choiceRand);
  };

  let postResetIncapable = false;

  for (let round = 1; round <= ROUNDS; round += 1) {
    if (round === RESET_AFTER_ROUND + 1) {
      // Kill + restart the root. In-context transcript dies with the session;
      // the Engram store is external and persists. Observations still in
      // flight (confident-wrong lag) land after restart regardless — the
      // downstream integration harness reports them, not the root's memory.
      if (arm === 'incontext') transcript = [];
      emit?.marker('reset', { round, arm, note: 'root killed and restarted' });
    }

    learnVisible(round);
    const chosen = choose(round);
    selections.push(chosen);
    const isIncapable = chosen === INCAPABLE;
    incapableChosen.push(isIncapable);
    if (round === RESET_AFTER_ROUND + 1) postResetIncapable = isIncapable;
    emit?.choice(round, 'root', chosen);

    // Execute: harness-level ground truth.
    const success = isIncapable ? false : !envFail(round, chosen);
    const failedAssertion = success
      ? undefined
      : ASSERTIONS[Math.floor(seeded(`${seedBase}:assert:r${round}`)() * ASSERTIONS.length)];
    // Loud failures (and all capable outcomes) are visible before the next
    // decision; confident-wrong garbage from the incapable agent only fails
    // downstream — one extra round of lag and wasted integration tokens.
    const confidentWrong = isIncapable && style === 'confident-wrong';
    const visibleAtRound = round + (confidentWrong ? 2 : 1);
    const cost = COST_BRIEF + COST_WORK + (confidentWrong ? COST_INTEGRATION : 0);
    totalTokens += cost;
    if (isIncapable) wasted += cost;
    wastedCum.push(wasted);
    const obs: Observation = {
      round,
      worker: chosen,
      success,
      visibleAtRound,
      ...(failedAssertion !== undefined ? { failedAssertion } : {}),
    };
    observations.push(obs);
    emit?.outcome(round, chosen, success, failedAssertion);
  }

  // --- transfer probe: a BRAND-NEW root (different id, fresh context) reads
  // the same store at round 30 and makes one delegation choice. Arms 1–2 have
  // nothing to read — their knowledge died with the session or never existed.
  learnVisible(ROUNDS + 2); // all in-flight observations have landed by now
  const transferRand = seeded(`${seedBase}:${arm}:transfer`);
  let transferChoice: string;
  let transferHadEvidence = false;
  if (arm === 'engram' && store) {
    const rec = new Map<string, { successes: number; failures: number }>();
    for (const w of WORKERS) {
      const summary = store.read(w.id);
      if (summary) rec.set(w.id, summary);
    }
    const inc = rec.get(INCAPABLE);
    transferHadEvidence = inc !== undefined && inc.failures > 0;
    transferChoice = pickUniform(eligible(rec), transferRand);
  } else {
    transferChoice = pickUniform(WORKERS.map((w) => w.id), transferRand);
  }
  emit?.marker('transfer', {
    newRoot: 'root-prime',
    arm,
    choice: transferChoice,
    hadEvidence: transferHadEvidence,
  });

  // Honesty stat: capable workers shut out for good by a transient failure.
  let capableExcluded = 0;
  const finalRecords = visibleRecords(ROUNDS + 2);
  for (const w of WORKERS) {
    if (w.id === INCAPABLE) continue;
    const r = finalRecords.get(w.id);
    if (r && r.failures > r.successes) capableExcluded += 1;
  }

  return {
    selections,
    incapableChosen,
    wastedCum,
    totalTokens,
    postResetIncapable,
    transferAvoided: transferChoice !== INCAPABLE,
    transferHadEvidence,
    ...(store ? { reconcileOutcomes: { ...store.outcomes } } : {}),
    capableExcluded,
  };
}
