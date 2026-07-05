/**
 * exp-15 trial engine — trust routing with forgiving eligibility policies.
 *
 * Inherits exp-14 Part B wholesale (same pool, same planted incapable
 * `mercury`, same loud/confident-wrong visibility semantics, same
 * `P_CAPABLE_TRANSIENT_FAIL` environment draw keyed by (seed, round, worker) —
 * so environment outcomes are identical cell-for-cell with exp-14 and across
 * arms here). The control arm is NOT re-implemented: main.ts calls exp-14's
 * `runTrustTrial('engram', …)` directly, which guarantees the RT-05 baseline
 * reproduces bit-for-bit. This engine implements only the two NEW read-side
 * policies over the same Engram-backed store:
 *
 *  - decay: failures older than DECAY_WINDOW rounds stop counting toward the
 *    `failures <= successes` exclusion rule. Recovers workers by FORGETTING.
 *  - probation: crossing the threshold (failures > successes, exp-14's exact
 *    crossing) moves a worker into probation — excluded from the normal pool
 *    but re-probed on an exponential-backoff schedule (PROBE_BASE, ×2 after
 *    each probe). A worker exits probation only when its cumulative record
 *    re-balances (failures <= successes), i.e. by EVIDENCE. Probation state
 *    is stored as facts, so it survives root restarts.
 */
import {
  COST_BRIEF,
  COST_INTEGRATION,
  COST_WORK,
  INCAPABLE,
  P_CAPABLE_TRANSIENT_FAIL,
  RESET_AFTER_ROUND,
  ROUNDS,
  WORKERS,
  type TrustEmit,
} from '@swarmlab/experiment-14-delegation-decay/dist/trust.js';
import { seeded, type Rand } from '@swarmlab/experiment-14-delegation-decay/dist/rng.js';
import type { FailStyle, TrustTrialResult } from '@swarmlab/experiment-14-delegation-decay/dist/types.js';
import { ForgivingStore, type ProbationState } from './store.js';

export type ForgArm = 'unforgiving' | 'decay' | 'probation' | 'evidence';

export const DECAY_WINDOW = 10; // rounds; mirrors exp-14's in-context window for comparability
// Probe cadence is the design parameter under test; env-overridable so the
// cadence sensitivity runs are pinned separately. Defaults are the RECOMMENDED
// config found by the sweep: front-loaded probes (first probe +2 rounds,
// interval ×2 after each) so conclusive evidence is gathered early — slower
// cadences (base 4) push mercury's 2nd/3rd probes into the late measurement
// window and the evidence cap never binds within a 30-round horizon.
export const PROBE_BASE = Number(process.env.FORGIVE_PROBE_BASE ?? 2);
export const PROBE_BACKOFF = Number(process.env.FORGIVE_PROBE_BACKOFF ?? 2);
// Arm 4 (evidence): probing stops once a worker's failure margin
// (failures - successes) is conclusive — provenance-tier failures pile up only
// on the genuinely incapable. At P_CAPABLE_TRANSIENT_FAIL=0.05 a capable
// worker essentially never reaches net margin 4; mercury reaches it after 4
// observed failures with certainty. Window-independent by construction.
export const EVIDENCE_MARGIN = Number(process.env.FORGIVE_EVIDENCE_MARGIN ?? 3);

/** Same literal as exp-14 trust.ts (not exported there); feeds fact content only. */
const ASSERTIONS = ['quota_cap_set', 'burst_ratio_valid', 'policy_scope_bound', 'ttl_consistent'] as const;

const WORKER_IDS: readonly string[] = WORKERS.map((w) => w.id);

interface Observation {
  round: number;
  worker: string;
  success: boolean;
  failedAssertion?: string;
  visibleAtRound: number;
}

export interface ForgivenessExtras {
  /** capable-worker readmissions (bench → back in pool) */
  capableRecoveries: number;
  /** rounds from bench to readmission, capable workers only */
  recoveryLatencies: number[];
  /** times the incapable agent re-entered the NORMAL pool after exclusion */
  incapableLeaks: number;
  /** distinct capable workers that were ever benched */
  capableBenchedEver: number;
  /** probation probes issued (probation arm) */
  probeCount: number;
  probeTokens: number;
  /** tokens on probes that FAILED (pure forgiveness overhead) */
  probeTokensWasted: number;
  /** probes that landed in rounds 25–30 AND hit the incapable agent */
  lateIncapableProbes: number;
  /** post-reset (round 16) incapable selection was a SCHEDULED PROBE, not a pool pick */
  postResetIncapableWasProbe: boolean;
  /** was any worker mid-probation when the root was killed (after r15)? */
  midProbationAtReset: boolean;
  /** store snapshot identical across the restart + schedule honored afterwards */
  postResetContinuityOk: boolean;
  /** transfer probe: did the new root's eligible pool include the incapable agent? */
  transferPoolHadIncapable: boolean;
  /** transfer probe: did the new root blanket-readmit anyone still in probation? */
  transferReadmittedProbation: boolean;
}

export type ForgTrialResult = TrustTrialResult & { extras: ForgivenessExtras };

function pickUniform(candidates: readonly string[], rand: Rand): string {
  const i = Math.floor(rand() * candidates.length);
  return candidates[i] ?? candidates[0] ?? INCAPABLE;
}

export function runForgivingTrial(
  arm: 'decay' | 'probation' | 'evidence',
  style: FailStyle,
  seedBase: string,
  emit?: TrustEmit,
): ForgTrialResult {
  const choiceRand = seeded(`${seedBase}:${arm}:choice`);
  const store = new ForgivingStore();
  const observations: Observation[] = [];
  let learnedUpTo = 0;

  const selections: string[] = [];
  const incapableChosen: boolean[] = [];
  const wastedCum: number[] = [];
  let wasted = 0;
  let totalTokens = 0;

  // analysis-only trackers (ground truth is harness-side; none of this is root memory)
  const extras: ForgivenessExtras = {
    capableRecoveries: 0,
    recoveryLatencies: [],
    incapableLeaks: 0,
    capableBenchedEver: 0,
    probeCount: 0,
    probeTokens: 0,
    probeTokensWasted: 0,
    lateIncapableProbes: 0,
    postResetIncapableWasProbe: false,
    midProbationAtReset: false,
    postResetContinuityOk: true,
    transferPoolHadIncapable: false,
    transferReadmittedProbation: false,
  };
  const benchedEver = new Set<string>();
  const benchStart = new Map<string, number>(); // decay arm bookkeeping
  let prevEligible: Set<string> | null = null;
  const probeLog: { round: number; worker: string }[] = [];
  const exitLog: { round: number; worker: string }[] = [];
  let resetSnapshot: string | null = null;
  let midProbationAtResetState: { id: string; p: ProbationState }[] = [];

  const envFail = (round: number, worker: string): boolean =>
    seeded(`${seedBase}:env:r${round}:${worker}`)() < P_CAPABLE_TRANSIENT_FAIL;

  const learnVisible = (round: number): void => {
    while (learnedUpTo < observations.length) {
      const obs = observations[learnedUpTo];
      if (!obs || obs.visibleAtRound > round) break;
      store.writeObservation('root', {
        round: obs.round,
        worker: obs.worker,
        success: obs.success,
        ...(obs.failedAssertion !== undefined ? { failedAssertion: obs.failedAssertion } : {}),
      });
      if (arm !== 'decay') {
        // evidence-driven exit: record re-balanced while in probation → readmit
        const p = store.readProbation(obs.worker);
        const cap = store.readCap(obs.worker);
        if (p?.status === 'probation' && cap && cap.failures <= cap.successes) {
          store.writeProbation('root', obs.worker, { ...p, status: 'active' });
          exitLog.push({ round, worker: obs.worker });
          if (obs.worker === INCAPABLE) extras.incapableLeaks += 1;
          else {
            extras.capableRecoveries += 1;
            extras.recoveryLatencies.push(round - p.enteredRound);
          }
        }
      }
      learnedUpTo += 1;
    }
  };

  /** decay-arm eligibility: failures older than DECAY_WINDOW stop counting. */
  const decayEligible = (round: number): string[] => {
    const ok = WORKER_IDS.filter((id) => {
      const cap = store.readCap(id);
      if (!cap) return true;
      const effFailures = cap.history.filter((h) => !h.s && h.r > round - DECAY_WINDOW).length;
      return effFailures <= cap.successes;
    });
    return ok.length > 0 ? ok : [...WORKER_IDS];
  };

  const activePool = (): string[] => {
    const ok = WORKER_IDS.filter((id) => store.readProbation(id)?.status !== 'probation');
    return ok.length > 0 ? ok : [...WORKER_IDS];
  };

  let postResetIncapable = false;

  for (let round = 1; round <= ROUNDS; round += 1) {
    if (round === RESET_AFTER_ROUND + 1) {
      // Root killed + restarted. This engine keeps ZERO root-local trust
      // state — every round re-reads the store — so the restart's only real
      // test is that the store still holds what it held. Verify exactly that.
      if (arm !== 'decay') {
        const after = store.snapshotProbation(WORKER_IDS);
        extras.postResetContinuityOk = after === resetSnapshot;
        extras.midProbationAtReset = midProbationAtResetState.length > 0;
      }
      emit?.marker('reset', { round, arm, note: 'root killed and restarted' });
    }

    learnVisible(round);

    // decay arm: track pool transitions (bench / recovery / leak) at decision time
    if (arm === 'decay') {
      const elig = new Set(decayEligible(round));
      for (const id of WORKER_IDS) {
        const was = prevEligible === null ? true : prevEligible.has(id);
        const is = elig.has(id);
        if (was && !is) {
          benchStart.set(id, round);
          if (id !== INCAPABLE) benchedEver.add(id);
        } else if (!was && is) {
          if (id === INCAPABLE) extras.incapableLeaks += 1;
          else {
            extras.capableRecoveries += 1;
            const b = benchStart.get(id);
            if (b !== undefined) extras.recoveryLatencies.push(round - b);
          }
          benchStart.delete(id);
        }
      }
      prevEligible = elig;
    }

    // probation/evidence arms: threshold crossings enter probation (exp-14's exact crossing rule)
    if (arm !== 'decay') {
      for (const id of WORKER_IDS) {
        const cap = store.readCap(id);
        if (!cap || cap.failures <= cap.successes) continue;
        const p = store.readProbation(id);
        if (p?.status === 'probation') continue;
        store.writeProbation('root', id, {
          status: 'probation',
          enteredRound: round,
          nextProbeRound: round + PROBE_BASE,
          interval: PROBE_BASE,
          probes: 0,
          entries: (p?.entries ?? 0) + 1,
        });
        if (id !== INCAPABLE) benchedEver.add(id);
      }
    }

    // choose
    let chosen: string;
    let isProbe = false;
    if (arm === 'decay') {
      chosen = pickUniform(decayEligible(round), choiceRand);
    } else {
      const due = WORKER_IDS.map((id) => ({ id, p: store.readProbation(id) }))
        .filter(
          (x): x is { id: string; p: ProbationState } =>
            x.p !== null && x.p.status === 'probation' && x.p.nextProbeRound <= round,
        )
        // evidence arm: conclusive failure margin ends probing — the worker
        // stays benched on evidence, not on schedule position
        .filter((x) => {
          if (arm !== 'evidence') return true;
          const cap = store.readCap(x.id);
          return cap === null || cap.failures - cap.successes <= EVIDENCE_MARGIN;
        })
        .sort((a, b) => a.p.nextProbeRound - b.p.nextProbeRound || a.id.localeCompare(b.id));
      const first = due[0];
      if (first !== undefined) {
        chosen = first.id;
        isProbe = true;
        store.writeProbation('root', first.id, {
          ...first.p,
          probes: first.p.probes + 1,
          interval: first.p.interval * PROBE_BACKOFF,
          nextProbeRound: round + first.p.interval * PROBE_BACKOFF,
        });
        probeLog.push({ round, worker: first.id });
      } else {
        chosen = pickUniform(activePool(), choiceRand);
      }
    }

    selections.push(chosen);
    const isIncapable = chosen === INCAPABLE;
    incapableChosen.push(isIncapable);
    if (round === RESET_AFTER_ROUND + 1) {
      postResetIncapable = isIncapable;
      extras.postResetIncapableWasProbe = isIncapable && isProbe;
    }
    emit?.choice(round, 'root', chosen);

    // execute: harness-level ground truth, identical semantics to exp-14
    const success = isIncapable ? false : !envFail(round, chosen);
    const failedAssertion = success
      ? undefined
      : ASSERTIONS[Math.floor(seeded(`${seedBase}:assert:r${round}`)() * ASSERTIONS.length)];
    const confidentWrong = isIncapable && style === 'confident-wrong';
    const visibleAtRound = round + (confidentWrong ? 2 : 1);
    const cost = COST_BRIEF + COST_WORK + (confidentWrong ? COST_INTEGRATION : 0);
    totalTokens += cost;
    if (isIncapable) wasted += cost;
    wastedCum.push(wasted);
    if (isProbe) {
      extras.probeCount += 1;
      extras.probeTokens += cost;
      if (!success) extras.probeTokensWasted += cost;
      if (isIncapable && round >= 25) extras.lateIncapableProbes += 1;
    }
    const obs: Observation = {
      round,
      worker: chosen,
      success,
      visibleAtRound,
      ...(failedAssertion !== undefined ? { failedAssertion } : {}),
    };
    observations.push(obs);
    emit?.outcome(round, chosen, success, failedAssertion);

    // end of round 15: snapshot probation state the store holds at kill time
    if (round === RESET_AFTER_ROUND && arm !== 'decay') {
      resetSnapshot = store.snapshotProbation(WORKER_IDS);
      midProbationAtResetState = WORKER_IDS.map((id) => ({ id, p: store.readProbation(id) }))
        .filter((x): x is { id: string; p: ProbationState } => x.p !== null && x.p.status === 'probation');
    }
  }

  // schedule-honored half of the continuity check: every worker mid-probation
  // at the reset either got its probe exactly when scheduled, exited earlier
  // on evidence, or had its probe scheduled beyond the horizon.
  if (arm !== 'decay' && midProbationAtResetState.length > 0) {
    // honored = the scheduled probe happened at (or, under same-round probe
    // contention, shortly after) its scheduled round, OR the worker exited on
    // evidence first, OR the probe was scheduled beyond the horizon. Never
    // silently readmitted, never permanently dropped.
    const honored = midProbationAtResetState.every(({ id, p }) => {
      if (p.nextProbeRound > ROUNDS) return true;
      if (probeLog.some((e) => e.worker === id && e.round >= p.nextProbeRound)) return true;
      if (exitLog.some((e) => e.worker === id && e.round > RESET_AFTER_ROUND)) return true;
      if (arm === 'evidence') {
        // conclusively benched: probing legitimately stopped on evidence
        const cap = store.readCap(id);
        if (cap !== null && cap.failures - cap.successes > EVIDENCE_MARGIN) return true;
      }
      return false;
    });
    extras.postResetContinuityOk = extras.postResetContinuityOk && honored;
  }

  // transfer probe: brand-new root reads the same store at round 30
  learnVisible(ROUNDS + 2);
  const transferRand = seeded(`${seedBase}:${arm}:transfer`);
  let pool: string[];
  if (arm === 'decay') {
    pool = decayEligible(ROUNDS + 1);
  } else {
    pool = activePool();
    extras.transferReadmittedProbation = pool.some(
      (id) => store.readProbation(id)?.status === 'probation',
    );
  }
  extras.transferPoolHadIncapable = pool.includes(INCAPABLE);
  const inc = store.readCap(INCAPABLE);
  const transferHadEvidence = inc !== null && inc.failures > 0;
  const transferChoice = pickUniform(pool, transferRand);
  emit?.marker('transfer', {
    newRoot: 'root-prime',
    arm,
    choice: transferChoice,
    hadEvidence: transferHadEvidence,
    poolHadIncapable: extras.transferPoolHadIncapable,
  });

  // end-of-run exclusion count under THIS arm's read rule (capable workers only)
  let capableExcluded = 0;
  for (const id of WORKER_IDS) {
    if (id === INCAPABLE) continue;
    if (arm === 'decay') {
      const cap = store.readCap(id);
      if (!cap) continue;
      const effFailures = cap.history.filter((h) => !h.s && h.r > ROUNDS + 1 - DECAY_WINDOW).length;
      if (effFailures > cap.successes) capableExcluded += 1;
    } else if (store.readProbation(id)?.status === 'probation') {
      capableExcluded += 1;
    }
  }
  extras.capableBenchedEver = benchedEver.size;

  return {
    selections,
    incapableChosen,
    wastedCum,
    totalTokens,
    postResetIncapable,
    transferAvoided: transferChoice !== INCAPABLE,
    transferHadEvidence,
    reconcileOutcomes: { ...store.outcomes },
    capableExcluded,
    extras,
  };
}
