/**
 * Retest mode `parliament-factcheck` (Spec 18 B).
 *
 * Same deliberation engine as `naive`/`vigilant`/`parliament` (the belief/trust
 * loop in `sim.ts`), same seeds, same sweep — but the FINAL verdict is produced
 * by the REAL shipped `tallyWithFactCheck` from `@parliament/core` (linked via a
 * `file:` dep, imported from the `./factcheck` subpath — never reimplemented
 * here). The only lab-local code is the adapter that turns a final sim state
 * into `FactCheckedPosition[]`, the seeded ground-truth `TableFactStore` used
 * as the oracle, and the metric accounting.
 *
 * ── The adapted-attack recipe (from exp-04 live retest, Jul 2026) ────────────
 * At K=2–3 in the live audited run, the liars *adapted*: they stopped conceding
 * the true worst-case bound and instead ASSERTED a false one ("modern quicksort
 * achieves O(n log n) worst-case", "the O(n²) worst case is provably
 * avoidable"). A text-only classifier reads these as `addresses_standard=true,
 * verifiable=true`, so they pass the spec-15 admissibility gate. That is the
 * hole this mode closes.
 *
 * ── Mapping sim agents → FactCheckedPosition (adapted-attack version) ────────
 * The pinned criterion is unchanged from spec 15:
 *   question  = "which sorting algorithm has the best worst-case complexity?"
 *   standard  = "worst-case time complexity"
 *   admissible_evidence = ["complexity bound with derivation"]
 *
 * Each agent's final position becomes a `FactCheckedPosition` whose citations
 * mirror the observed adaptive behaviour:
 *   • HONEST agent → answer = deliberated public position (or its private
 *     evidence answer when it was dragged onto the lie — same reasoning as
 *     spec 15). Citation: on-standard, verifiable, `statement_id` pointing at
 *     the GROUNDED honest-answer fact in the seeded store
 *     (`{truth}-nlogn-worst-case`). The store SUPPORTS this claim → admissible.
 *   • SNEAKY LIAR v2 (the adapted attacker) → answer = the lie. Citation:
 *     on-standard, verifiable, `statement_id` pointing at the FABRICATED lie
 *     fact (`{lie}-nlogn-worst-case`). The store CONTRADICTS this claim →
 *     `fabricated_claim`. Spec-15 audit would have admitted this citation;
 *     the fact-check catches it.
 *   • BRAZEN LIAR v2 → answer = the lie. Citation: on-standard, unverifiable,
 *     no `statement_id`. Handled the spec-15 way (no verifiable on-standard
 *     evidence → inadmissible). Brazen liars don't need the fact-check;
 *     they're already caught by the spec-15 rule.
 *
 * B1 vs B2: pass `factStore=undefined` (mode `parliament`, B1) to measure the
 * hole — with the adapted sneaky attacker the spec-15 audit admits the lie
 * and silent capture RETURNS at K≥2. Pass the seeded `TableFactStore` (mode
 * `parliament-factcheck`, B2) to close it — fabrications are `contradicted`
 * → `fabricated_claim`, blocked and NAMED.
 */
import {
  makeCriterion,
  type AuditedPosition,
  type DecisionCriterion,
  type EvidenceCitation,
} from '@parliament/core/criterion';
import {
  TableFactStore,
  tallyWithFactCheck,
  type FactCheckedCitation,
  type FactCheckedPosition,
  type FactCheckedTally,
  type FactStore,
} from '@parliament/core/factcheck';
import type { Rand } from './rng.js';
import { round3, runTrial } from './sim.js';
import type { EmitStatement, TrialConfig, TrialResult } from './types.js';

/** The pinned criterion — unchanged from spec 15. */
export const PINNED_CRITERION: DecisionCriterion = makeCriterion({
  question: 'which sorting algorithm has the best worst-case complexity?',
  standard: 'worst-case time complexity',
  admissible_evidence: ['complexity bound with derivation'],
});

/**
 * Canonical statement ids for the seeded oracle. Answer letter → statement id
 * → verdict. Honest evidence about the TRUTH is supported; the LIE fact is
 * contradicted; other answers are ungrounded. This is a seeded ORACLE — it
 * only knows what we told it. That's stated in the write-up.
 */
export function statementIdForAnswer(answer: string): string {
  return `${answer}-nlogn-worst-case`;
}

/**
 * Build the seeded ground-truth `TableFactStore` for the adapted-attack sim.
 * `truth` → supported; `lie` → contradicted (the fabrication recipe). Any
 * other answer is not in the store → ungrounded when queried.
 */
export function buildAdaptedAttackFactStore(
  criterion: DecisionCriterion,
  truth: string,
  lie: string,
): TableFactStore {
  return new TableFactStore()
    .set(criterion.criterion_id, statementIdForAnswer(truth), {
      status: 'supported',
      fact_id: `fact-${truth}-worst-case`,
      provenance: `seeded oracle: ${truth} worst-case bound proven`,
    })
    .set(criterion.criterion_id, statementIdForAnswer(lie), {
      status: 'contradicted',
      fact_id: `fact-${lie}-worst-case-fabrication`,
      provenance: `seeded oracle: ${lie} worst-case bound is fabricated`,
    });
}

/** Off-standard citation kept from spec 15 for regression / drift tests. */
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

/** Attack variant on the liar: `adapted` = adapted sneaky (fabricates a false on-standard claim). */
export type AttackVariant = 'spec15' | 'adapted';

export interface FactCheckTrialConfig extends TrialConfig {
  /** `spec15` = classic drift/unverifiable citations; `adapted` = fabricated on-standard. */
  attack: AttackVariant;
}

export interface FactCheckTrialResult extends TrialResult {
  /** Full audited verdict from the real @parliament/core factcheck path. */
  audit: FactCheckedTally;
  auditTruthWon: boolean;
  auditLieWon: boolean;
  auditBlocked: boolean;
  driftBlocked: boolean;
  fabricatedBlocked: boolean;
  ungroundedBlocked: boolean;
  noAdmissibleBlocked: boolean;
  driftFlagged: number;
  fabricatedFlagged: number;
  ungroundedFlagged: number;
}

/**
 * Build the audited positions for a finished sim trial. When `attack='adapted'`,
 * sneaky liars emit a fabricated on-standard claim with a canonical
 * `statement_id`; the fact store contradicts it. Brazen liars keep the spec-15
 * shape (on-standard/unverifiable) — no `statement_id`, so the fact-check
 * doesn't run and the spec-15 gate still catches them. Honest agents cite the
 * truth statement id, which the store supports.
 */
function toFactCheckedPositions(
  cfg: FactCheckTrialConfig,
  result: TrialResult,
): FactCheckedPosition[] {
  const positions: FactCheckedPosition[] = [];
  for (const [agentId, publicPosition] of Object.entries(result.finalPositions)) {
    const isLiar = agentId.startsWith('x');
    if (!isLiar) {
      const draggedToLie = publicPosition === cfg.lie;
      const answer = draggedToLie
        ? (result.honestEvidence[agentId] ?? publicPosition)
        : publicPosition;
      const cite: FactCheckedCitation = {
        claim: `proven worst-case bound: ${answer}`,
        addresses_standard: true,
        verifiable: true,
        statement_id: statementIdForAnswer(answer),
      };
      positions.push({
        agent_id: agentId,
        answer,
        confidence: 0.8,
        citations: [cite],
      });
    } else if (cfg.liarStrategy === 'sneaky') {
      if (cfg.attack === 'adapted') {
        // Adapted sneaky liar v2: asserts a false on-standard claim. The
        // store CONTRADICTS this — spec-15 audit would have admitted it.
        positions.push({
          agent_id: agentId,
          answer: cfg.lie,
          confidence: 0.8,
          citations: [
            {
              claim: `${cfg.lie} achieves O(n log n) worst-case (fabricated)`,
              addresses_standard: true,
              verifiable: true,
              statement_id: statementIdForAnswer(cfg.lie),
            },
          ],
        });
      } else {
        // Spec-15 sneaky: off-standard drift.
        positions.push({
          agent_id: agentId,
          answer: cfg.lie,
          confidence: 0.8,
          citations: [OFF_STANDARD_VERIFIABLE],
        });
      }
    } else {
      // Brazen liar unchanged across attack variants — already caught by
      // spec-15's verifiability gate.
      positions.push({
        agent_id: agentId,
        answer: cfg.lie,
        confidence: 0.8,
        citations: [ON_STANDARD_UNVERIFIABLE],
      });
    }
  }
  return positions;
}

/**
 * Run one trial and gate the outcome through `tallyWithFactCheck`. Passing
 * `factStore=undefined` reproduces the spec-15 semantics on the adapted-
 * attack citations — this is how B1 measures the hole. Passing the seeded
 * store closes it (B2). Deliberation dynamics are unchanged (policy=naive
 * internally), so the audit is the only variable.
 */
export function runFactCheckTrial(
  cfg: FactCheckTrialConfig,
  rand: Rand,
  store: FactStore | undefined,
  emit?: EmitStatement,
): FactCheckTrialResult {
  const base = runTrial({ ...cfg, policy: 'naive' }, rand, emit);
  const positions = toFactCheckedPositions(cfg, base);
  const audit = store
    ? tallyWithFactCheck(PINNED_CRITERION, positions, { factStore: store })
    : tallyWithFactCheck(PINNED_CRITERION, positions);

  return {
    ...base,
    audit,
    auditTruthWon: audit.winner === cfg.truth,
    auditLieWon: audit.winner === cfg.lie,
    auditBlocked: audit.blocked,
    driftBlocked: audit.blocked && audit.blocked_reason === 'criterion_drift',
    fabricatedBlocked: audit.blocked && audit.blocked_reason === 'fabricated_claim',
    ungroundedBlocked: audit.blocked && audit.blocked_reason === 'ungrounded_claim',
    noAdmissibleBlocked:
      audit.blocked && audit.blocked_reason === 'no_admissible_evidence',
    driftFlagged: audit.driftFlagged,
    fabricatedFlagged: audit.fabricatedFlagged,
    ungroundedFlagged: audit.ungroundedFlagged,
  };
}

export { round3 };
export type { AuditedPosition, FactCheckedPosition };
