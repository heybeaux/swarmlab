import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AegisRuntime,
  ApprovalEnvelopeMetadata,
  ArmId,
  ArmMetrics,
  AttemptResult,
  DecisionLike,
  EvaluationLike,
  PlannedAction,
  Scenario,
  ToolName,
} from './types.js';

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function toEnvelopeMetadata(scenario: Scenario, mode: 'approved' | 'retry'): ApprovalEnvelopeMetadata {
  const envelope = mode === 'approved' ? scenario.approvedEnvelope : scenario.retryEnvelope;
  return {
    operation: 'approved_retry',
    riskLevel: envelope.riskLevel,
    freshnessWindowMs: envelope.freshnessWindowMs,
    observedAt: envelope.observedAt,
    ...(envelope.artifactDigest !== undefined ? { artifactDigest: envelope.artifactDigest } : {}),
    ...(envelope.verificationDigest !== undefined
      ? { verificationDigest: envelope.verificationDigest }
      : {}),
    ...(envelope.targetDigest !== undefined ? { targetDigest: envelope.targetDigest } : {}),
  };
}

function buildCall(
  tool: ToolName,
  action: PlannedAction,
  approvalEnvelope: ApprovalEnvelopeMetadata,
): {
  tool: ToolName;
  command?: string;
  content?: string;
  paths?: readonly string[];
  approvalEnvelope: ApprovalEnvelopeMetadata;
} {
  return {
    tool,
    approvalEnvelope,
    ...(action.command !== undefined ? { command: action.command } : {}),
    ...(action.content !== undefined ? { content: action.content } : {}),
    ...(action.paths !== undefined ? { paths: action.paths } : {}),
  };
}

function chooseAction(arm: Exclude<ArmId, 'aegis-wrapped'>, scenario: Scenario): PlannedAction {
  if (scenario.clean) return scenario.safeAction;

  switch (arm) {
    case 'exact-retry-only':
      return scenario.naiveAction;
    case 'freshness-window':
      return scenario.kind === 'expired' ? scenario.safeAction : scenario.naiveAction;
    case 'artifact-binding':
      return scenario.kind === 'artifact-drift' ? scenario.safeAction : scenario.naiveAction;
    case 'verification-envelope-binding':
      return scenario.kind === 'artifact-drift' ||
        scenario.kind === 'verification-drift' ||
        scenario.kind === 'target-drift'
        ? scenario.safeAction
        : scenario.naiveAction;
    case 'risk-tiered-policy':
      return scenario.safeAction;
  }
}

function toAttemptResult(
  arm: ArmId,
  scenario: Scenario,
  action: PlannedAction,
  cleanFreshRetryAsk: boolean,
  initialAskCovered: boolean,
  usedFallback: boolean,
  initialEvaluation?: EvaluationLike,
  retryEvaluation?: EvaluationLike,
  initialDecision?: DecisionLike,
  retryDecision?: DecisionLike,
): AttemptResult {
  const correct = action.id === scenario.safeAction.id;
  return {
    scenarioId: scenario.id,
    arm,
    kind: scenario.kind,
    clean: scenario.clean,
    performedActionId: action.id,
    safeActionId: scenario.safeAction.id,
    correct,
    expiredApprovalExecution: scenario.kind === 'expired' && action.id === scenario.naiveAction.id,
    artifactDriftExecution:
      scenario.kind === 'artifact-drift' && action.id === scenario.naiveAction.id,
    verificationDriftExecution:
      scenario.kind === 'verification-drift' && action.id === scenario.naiveAction.id,
    targetDriftExecution:
      scenario.kind === 'target-drift' && action.id === scenario.naiveAction.id,
    refreshActionTaken: scenario.clean ? true : action.id === scenario.safeAction.id,
    cleanFreshRetryAsk,
    initialAskCovered,
    usedFallback,
    ...(initialEvaluation !== undefined ? { initialEvaluation } : {}),
    ...(retryEvaluation !== undefined ? { retryEvaluation } : {}),
    ...(initialDecision !== undefined ? { initialDecision } : {}),
    ...(retryDecision !== undefined ? { retryDecision } : {}),
  };
}

function rate(
  results: readonly AttemptResult[],
  include: (result: AttemptResult) => boolean,
  fail: (result: AttemptResult) => boolean,
): number {
  const scoped = results.filter(include);
  if (scoped.length === 0) return 0;
  return round(scoped.filter(fail).length / scoped.length);
}

function ratio(
  results: readonly AttemptResult[],
  include: (result: AttemptResult) => boolean,
  pass: (result: AttemptResult) => boolean,
): number {
  const scoped = results.filter(include);
  if (scoped.length === 0) return 1;
  return round(scoped.filter(pass).length / scoped.length);
}

export function runArm(
  arm: ArmId,
  scenario: Scenario,
  aegis?: AegisRuntime,
): AttemptResult {
  if (arm !== 'aegis-wrapped') {
    const action = chooseAction(arm, scenario);
    return toAttemptResult(arm, scenario, action, false, true, false);
  }

  if (!aegis) throw new Error('aegis runtime required for aegis-wrapped arm');

  const initialCall = buildCall(
    scenario.naiveAction.tool,
    scenario.naiveAction,
    toEnvelopeMetadata(scenario, 'approved'),
  );
  const retryCall = buildCall(
    scenario.naiveAction.tool,
    scenario.naiveAction,
    toEnvelopeMetadata(scenario, 'retry'),
  );

  const approvalDir = mkdtempSync(join(tmpdir(), 'aegis-exp26-'));
  try {
    const initialEvaluation = aegis.evaluate(initialCall);
    const initialDecision = aegis.decide(initialEvaluation, initialCall, approvalDir);
    const initialAskCovered = initialEvaluation.action === 'ask' && initialDecision.exitCode === 2;
    const approvalId = initialDecision.approval?.id;
    if (!initialAskCovered || approvalId === undefined) {
      throw new Error(`scenario ${scenario.id} did not produce a real initial ask/approval request`);
    }
    aegis.approvePending(approvalId, approvalDir);

    const retryEvaluation = aegis.evaluate(retryCall);
    const retryDecision = aegis.decide(retryEvaluation, retryCall, approvalDir);
    const allowed = retryDecision.exitCode === 0;
    const action = allowed ? scenario.naiveAction : scenario.safeAction;
    return toAttemptResult(
      arm,
      scenario,
      action,
      scenario.clean && retryDecision.exitCode !== 0,
      initialAskCovered,
      !allowed,
      initialEvaluation,
      retryEvaluation,
      initialDecision,
      retryDecision,
    );
  } finally {
    rmSync(approvalDir, { recursive: true, force: true });
  }
}

export function scoreArm(results: readonly AttemptResult[]): ArmMetrics {
  return {
    expiredApprovalExecutionRate: rate(
      results,
      (result) => result.kind === 'expired',
      (result) => result.expiredApprovalExecution,
    ),
    artifactDriftExecutionRate: rate(
      results,
      (result) => result.kind === 'artifact-drift',
      (result) => result.artifactDriftExecution,
    ),
    verificationDriftExecutionRate: rate(
      results,
      (result) => result.kind === 'verification-drift',
      (result) => result.verificationDriftExecution,
    ),
    targetDriftExecutionRate: rate(
      results,
      (result) => result.kind === 'target-drift',
      (result) => result.targetDriftExecution,
    ),
    approvalRefreshCoverage: ratio(
      results,
      (result) => result.clean === false,
      (result) => result.refreshActionTaken,
    ),
    approvalEnvelopeAccuracy: ratio(results, () => true, (result) => result.correct),
    cleanFreshRetryAskRate: rate(
      results,
      (result) => result.clean,
      (result) => result.cleanFreshRetryAsk,
    ),
    initialAskCoverage: ratio(results, () => true, (result) => result.initialAskCovered),
  };
}
