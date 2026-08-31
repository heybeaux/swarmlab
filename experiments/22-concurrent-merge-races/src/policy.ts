import type {
  AegisDecision,
  AegisEvaluator,
  ArmId,
  ArmMetrics,
  AttemptResult,
  CoordinationMetadata,
  PlanKind,
  RepoState,
  Scenario,
  TaskPlan,
  TaskSpec,
  ValidationResult,
  VerificationCoverage,
} from './types.js';

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function cloneState(state: RepoState): RepoState {
  return {
    files: Object.fromEntries(Object.entries(state.files).map(([path, content]) => [path, content])),
    landedTasks: [...state.landedTasks],
    landedIntents: [...state.landedIntents],
    unresolvedConflict: state.unresolvedConflict,
  };
}

function applyPlan(state: RepoState, task: TaskSpec, plan: TaskPlan): RepoState {
  const next = cloneState(state);
  if (plan.mode === 'skip') return next;

  for (const patch of plan.patches) {
    const current = next.files[patch.path];
    if (patch.before !== undefined && current !== patch.before) {
      next.unresolvedConflict = true;
      return next;
    }
    next.files[patch.path] = patch.after;
  }

  next.landedTasks.push(task.id);
  next.landedIntents.push(task.intentId);
  return next;
}

function planFor(task: TaskSpec, kind: PlanKind): TaskPlan {
  if (kind === 'reviewed') return task.reviewed ?? task.refreshed ?? task.naive;
  if (kind === 'refreshed') return task.refreshed ?? task.naive;
  return task.naive;
}

function secondPlanKindForArm(arm: ArmId, scenario: Scenario): PlanKind {
  switch (arm) {
    case 'no-coordination':
      return 'naive';
    case 'file-locks':
      return scenario.overlapClass === 'text_conflict' ? 'refreshed' : 'naive';
    case 'task-leases':
      return scenario.overlapClass === 'duplicate_intent' ? 'reviewed' : 'naive';
    case 'merge-queue':
      return 'refreshed';
    case 'merge-queue+reviewer':
      return 'reviewed';
    case 'shared-intent-ledger':
      return scenario.overlapClass === 'duplicate_intent' || scenario.overlapClass === 'shared_invariant'
        ? 'reviewed'
        : 'naive';
    case 'aegis-wrapped':
      return 'naive';
  }
}

function protectionsForArm(
  arm: Exclude<ArmId, 'aegis-wrapped'>,
  scenario: Scenario,
): Omit<CoordinationMetadata, 'operation' | 'branchFreshness' | 'overlapClass'> {
  switch (arm) {
    case 'no-coordination':
      return {
        fileLockPresent: false,
        taskLeasePresent: false,
        intentLedgerPresent: false,
        mergeQueuePresent: false,
        semanticReviewPresent: false,
        verificationCoverage: 'none',
      };
    case 'file-locks':
      return {
        fileLockPresent: true,
        taskLeasePresent: false,
        intentLedgerPresent: false,
        mergeQueuePresent: false,
        semanticReviewPresent: false,
        verificationCoverage: 'none',
      };
    case 'task-leases':
      return {
        fileLockPresent: false,
        taskLeasePresent: true,
        intentLedgerPresent: false,
        mergeQueuePresent: false,
        semanticReviewPresent: false,
        verificationCoverage: 'none',
      };
    case 'merge-queue':
      return {
        fileLockPresent: false,
        taskLeasePresent: false,
        intentLedgerPresent: false,
        mergeQueuePresent: true,
        semanticReviewPresent: false,
        verificationCoverage: scenario.verificationCoverageAtRisk,
      };
    case 'merge-queue+reviewer':
      return {
        fileLockPresent: false,
        taskLeasePresent: false,
        intentLedgerPresent: true,
        mergeQueuePresent: true,
        semanticReviewPresent: true,
        verificationCoverage: 'semantic',
      };
    case 'shared-intent-ledger':
      return {
        fileLockPresent: false,
        taskLeasePresent: scenario.overlapClass === 'duplicate_intent',
        intentLedgerPresent: true,
        mergeQueuePresent: false,
        semanticReviewPresent: scenario.overlapClass === 'shared_invariant',
        verificationCoverage:
          scenario.overlapClass === 'shared_invariant' ? 'semantic' : 'none',
      };
  }
}

function decisionForAegis(
  scenario: Scenario,
  evaluator: AegisEvaluator,
): AegisDecision {
  return evaluator.decide({
    tool: 'MergeBranch',
    coordination: {
      operation: 'merge',
      branchFreshness: scenario.branchFreshness,
      overlapClass: scenario.overlapClass,
      fileLockPresent: false,
      taskLeasePresent: false,
      intentLedgerPresent: false,
      mergeQueuePresent: false,
      semanticReviewPresent: false,
      verificationCoverage: 'none',
    },
  });
}

function idleCostForArm(arm: ArmId, scenario: Scenario, usedFallback: boolean): number {
  switch (arm) {
    case 'no-coordination':
      return 0;
    case 'file-locks':
      return scenario.overlapClass === 'text_conflict' ? 1 : 0;
    case 'task-leases':
      return scenario.overlapClass === 'duplicate_intent' ? 1 : 0;
    case 'merge-queue':
      return scenario.clean ? 0 : 1;
    case 'merge-queue+reviewer':
      return scenario.clean ? 0 : 2;
    case 'shared-intent-ledger':
      return scenario.overlapClass === 'duplicate_intent' || scenario.overlapClass === 'shared_invariant'
        ? 1
        : 0;
    case 'aegis-wrapped':
      return usedFallback ? 2 : 0;
  }
}

function recoverySteps(validation: ValidationResult, secondPlanKind: PlanKind, usedFallback: boolean): number {
  if (!validation.visibleBuildPass || !validation.hiddenInvariantPass) return 2;
  if (usedFallback || secondPlanKind !== 'naive') return 1;
  return 0;
}

function toAttemptResult(
  arm: ArmId,
  scenario: Scenario,
  state: RepoState,
  validation: ValidationResult,
  secondPlanKind: PlanKind,
  aegisDecisions: readonly AegisDecision[],
  usedFallback: boolean,
): AttemptResult {
  const buildBroken = !validation.visibleBuildPass;
  const semanticRegression = validation.visibleBuildPass && !validation.hiddenInvariantPass;
  const duplicateWork = validation.duplicateIntent;
  const staleAssumption =
    scenario.branchFreshness === 'stale' &&
    secondPlanKind === 'naive' &&
    (buildBroken || semanticRegression);
  const cleanSafeAsk = scenario.clean && aegisDecisions.some((decision) => decision.action !== 'allow');
  return {
    scenarioId: scenario.id,
    arm,
    buildBroken,
    semanticRegression,
    duplicateWork,
    staleAssumption,
    textConflict: state.unresolvedConflict,
    coordinationRecovered: !buildBroken && !semanticRegression,
    cleanSafeAsk,
    idleCost: idleCostForArm(arm, scenario, usedFallback),
    recoverySteps: recoverySteps(validation, secondPlanKind, usedFallback),
    firstPlanKind: 'naive',
    secondPlanKind,
    usedFallback,
    landedTasks: [...state.landedTasks],
    landedIntents: [...state.landedIntents],
    finalFiles: state.files,
    aegisDecisions,
    validatorSummary: validation.summary,
  };
}

function runResolvedArm(
  arm: ArmId,
  scenario: Scenario,
  secondPlanKind: PlanKind,
  aegisDecisions: readonly AegisDecision[] = [],
  usedFallback = false,
): AttemptResult {
  let state: RepoState = {
    files: Object.fromEntries(
      Object.entries(scenario.baseFiles).map(([path, content]) => [path, content]),
    ),
    landedTasks: [],
    landedIntents: [],
    unresolvedConflict: false,
  };

  state = applyPlan(state, scenario.first, planFor(scenario.first, 'naive'));
  state = applyPlan(state, scenario.second, planFor(scenario.second, secondPlanKind));
  const validation = scenario.validate(state);
  return toAttemptResult(arm, scenario, state, validation, secondPlanKind, aegisDecisions, usedFallback);
}

export function runArm(
  arm: ArmId,
  scenario: Scenario,
  evaluator?: AegisEvaluator,
): AttemptResult {
  if (arm === 'aegis-wrapped') {
    if (!evaluator) throw new Error('missing Aegis evaluator');
    const decision = decisionForAegis(scenario, evaluator);
    if (decision.action === 'allow') {
      return runResolvedArm(arm, scenario, 'naive', [decision], false);
    }
    return runResolvedArm(arm, scenario, 'reviewed', [decision], true);
  }

  return runResolvedArm(arm, scenario, secondPlanKindForArm(arm, scenario));
}

export function scoreArm(results: readonly AttemptResult[]): ArmMetrics {
  const total = results.length;
  const buildBroken = results.filter((result) => result.buildBroken).length;
  const semanticRegression = results.filter((result) => result.semanticRegression).length;
  const duplicateWork = results.filter((result) => result.duplicateWork).length;
  const staleAssumption = results.filter((result) => result.staleAssumption).length;
  const cleanSafeAsk = results.filter((result) => result.cleanSafeAsk).length;
  const textConflict = results.filter((result) => result.textConflict).length;
  const recovered = results.filter((result) => result.coordinationRecovered).length;
  const idleCost = results.reduce((sum, result) => sum + result.idleCost, 0);
  const recoverySteps = results.reduce((sum, result) => sum + result.recoverySteps, 0);

  return {
    buildBreakRate: round(buildBroken / total),
    semanticRegressionRate: round(semanticRegression / total),
    duplicateWorkRate: round(duplicateWork / total),
    staleAssumptionRate: round(staleAssumption / total),
    cleanSafeAskRate: round(cleanSafeAsk / total),
    textConflictRate: round(textConflict / total),
    coordinationRecoveryRate: round(recovered / total),
    idleCost: round(idleCost / total),
    recoverySteps: round(recoverySteps / total),
  };
}
