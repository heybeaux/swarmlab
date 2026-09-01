export type ArmId =
  | 'single-model'
  | 'same-model-n'
  | 'same-provider-different-models'
  | 'cross-provider'
  | 'cross-provider+pinned-criterion'
  | 'cross-provider+adversarial'
  | 'specialist+panel'
  | 'aegis-wrapped';

export type TaskClass =
  | 'factual_qa'
  | 'criterion_interpretation'
  | 'fact_check'
  | 'code_review';

export type PanelDiversity =
  | 'single_model'
  | 'same_model_n'
  | 'same_provider'
  | 'cross_provider';

export type SourceDiversity = 'none' | 'single_source' | 'independent';
export type Role = 'generalist' | 'adversarial' | 'specialist';

export interface PanelistResponse {
  actor: string;
  provider: string;
  model: string;
  role: Role;
  answer: string;
  criterionId: string;
  evidence: readonly string[];
  flagsPremiseRisk: boolean;
}

export interface Scenario {
  id: string;
  task: string;
  taskClass: TaskClass;
  requiredCriterion: string;
  correctAnswer: string;
  clean: boolean;
  highRisk: boolean;
  naiveCriterionPinned: boolean;
  sharedPremiseRisk: boolean;
  sourceDiversity: SourceDiversity;
  singleModel: PanelistResponse;
  sameModelPanel: readonly PanelistResponse[];
  sameProviderPanel: readonly PanelistResponse[];
  crossProviderPanel: readonly PanelistResponse[];
  adversarial: PanelistResponse;
  specialist: PanelistResponse;
  notes: string;
}

export interface FinalDecision {
  answer: string;
  criterionId: string;
  evidenceSufficient: boolean;
  usedAdversarial: boolean;
  usedSpecialist: boolean;
  participants: readonly PanelistResponse[];
}

export interface VerificationMetadata {
  tier: 'retrieval_grounded';
  status: 'supported';
  highRiskAudit: boolean;
  correlatedVerifierRisk: boolean;
  panelDiversity: PanelDiversity;
  criterionPinned: boolean;
  sharedPremiseRisk: boolean;
  sourceDiversity: SourceDiversity;
  adversarialVerifierPresent: boolean;
  specialistVerifierPresent: boolean;
  taskClass: TaskClass;
}

export interface AegisMatch {
  id: string;
  severity: string;
  category: string;
  target: string;
}

export interface AegisDecision {
  action: 'allow' | 'ask' | 'deny';
  reason: string;
  matches: AegisMatch[];
}

export interface AttemptResult {
  scenarioId: string;
  arm: ArmId;
  correct: boolean;
  correlatedWrong: boolean;
  minorityCorrectSuppression: boolean;
  criterionDrift: boolean;
  evidenceUse: boolean;
  cleanSafeAsk: boolean;
  costUnits: number;
  usedSpecialist: boolean;
  usedAdversarial: boolean;
  usedFallback: boolean;
  finalAnswer: string;
  finalCriterionId: string;
  aegisDecisions: readonly AegisDecision[];
}

export interface ArmMetrics {
  panelAccuracy: number;
  correlatedWrongRate: number;
  minorityCorrectSuppressionRate: number;
  criterionDriftRate: number;
  evidenceUseRate: number;
  cleanSafeAskRate: number;
  costUnits: number;
  specialistUseRate: number;
  adversarialUseRate: number;
}

export interface AegisEvaluator {
  decide(call: {
    tool: string;
    verification: VerificationMetadata;
  }): AegisDecision;
}
