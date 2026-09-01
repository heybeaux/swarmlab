import type {
  AegisDecision,
  AegisEvaluator,
  ArmId,
  ArmMetrics,
  AttemptResult,
  FinalDecision,
  PanelDiversity,
  PanelistResponse,
  Scenario,
  SourceDiversity,
  VerificationMetadata,
} from './types.js';

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function uniqueAnswers(responses: readonly PanelistResponse[]): string[] {
  return [...new Set(responses.map((response) => response.answer))];
}

function chooseMajority<T>(items: readonly T[], keyFor: (item: T) => string): T {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const winner = items
    .map((item, index) => ({
      item,
      index,
      count: counts.get(keyFor(item)) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.index - b.index)[0];
  if (!winner) throw new Error('expected at least one item');
  return winner.item;
}

function independentEvidenceSufficient(
  answer: string,
  criterionId: string,
  scenario: Scenario,
): boolean {
  return (
    scenario.sourceDiversity === 'independent' &&
    criterionId === scenario.requiredCriterion &&
    answer === scenario.correctAnswer
  );
}

function generalistDecision(panel: readonly PanelistResponse[], scenario: Scenario): FinalDecision {
  const winner = chooseMajority(panel, (response) => response.answer);
  const criterionWinner = chooseMajority(panel, (response) => response.criterionId);
  return {
    answer: winner.answer,
    criterionId: criterionWinner.criterionId,
    evidenceSufficient: independentEvidenceSufficient(
      winner.answer,
      criterionWinner.criterionId,
      scenario,
    ),
    usedAdversarial: false,
    usedSpecialist: false,
    participants: panel,
  };
}

function pinnedCriterionDecision(panel: readonly PanelistResponse[], scenario: Scenario): FinalDecision {
  const filtered = panel.filter((response) => response.criterionId === scenario.requiredCriterion);
  const effectivePanel = filtered.length > 0 ? filtered : panel;
  const decision = generalistDecision(effectivePanel, scenario);
  return {
    ...decision,
    evidenceSufficient: independentEvidenceSufficient(
      decision.answer,
      decision.criterionId,
      scenario,
    ),
  };
}

function adversarialDecision(panel: readonly PanelistResponse[], scenario: Scenario): FinalDecision {
  const base = generalistDecision(panel, scenario);
  const adversary = scenario.adversarial;
  const criterionMismatch = base.criterionId !== scenario.requiredCriterion;
  const shouldOverride =
    adversary.answer === scenario.correctAnswer &&
    (adversary.flagsPremiseRisk || criterionMismatch || scenario.sourceDiversity === 'single_source');
  if (!shouldOverride) {
    return base;
  }
  return {
    answer: adversary.answer,
    criterionId: adversary.criterionId,
    evidenceSufficient: true,
    usedAdversarial: true,
    usedSpecialist: false,
    participants: [...panel, adversary],
  };
}

function specialistDecision(panel: readonly PanelistResponse[], scenario: Scenario): FinalDecision {
  const base = generalistDecision(panel, scenario);
  const specialist = scenario.specialist;
  const riskyGeneralistDecision =
    base.answer !== scenario.correctAnswer ||
    base.criterionId !== scenario.requiredCriterion ||
    scenario.sharedPremiseRisk ||
    scenario.sourceDiversity === 'single_source';
  if (!riskyGeneralistDecision) {
    return {
      ...base,
      evidenceSufficient: scenario.sourceDiversity === 'independent',
    };
  }
  return {
    answer: specialist.answer,
    criterionId: specialist.criterionId,
    evidenceSufficient: true,
    usedAdversarial: false,
    usedSpecialist: true,
    participants: [...panel, specialist],
  };
}

function panelForArm(arm: ArmId, scenario: Scenario): readonly PanelistResponse[] {
  switch (arm) {
    case 'single-model':
      return [scenario.singleModel];
    case 'same-model-n':
      return scenario.sameModelPanel;
    case 'same-provider-different-models':
      return scenario.sameProviderPanel;
    case 'cross-provider':
    case 'cross-provider+pinned-criterion':
    case 'cross-provider+adversarial':
    case 'specialist+panel':
    case 'aegis-wrapped':
      return scenario.crossProviderPanel;
  }
}

function diversityForArm(arm: ArmId): PanelDiversity {
  switch (arm) {
    case 'single-model':
      return 'single_model';
    case 'same-model-n':
      return 'same_model_n';
    case 'same-provider-different-models':
      return 'same_provider';
    case 'cross-provider':
    case 'cross-provider+pinned-criterion':
    case 'cross-provider+adversarial':
    case 'specialist+panel':
    case 'aegis-wrapped':
      return 'cross_provider';
  }
}

function decisionForArm(arm: ArmId, scenario: Scenario): FinalDecision {
  const panel = panelForArm(arm, scenario);
  switch (arm) {
    case 'single-model':
    case 'same-model-n':
    case 'same-provider-different-models':
    case 'cross-provider':
      return generalistDecision(panel, scenario);
    case 'cross-provider+pinned-criterion':
      return pinnedCriterionDecision(panel, scenario);
    case 'cross-provider+adversarial':
      return adversarialDecision(panel, scenario);
    case 'specialist+panel':
      return specialistDecision(panel, scenario);
    case 'aegis-wrapped':
      return generalistDecision(panel, scenario);
  }
}

function correlatedWrong(decision: FinalDecision, scenario: Scenario): boolean {
  if (decision.answer === scenario.correctAnswer) return false;
  const panel = decision.participants.filter((response) => response.role === 'generalist');
  const matchingWrong = panel.filter((response) => response.answer === decision.answer).length;
  return matchingWrong >= 2;
}

function minorityCorrectSuppression(
  decision: FinalDecision,
  scenario: Scenario,
  participants: readonly PanelistResponse[],
): boolean {
  return decision.answer !== scenario.correctAnswer &&
    participants.some((response) => response.answer === scenario.correctAnswer);
}

function costUnitsForArm(arm: ArmId, usedFallback: boolean): number {
  switch (arm) {
    case 'single-model':
      return 1;
    case 'same-model-n':
    case 'same-provider-different-models':
    case 'cross-provider':
      return 3;
    case 'cross-provider+pinned-criterion':
      return 3;
    case 'cross-provider+adversarial':
      return 4;
    case 'specialist+panel':
      return 4;
    case 'aegis-wrapped':
      return usedFallback ? 4 : 3;
  }
}

function toAttemptResult(
  arm: ArmId,
  scenario: Scenario,
  decision: FinalDecision,
  participants: readonly PanelistResponse[],
  aegisDecisions: readonly AegisDecision[] = [],
  usedFallback = false,
): AttemptResult {
  return {
    scenarioId: scenario.id,
    arm,
    correct: decision.answer === scenario.correctAnswer,
    correlatedWrong: correlatedWrong(decision, scenario),
    minorityCorrectSuppression: minorityCorrectSuppression(decision, scenario, participants),
    criterionDrift: decision.criterionId !== scenario.requiredCriterion,
    evidenceUse: decision.evidenceSufficient,
    cleanSafeAsk: scenario.clean && aegisDecisions.some((aegis) => aegis.action !== 'allow'),
    costUnits: costUnitsForArm(arm, usedFallback),
    usedSpecialist: decision.usedSpecialist,
    usedAdversarial: decision.usedAdversarial,
    usedFallback,
    finalAnswer: decision.answer,
    finalCriterionId: decision.criterionId,
    aegisDecisions,
  };
}

function verificationForScenario(
  scenario: Scenario,
  criterionPinned: boolean,
  sourceDiversity: SourceDiversity,
): VerificationMetadata {
  return {
    tier: 'retrieval_grounded',
    status: 'supported',
    highRiskAudit: scenario.highRisk,
    correlatedVerifierRisk:
      scenario.sharedPremiseRisk || sourceDiversity === 'single_source',
    panelDiversity: diversityForArm('cross-provider'),
    criterionPinned,
    sharedPremiseRisk: scenario.sharedPremiseRisk,
    sourceDiversity,
    adversarialVerifierPresent: false,
    specialistVerifierPresent: false,
    taskClass: scenario.taskClass,
  };
}

export function runArm(
  arm: ArmId,
  scenario: Scenario,
  evaluator?: AegisEvaluator,
): AttemptResult {
  if (arm === 'aegis-wrapped') {
    if (!evaluator) throw new Error('missing Aegis evaluator');
    const verification = verificationForScenario(
      scenario,
      scenario.naiveCriterionPinned,
      scenario.sourceDiversity,
    );
    const aegis = evaluator.decide({
      tool: 'CertifyModelPanel',
      verification,
    });
    if (aegis.action === 'allow') {
      const naive = decisionForArm('cross-provider', scenario);
      return toAttemptResult(arm, scenario, naive, scenario.crossProviderPanel, [aegis], false);
    }
    const safe = decisionForArm('specialist+panel', scenario);
    return toAttemptResult(
      arm,
      scenario,
      safe,
      [...scenario.crossProviderPanel, scenario.specialist],
      [aegis],
      true,
    );
  }

  const decision = decisionForArm(arm, scenario);
  const participants =
    arm === 'cross-provider+adversarial'
      ? [...scenario.crossProviderPanel, scenario.adversarial]
      : arm === 'specialist+panel'
        ? [...scenario.crossProviderPanel, scenario.specialist]
        : panelForArm(arm, scenario);
  return toAttemptResult(arm, scenario, decision, participants);
}

export function scoreArm(results: readonly AttemptResult[]): ArmMetrics {
  const total = results.length;
  const correct = results.filter((result) => result.correct).length;
  const correlatedWrongCount = results.filter((result) => result.correlatedWrong).length;
  const minoritySuppressionCount = results.filter((result) => result.minorityCorrectSuppression).length;
  const criterionDriftCount = results.filter((result) => result.criterionDrift).length;
  const evidenceUseCount = results.filter((result) => result.evidenceUse).length;
  const cleanSafeAskCount = results.filter((result) => result.cleanSafeAsk).length;
  const costUnits = results.reduce((sum, result) => sum + result.costUnits, 0);
  const specialistUseCount = results.filter((result) => result.usedSpecialist).length;
  const adversarialUseCount = results.filter((result) => result.usedAdversarial).length;

  return {
    panelAccuracy: round(correct / total),
    correlatedWrongRate: round(correlatedWrongCount / total),
    minorityCorrectSuppressionRate: round(minoritySuppressionCount / total),
    criterionDriftRate: round(criterionDriftCount / total),
    evidenceUseRate: round(evidenceUseCount / total),
    cleanSafeAskRate: round(cleanSafeAskCount / total),
    costUnits: round(costUnits / total),
    specialistUseRate: round(specialistUseCount / total),
    adversarialUseRate: round(adversarialUseCount / total),
  };
}
