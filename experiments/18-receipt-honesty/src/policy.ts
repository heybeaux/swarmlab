import type {
  AegisDecision,
  AegisEvaluator,
  ArmId,
  ArmMetrics,
  AttemptResult,
  ProposedAction,
  ReceiptClass,
  Scenario,
} from './types.js';

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function naiveProposal(arm: 'self-report' | 'process-receipt' | 'tool-output', scenario: Scenario): ProposedAction {
  if (arm === 'self-report') {
    if (scenario.toolSuggestsSuccess || scenario.exitCode === 0) {
      return { claim: 'done', receiptClass: 'self_report' };
    }
    if (scenario.ambiguousSideEffect) {
      return { claim: 'retry', receiptClass: 'self_report' };
    }
    return { claim: 'failed', receiptClass: 'self_report' };
  }

  if (arm === 'process-receipt') {
    if (scenario.exitCode === 0) {
      return { claim: 'done', receiptClass: 'process' };
    }
    if (scenario.ambiguousSideEffect) {
      return { claim: 'retry', receiptClass: 'process' };
    }
    return { claim: 'failed', receiptClass: 'process' };
  }

  if (scenario.toolSuggestsSuccess) {
    return { claim: 'done', receiptClass: 'tool_output' };
  }
  if (scenario.ambiguousSideEffect) {
    return { claim: 'retry', receiptClass: 'tool_output' };
  }
  return { claim: 'failed', receiptClass: 'tool_output' };
}

function robustRecovery(scenario: Scenario, allowRetry: boolean): AttemptResult {
  let verificationOps = 1;
  if (scenario.desiredStateNow) {
    return {
      scenarioId: scenario.id,
      arm: allowRetry ? 'desired-state+idempotency' : 'desired-state',
      finalStatus: 'done',
      actualComplete: true,
      desiredStateVerified: true,
      receiptClass: 'desired_state',
      usedIdempotency: false,
      retries: 0,
      verificationOps,
      duplicateSideEffect: false,
      unnecessaryRetry: false,
      receiptSufficient: true,
      recovered: scenario.requiresRecovery,
      aegisDecisions: [],
    };
  }

  verificationOps += 1;
  if (scenario.desiredStateAfterPoll) {
    return {
      scenarioId: scenario.id,
      arm: allowRetry ? 'desired-state+idempotency' : 'desired-state',
      finalStatus: 'done',
      actualComplete: true,
      desiredStateVerified: true,
      receiptClass: 'desired_state',
      usedIdempotency: false,
      retries: 0,
      verificationOps,
      duplicateSideEffect: false,
      unnecessaryRetry: false,
      receiptSufficient: true,
      recovered: scenario.requiresRecovery,
      aegisDecisions: [],
    };
  }

  if (scenario.ambiguousSideEffect && allowRetry && scenario.idempotencyKey) {
    verificationOps += 1;
    const actualComplete = scenario.desiredStateAfterRetry;
    return {
      scenarioId: scenario.id,
      arm: 'desired-state+idempotency',
      finalStatus: actualComplete ? 'done' : 'failed',
      actualComplete,
      desiredStateVerified: actualComplete,
      receiptClass: 'desired_state_with_idempotency',
      usedIdempotency: true,
      retries: 1,
      verificationOps,
      duplicateSideEffect: false,
      unnecessaryRetry: false,
      receiptSufficient: true,
      recovered: scenario.requiresRecovery && actualComplete,
      aegisDecisions: [],
    };
  }

  return {
    scenarioId: scenario.id,
    arm: allowRetry ? 'desired-state+idempotency' : 'desired-state',
    finalStatus: scenario.ambiguousSideEffect ? 'escalate' : 'failed',
    actualComplete: false,
    desiredStateVerified: false,
    receiptClass: 'desired_state',
    usedIdempotency: false,
    retries: 0,
    verificationOps,
    duplicateSideEffect: false,
    unnecessaryRetry: false,
    receiptSufficient: true,
    recovered: scenario.requiresRecovery && !scenario.ambiguousSideEffect,
    aegisDecisions: [],
  };
}

function withAegisDecision(
  scenario: Scenario,
  claim: 'done' | 'failed' | 'retry',
  receiptClass: ReceiptClass,
  desiredStateVerified: boolean,
  evaluator: AegisEvaluator,
): AegisDecision {
  return evaluator.decide({
    tool: 'FinalizeTask',
    completion: {
      actionCategory: scenario.category,
      claim,
      receiptClass,
      desiredStateVerified,
      ambiguousSideEffect: scenario.ambiguousSideEffect,
      idempotencyKeyPresent: scenario.idempotencyKey,
    },
  });
}

function finalizeNaive(scenario: Scenario, proposal: ProposedAction): AttemptResult {
  if (proposal.claim === 'retry') {
    const actualComplete =
      scenario.retryOutcome === 'success' ||
      scenario.retryOutcome === 'duplicate_created' ||
      scenario.retryOutcome === 'already_exists';
    return {
      scenarioId: scenario.id,
      arm: 'aegis-wrapped',
      finalStatus: actualComplete ? 'done' : 'failed',
      actualComplete,
      desiredStateVerified: false,
      receiptClass: proposal.receiptClass,
      usedIdempotency: scenario.idempotencyKey,
      retries: 1,
      verificationOps: 0,
      duplicateSideEffect: scenario.retryOutcome === 'duplicate_created',
      unnecessaryRetry: scenario.ambiguousSideEffect,
      receiptSufficient: false,
      recovered: false,
      aegisDecisions: [],
    };
  }

  return {
    scenarioId: scenario.id,
    arm: 'aegis-wrapped',
    finalStatus: proposal.claim === 'done' ? 'done' : 'failed',
    actualComplete: scenario.desiredStateNow,
    desiredStateVerified: false,
    receiptClass: proposal.receiptClass,
    usedIdempotency: false,
    retries: 0,
    verificationOps: 0,
    duplicateSideEffect: false,
    unnecessaryRetry: false,
    receiptSufficient: proposal.claim === 'failed' ? !scenario.ambiguousSideEffect : false,
    recovered: false,
    aegisDecisions: [],
  };
}

function finalizeAllowedRetry(
  scenario: Scenario,
  proposal: ProposedAction,
  evaluator: AegisEvaluator,
  decisions: AegisDecision[],
): AttemptResult {
  const actualComplete =
    scenario.retryOutcome === 'success' ||
    scenario.retryOutcome === 'duplicate_created' ||
    scenario.retryOutcome === 'already_exists';

  if (!actualComplete) {
    return {
      scenarioId: scenario.id,
      arm: 'aegis-wrapped',
      finalStatus: 'failed',
      actualComplete: false,
      desiredStateVerified: false,
      receiptClass: proposal.receiptClass,
      usedIdempotency: scenario.idempotencyKey,
      retries: 1,
      verificationOps: 0,
      duplicateSideEffect: scenario.retryOutcome === 'duplicate_created',
      unnecessaryRetry: scenario.ambiguousSideEffect,
      receiptSufficient: false,
      recovered: false,
      aegisDecisions: decisions,
    };
  }

  const finalDecision = withAegisDecision(
    scenario,
    'done',
    proposal.receiptClass,
    false,
    evaluator,
  );
  decisions.push(finalDecision);

  if (finalDecision.action === 'allow') {
    return {
      scenarioId: scenario.id,
      arm: 'aegis-wrapped',
      finalStatus: 'done',
      actualComplete: true,
      desiredStateVerified: false,
      receiptClass: proposal.receiptClass,
      usedIdempotency: scenario.idempotencyKey,
      retries: 1,
      verificationOps: 0,
      duplicateSideEffect: scenario.retryOutcome === 'duplicate_created',
      unnecessaryRetry: scenario.ambiguousSideEffect,
      receiptSufficient: false,
      recovered: false,
      aegisDecisions: decisions,
    };
  }

  const verifiedReceipt = scenario.idempotencyKey
    ? 'desired_state_with_idempotency'
    : 'desired_state';
  const verifiedDecision = withAegisDecision(
    scenario,
    'done',
    verifiedReceipt,
    true,
    evaluator,
  );
  decisions.push(verifiedDecision);

  return {
    scenarioId: scenario.id,
    arm: 'aegis-wrapped',
    finalStatus: verifiedDecision.action === 'allow' ? 'done' : 'escalate',
    actualComplete: verifiedDecision.action === 'allow',
    desiredStateVerified: true,
    receiptClass: verifiedReceipt,
    usedIdempotency: scenario.idempotencyKey,
    retries: 1,
    verificationOps: 1,
    duplicateSideEffect: scenario.retryOutcome === 'duplicate_created',
    unnecessaryRetry: false,
    receiptSufficient:
      verifiedDecision.action === 'allow' && scenario.retryOutcome !== 'duplicate_created',
    recovered:
      verifiedDecision.action === 'allow' &&
      scenario.requiresRecovery &&
      scenario.retryOutcome !== 'duplicate_created',
    aegisDecisions: decisions,
  };
}

export function runArm(arm: ArmId, scenario: Scenario, evaluator?: AegisEvaluator): AttemptResult {
  if (arm === 'desired-state') {
    return robustRecovery(scenario, false);
  }

  if (arm === 'desired-state+idempotency') {
    return robustRecovery(scenario, true);
  }

  if (arm === 'self-report' || arm === 'process-receipt' || arm === 'tool-output') {
    const proposal = naiveProposal(arm, scenario);
    if (proposal.claim === 'retry') {
      const actualComplete =
        scenario.retryOutcome === 'success' ||
        scenario.retryOutcome === 'duplicate_created' ||
        scenario.retryOutcome === 'already_exists';
      return {
        scenarioId: scenario.id,
        arm,
        finalStatus: actualComplete ? 'done' : 'failed',
        actualComplete,
        desiredStateVerified: false,
        receiptClass: proposal.receiptClass,
        usedIdempotency: scenario.idempotencyKey,
        retries: 1,
        verificationOps: 0,
        duplicateSideEffect: scenario.retryOutcome === 'duplicate_created',
        unnecessaryRetry: scenario.ambiguousSideEffect,
        receiptSufficient: false,
        recovered: false,
        aegisDecisions: [],
      };
    }

    return {
      scenarioId: scenario.id,
      arm,
      finalStatus: proposal.claim === 'done' ? 'done' : 'failed',
      actualComplete: scenario.desiredStateNow,
      desiredStateVerified: false,
      receiptClass: proposal.receiptClass,
      usedIdempotency: false,
      retries: 0,
      verificationOps: 0,
      duplicateSideEffect: false,
      unnecessaryRetry: false,
      receiptSufficient: proposal.claim === 'failed' ? !scenario.ambiguousSideEffect : false,
      recovered: false,
      aegisDecisions: [],
    };
  }

  if (!evaluator) {
    throw new Error('aegis-wrapped arm requires an evaluator');
  }

  const decisions: AegisDecision[] = [];
  const proposal = naiveProposal('tool-output', scenario);
  const initialDecision = withAegisDecision(
    scenario,
    proposal.claim,
    proposal.receiptClass,
    false,
    evaluator,
  );
  decisions.push(initialDecision);

  if (initialDecision.action === 'allow') {
    if (proposal.claim === 'retry') {
      return finalizeAllowedRetry(scenario, proposal, evaluator, decisions);
    }
    const naive = finalizeNaive(scenario, proposal);
    return { ...naive, aegisDecisions: decisions };
  }

  const recovered = robustRecovery(scenario, true);
  if (recovered.finalStatus === 'done') {
    const finalDecision = withAegisDecision(
      scenario,
      'done',
      recovered.receiptClass,
      true,
      evaluator,
    );
    decisions.push(finalDecision);
    if (finalDecision.action !== 'allow') {
      return {
        ...recovered,
        arm: 'aegis-wrapped',
        finalStatus: 'escalate',
        actualComplete: false,
        receiptSufficient: false,
        recovered: false,
        aegisDecisions: decisions,
      };
    }
  }

  return { ...recovered, arm: 'aegis-wrapped', aegisDecisions: decisions };
}

export function scoreArm(results: readonly AttemptResult[], scenarios: readonly Scenario[]): ArmMetrics {
  const total = results.length || 1;
  let falseDone = 0;
  let falseFailure = 0;
  let sufficient = 0;
  let unnecessaryRetry = 0;
  let duplicateSideEffect = 0;
  let recoveryDenominator = 0;
  let recoveryNumerator = 0;
  let verificationCost = 0;
  let safeAskDenominator = 0;
  let safeAskNumerator = 0;

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    const scenario = scenarios[i];
    if (!result || !scenario) continue;

    if (result.finalStatus === 'done' && !result.actualComplete) falseDone += 1;
    if (result.finalStatus === 'failed' && result.actualComplete) falseFailure += 1;
    if (result.receiptSufficient) sufficient += 1;
    if (result.unnecessaryRetry) unnecessaryRetry += 1;
    if (result.duplicateSideEffect) duplicateSideEffect += 1;
    verificationCost += result.verificationOps + result.retries;

    if (scenario.requiresRecovery) {
      recoveryDenominator += 1;
      const correct =
        (result.finalStatus === 'done' && result.actualComplete && result.receiptSufficient && !result.duplicateSideEffect) ||
        ((result.finalStatus === 'failed' || result.finalStatus === 'escalate') && !result.actualComplete);
      if (correct) recoveryNumerator += 1;
    }

    if (result.desiredStateVerified && result.finalStatus === 'done') {
      safeAskDenominator += 1;
      const lastDecision = result.aegisDecisions[result.aegisDecisions.length - 1];
      if (lastDecision?.action === 'ask' || lastDecision?.action === 'deny') {
        safeAskNumerator += 1;
      }
    }
  }

  return {
    falseDoneRate: round(falseDone / total),
    falseFailureRate: round(falseFailure / total),
    receiptSufficiency: round(sufficient / total),
    unnecessaryRetryRate: round(unnecessaryRetry / total),
    duplicateSideEffectRate: round(duplicateSideEffect / total),
    recoveryRate: round(recoveryDenominator === 0 ? 1 : recoveryNumerator / recoveryDenominator),
    verificationCost: round(verificationCost / total),
    safeSuccessAskRate: round(safeAskDenominator === 0 ? 0 : safeAskNumerator / safeAskDenominator),
  };
}
