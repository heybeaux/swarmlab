/**
 * Forgiving capability store — exp-14's Engram-backed store, extended on the
 * WRITE payload only (round-stamped history + probation-state facts) so the
 * new READ-side eligibility policies (time-decay, probation) have the evidence
 * they need. Every write still goes through the REAL shipped
 * `@openengram/reconciliation` module (`file:` dep — never reimplemented):
 * `makeVersionedFact` → `reconcile` → `verifyFact`. The reconciliation
 * substrate is untouched; the fact CONTENT is lab payload, exactly as in
 * exp-14.
 *
 * Fact shapes:
 *  - `cap:{worker}:{task_class}` — cumulative successes/failures plus a
 *    round-stamped history array, provenance tier (root directly measured).
 *  - `probation:{worker}:{task_class}` — probation state machine (status,
 *    enteredRound, nextProbeRound, interval, probes, entries). Probation
 *    state lives in the store, NOT in the root, so it survives root restarts.
 */
import {
  makeVersionedFact,
  reconcile,
  verifyFact,
  type ReconcileOutcome,
  type VersionedFact,
} from '@openengram/reconciliation';
import { TASK_CLASS } from '@swarmlab/experiment-14-delegation-decay/dist/trust.js';

export interface HistoryEntry {
  /** round the observation was made */
  r: number;
  /** success? */
  s: boolean;
}

export interface CapSummary {
  successes: number;
  failures: number;
  history: HistoryEntry[];
}

export interface ProbationState {
  status: 'probation' | 'active';
  enteredRound: number;
  nextProbeRound: number;
  interval: number;
  probes: number;
  /** how many separate times this worker has entered probation */
  entries: number;
}

export interface StoreObservation {
  round: number;
  worker: string;
  success: boolean;
  failedAssertion?: string;
}

export class ForgivingStore {
  #facts = new Map<string, VersionedFact>();
  readonly outcomes: Record<ReconcileOutcome, number> = {
    kept: 0,
    adopted: 0,
    healed: 0,
    rejected_corrupt: 0,
  };

  #put(factId: string, originId: string, content: string): void {
    const held = this.#facts.get(factId) ?? null;
    const incoming = makeVersionedFact(factId, (held?.version ?? 0) + 1, originId, content);
    const { result, outcome } = reconcile(held, incoming);
    this.outcomes[outcome] += 1;
    if (result) this.#facts.set(factId, result);
  }

  #get(factId: string): unknown | null {
    const fact = this.#facts.get(factId);
    if (!fact || !verifyFact(fact)) return null;
    return JSON.parse(fact.content) as unknown;
  }

  writeObservation(originId: string, obs: StoreObservation): void {
    const prev = this.readCap(obs.worker) ?? { successes: 0, failures: 0, history: [] };
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
      history: [...prev.history, { r: obs.round, s: obs.success }],
    });
    this.#put(`cap:${obs.worker}:${TASK_CLASS}`, originId, content);
  }

  readCap(worker: string): CapSummary | null {
    const c = this.#get(`cap:${worker}:${TASK_CLASS}`) as
      | { successes: number; failures: number; history?: HistoryEntry[] }
      | null;
    if (!c) return null;
    return { successes: c.successes, failures: c.failures, history: c.history ?? [] };
  }

  writeProbation(originId: string, worker: string, state: ProbationState): void {
    const content = JSON.stringify({
      agent_id: worker,
      task_class: TASK_CLASS,
      verification_tier: 'provenance',
      ...state,
    });
    this.#put(`probation:${worker}:${TASK_CLASS}`, originId, content);
  }

  readProbation(worker: string): ProbationState | null {
    const c = this.#get(`probation:${worker}:${TASK_CLASS}`) as (ProbationState & object) | null;
    if (!c) return null;
    return {
      status: c.status,
      enteredRound: c.enteredRound,
      nextProbeRound: c.nextProbeRound,
      interval: c.interval,
      probes: c.probes,
      entries: c.entries,
    };
  }

  /** Canonical snapshot of all probation facts (for the reset-continuity check). */
  snapshotProbation(workers: readonly string[]): string {
    return JSON.stringify(workers.map((w) => [w, this.readProbation(w)]));
  }

  factCount(): number {
    return this.#facts.size;
  }
}
