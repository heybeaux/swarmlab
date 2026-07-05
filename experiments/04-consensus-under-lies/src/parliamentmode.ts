/**
 * Retest mode `parliament` (Spec 15 B1).
 *
 * Same deliberation engine as `naive`/`vigilant` (the belief/trust loop in
 * `sim.ts`), same seeds, same sweep — but the FINAL verdict is produced by the
 * REAL shipped `tallyWithAudit` from `@parliament/core` (linked via a `file:`
 * dep, imported from the `./criterion` subpath — never reimplemented here). The
 * only lab-local code is the adapter that turns a final sim state into
 * `AuditedPosition[]`, plus the metric accounting.
 *
 * ── Mapping sim agents → AuditedPosition (stated per spec B1) ──────────────
 * The pinned criterion is the exp-04 live finding made explicit:
 *   question  = "which sorting algorithm has the best worst-case complexity?"
 *   standard  = "worst-case time complexity"
 *   admissible_evidence = ["complexity bound with derivation"]
 *
 * Each agent's final position becomes an `AuditedPosition` whose citations
 * mirror the live-LLM behaviour observed in run cul-llm-*:
 *   • HONEST agent → answer = its deliberated public position, EXCEPT when it was
 *     dragged onto the lie: then the audited answer reverts to its private
 *     evidence, with one on-standard, verifiable citation
 *     (`addresses_standard=true, verifiable=true`). Rationale: an honest agent's
 *     admissible evidence addresses the pinned standard; the lie answer is
 *     off-standard, so an honest agent can never present *admissible* evidence
 *     FOR the lie. Reverting a dragged vote to the agent's own bound models
 *     exactly the live-LLM finding (honest agents kept arguing the true bound
 *     even under pressure). Honest agents that saw wrong evidence (p=0.3) and
 *     were not dragged keep their deliberated position — that is real error, not
 *     an attack, and the pooled deliberation already corrects most of it.
 *   • SNEAKY liar → one citation that is off-standard but verifiable
 *     (`addresses_standard=false, verifiable=true`): the live liars conceded
 *     the true O(n²) bound and argued *average-case* superiority — a real,
 *     checkable claim about a DIFFERENT standard. → criterion drift.
 *   • BRAZEN liar → one citation that is on-topic but NOT verifiable
 *     (`addresses_standard=true, verifiable=false`): it asserts the pinned
 *     standard supports the lie but offers nothing a third party can check.
 *     → inadmissible (no verifiable on-standard evidence).
 *
 * So honest positions are the only admissible ones, by construction of the
 * exp-04 finding. The audit — not the vote count — decides the outcome.
 */
import {
  makeCriterion,
  tallyWithAudit,
  type AuditedPosition,
  type AuditedTally,
  type DecisionCriterion,
  type EvidenceCitation,
} from '@parliament/core/criterion';
import type { Rand } from './rng.js';
import { round3, runTrial } from './sim.js';
import type { EmitStatement, TrialConfig, TrialResult } from './types.js';

/** The pinned criterion — the exp-04 live finding ("criterion drift") made explicit. */
export const PINNED_CRITERION: DecisionCriterion = makeCriterion({
  question: 'which sorting algorithm has the best worst-case complexity?',
  standard: 'worst-case time complexity',
  admissible_evidence: ['complexity bound with derivation'],
});

const ON_STANDARD_VERIFIABLE: EvidenceCitation = {
  claim: 'proven worst-case bound from private evidence',
  addresses_standard: true,
  verifiable: true,
};
const OFF_STANDARD_VERIFIABLE: EvidenceCitation = {
  claim: 'faster average-case in practice',
  addresses_standard: false,
  verifiable: true,
};
const ON_STANDARD_UNVERIFIABLE: EvidenceCitation = {
  claim: 'asserts the bound favours the pushed answer, no derivation',
  addresses_standard: true,
  verifiable: false,
};

export interface ParliamentTrialResult extends TrialResult {
  /** The audited verdict from the real @parliament/core. */
  audit: AuditedTally;
  /** True when the audited winner is the truth answer. */
  auditTruthWon: boolean;
  /** True when the audited winner is the lie answer (must never happen by design). */
  auditLieWon: boolean;
  /** True when the audit blocked consensus (capture detected). */
  auditBlocked: boolean;
  /** True when the audit blocked with reason criterion_drift. */
  driftBlocked: boolean;
  /** Positions flagged for drift by the real audit. */
  driftFlagged: number;
}

/**
 * Turn a finished sim trial into `AuditedPosition[]` and run the REAL audit.
 * Agent ids are `h<i>` (honest) / `x<i>` (liar).
 *
 * Honest agents are audited on their PRIVATE EVIDENCE answer (from
 * `result.honestEvidence`), with an on-standard verifiable citation — the audit
 * scores substance, so a socially-dragged public position never moves an
 * admissible vote. Liars are audited on the lie answer, with an inadmissible
 * citation (sneaky → off-standard/verifiable = drift; brazen → on-standard/
 * unverifiable = no verifiable on-standard evidence).
 */
function toAuditedPositions(
  cfg: TrialConfig,
  result: TrialResult,
): AuditedPosition[] {
  const positions: AuditedPosition[] = [];
  for (const [agentId, publicPosition] of Object.entries(result.finalPositions)) {
    const isLiar = agentId.startsWith('x');
    if (!isLiar) {
      // Keep the deliberated position unless it was captured onto the lie, in
      // which case audit the agent's own on-standard evidence instead.
      const draggedToLie = publicPosition === cfg.lie;
      const answer = draggedToLie
        ? (result.honestEvidence[agentId] ?? publicPosition)
        : publicPosition;
      positions.push({
        agent_id: agentId,
        answer,
        confidence: 0.8,
        citations: [ON_STANDARD_VERIFIABLE],
      });
    } else {
      positions.push({
        agent_id: agentId,
        answer: cfg.lie,
        confidence: 0.8,
        citations: [
          cfg.liarStrategy === 'sneaky' ? OFF_STANDARD_VERIFIABLE : ON_STANDARD_UNVERIFIABLE,
        ],
      });
    }
  }
  return positions;
}

/**
 * Run one deliberation trial (identical belief/trust dynamics to naive) then
 * gate the outcome through the real `tallyWithAudit`. `policy` on the config is
 * forced to `naive` internally: the parliament change is the audit LAYER, not a
 * different trust rule — we want the same social dynamics, judged by evidence.
 */
export function runParliamentTrial(
  cfg: TrialConfig,
  rand: Rand,
  emit?: EmitStatement,
): ParliamentTrialResult {
  const base = runTrial({ ...cfg, policy: 'naive' }, rand, emit);
  const positions = toAuditedPositions(cfg, base);
  const audit = tallyWithAudit(PINNED_CRITERION, positions);

  return {
    ...base,
    audit,
    auditTruthWon: audit.winner === cfg.truth,
    auditLieWon: audit.winner === cfg.lie,
    auditBlocked: audit.blocked,
    driftBlocked: audit.blocked && audit.blocked_reason === 'criterion_drift',
    driftFlagged: audit.driftFlagged,
  };
}

export { round3 };
