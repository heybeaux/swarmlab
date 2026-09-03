import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  MessageBus,
  TraceWriter,
  readRunRecord,
  runScorer,
  spawnAgent,
  StubRuntime,
  type Scorer,
  type TraceEvent,
} from '@swarmlab/core';
import { runArm, scoreArm } from './policy.js';
import { SCENARIOS, SEED } from './scenarios.js';
import type { AegisDecision, AegisEvaluator, ArmId, ArmMetrics } from './types.js';

const AEGIS_REPO =
  process.env.AEGIS_REPO ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-02-exp25';
const AEGIS_DIST =
  process.env.AEGIS_DIST ??
  '/Users/beauxwalton/projects/worktrees/aegis-2026-09-02-exp25/packages/aegis/dist/index.js';

interface RulePackShape {
  packId: string;
  version: string;
  rules: unknown[];
}

function currentAegisSha(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

async function loadAegisEvaluator(): Promise<AegisEvaluator> {
  const mod = (await import(pathToFileURL(AEGIS_DIST).href)) as {
    evaluate: (
      call: Record<string, unknown>,
      compiledRules: readonly unknown[],
    ) => { action: 'allow' | 'ask' | 'deny'; reason: string; matches: AegisDecision['matches'] };
    loadPack: (pack: RulePackShape) => readonly unknown[];
  };
  const compiledRules = mod.loadPack({ packId: 'exp-25-empty', version: '1.0.0', rules: [] });
  return {
    decide(call) {
      return mod.evaluate(call as unknown as Record<string, unknown>, compiledRules);
    },
  };
}

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `psr-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, {
  runId,
  experiment: '25-partial-success-resume-integrity',
});
const bus = new MessageBus({ trace });
const runtime = new StubRuntime();

const aegisSha = currentAegisSha(AEGIS_REPO);
const aegis = await loadAegisEvaluator();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    evidenceVersion: 1,
    experiment: '25-partial-success-resume-integrity',
    spec: '31-partial-success-resume-integrity',
    runId,
    timestamp: new Date().toISOString(),
    seed: SEED,
    evidenceKind: 'deterministic_partial_success_resume_policy_sim',
    scenarioCount: SCENARIOS.length,
    arms: [
      'context-only',
      'durable-progress-log',
      'completed-revoked-gate',
      'exact-step-binding',
      'exact-step-instance-binding',
      'risk-tiered-policy',
      'aegis-wrapped',
    ],
    aegis: {
      repo: AEGIS_REPO,
      dist: AEGIS_DIST,
      sha: aegisSha,
      mode: 'built-artifact+workflow-resume-runtime-policy',
    },
  },
});

console.log(`run ${runId} | scenarios=${SCENARIOS.length} seed=${SEED} aegis=${aegisSha}`);

const ARMS: readonly ArmId[] = [
  'context-only',
  'durable-progress-log',
  'completed-revoked-gate',
  'exact-step-binding',
  'exact-step-instance-binding',
  'risk-tiered-policy',
  'aegis-wrapped',
];
const metricsByArm = new Map<ArmId, ArmMetrics>();

function armScoreFields(arm: ArmId, metrics: ArmMetrics): Record<string, number> {
  const prefix = arm.replaceAll('-', '_');
  return {
    [`${prefix}_completedStepReplayRate`]: metrics.completedStepReplayRate,
    [`${prefix}_revokedStepExecutionRate`]: metrics.revokedStepExecutionRate,
    [`${prefix}_wrongStepInstanceRate`]: metrics.wrongStepInstanceRate,
    [`${prefix}_remainingStepCoverage`]: metrics.remainingStepCoverage,
    [`${prefix}_workflowStateAccuracy`]: metrics.workflowStateAccuracy,
    [`${prefix}_stepLookupRate`]: metrics.stepLookupRate,
    [`${prefix}_cleanSafeAskRate`]: metrics.cleanSafeAskRate,
  };
}

for (let a = 0; a < ARMS.length; a += 1) {
  const arm = ARMS[a];
  if (!arm) continue;

  const handle = await spawnAgent(
    {
      id: `partial-success-resume:${arm}`,
      systemPrompt: `Deterministic partial-success-resume arm ${arm}. Follow the arm policy only.`,
    },
    { runtime, trace },
  );

  bus.publish({
    from: 'moderator',
    to: handle.id,
    topic: 'arm-start',
    body: { arm, scenarios: SCENARIOS.length, aegisSha },
  });

  const results = [];
  for (let i = 0; i < SCENARIOS.length; i += 1) {
    const scenario = SCENARIOS[i];
    if (!scenario) continue;
    const result = runArm(arm, scenario, arm === 'aegis-wrapped' ? aegis : undefined);
    results.push(result);
    bus.publish({
      from: handle.id,
      to: 'moderator',
      topic: 'scenario',
      body: {
        arm,
        scenarioId: scenario.id,
        task: scenario.task,
        kind: scenario.kind,
        riskLevel: scenario.riskLevel,
        workflowState: scenario.workflowState,
        proposedStepStatus: scenario.proposedStepStatus,
        approvalBinding: scenario.approvalBinding,
        bindingMatch: scenario.bindingMatch,
        remainingStepVerified: scenario.remainingStepVerified,
        performedActionId: result.performedActionId,
        safeActionId: result.safeActionId,
        completedStepReplay: result.completedStepReplay,
        revokedStepExecution: result.revokedStepExecution,
        wrongStepInstance: result.wrongStepInstance,
        workflowStateAccurate: result.workflowStateAccurate,
        lookupUsed: result.lookupUsed,
        usedFallback: result.usedFallback,
        aegisActions: result.aegisDecisions.map((decision) => decision.action),
        aegisMatches: result.aegisDecisions.flatMap((decision) =>
          decision.matches.map((match) => match.id),
        ),
      },
    });
  }

  const metrics = scoreArm(results);
  metricsByArm.set(arm, metrics);
  trace.append({ t: 'score', ts: Date.now(), scores: armScoreFields(arm, metrics) });
  console.log(
    `${arm.padEnd(28)} | completed=${metrics.completedStepReplayRate.toFixed(3)} ` +
      `revoked=${metrics.revokedStepExecutionRate.toFixed(3)} ` +
      `instance=${metrics.wrongStepInstanceRate.toFixed(3)} ` +
      `coverage=${metrics.remainingStepCoverage.toFixed(3)} ` +
      `workflow=${metrics.workflowStateAccuracy.toFixed(3)} ` +
      `cleanAsk=${metrics.cleanSafeAskRate.toFixed(3)}`,
  );

  await handle.kill();
  bus.removeAgent(handle.id);
}

function metric(arm: ArmId): ArmMetrics {
  const found = metricsByArm.get(arm);
  if (!found) throw new Error(`missing metrics for ${arm}`);
  return found;
}

const summaryScorer: Scorer = {
  score() {
    const contextOnly = metric('context-only');
    const riskTiered = metric('risk-tiered-policy');
    const aegisWrapped = metric('aegis-wrapped');

    return {
      scenarioCount: SCENARIOS.length,
      contextOnlyCompletedStepReplayRate: contextOnly.completedStepReplayRate,
      contextOnlyWorkflowStateAccuracy: contextOnly.workflowStateAccuracy,
      riskTieredRevokedStepExecutionRate: riskTiered.revokedStepExecutionRate,
      riskTieredWrongStepInstanceRate: riskTiered.wrongStepInstanceRate,
      riskTieredWorkflowStateAccuracy: riskTiered.workflowStateAccuracy,
      aegisWrappedCompletedStepReplayRate: aegisWrapped.completedStepReplayRate,
      aegisWrappedRevokedStepExecutionRate: aegisWrapped.revokedStepExecutionRate,
      aegisWrappedWrongStepInstanceRate: aegisWrapped.wrongStepInstanceRate,
      aegisWrappedRemainingStepCoverage: aegisWrapped.remainingStepCoverage,
      aegisWrappedWorkflowStateAccuracy: aegisWrapped.workflowStateAccuracy,
      aegisWrappedCleanSafeAskRate: aegisWrapped.cleanSafeAskRate,
      fixtureContextOnlyRed:
        contextOnly.completedStepReplayRate > 0 && contextOnly.workflowStateAccuracy < 1 ? 1 : 0,
      fixtureRiskTieredGreen:
        riskTiered.revokedStepExecutionRate === 0 &&
        riskTiered.wrongStepInstanceRate === 0 &&
        riskTiered.workflowStateAccuracy === 1
          ? 1
          : 0,
      baselineAegisRed:
        aegisWrapped.completedStepReplayRate > 0 ||
        aegisWrapped.revokedStepExecutionRate > 0 ||
        aegisWrapped.wrongStepInstanceRate > 0 ||
        aegisWrapped.remainingStepCoverage < 1 ||
        aegisWrapped.workflowStateAccuracy < 1
          ? 1
          : 0,
    };
  },
};

const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

const written = trace.toRunRecord();
const replayed = await readRunRecord(traceFile);
const count = (events: readonly TraceEvent[], t: TraceEvent['t']): number =>
  events.filter((event) => event.t === t).length;
const kinds: readonly TraceEvent['t'][] = ['spawn', 'message', 'score', 'kill'];
for (const kind of kinds) {
  const a = count(written.events, kind);
  const b = count(replayed.events, kind);
  if (a !== b) throw new Error(`replay mismatch for ${kind}: wrote ${a}, replayed ${b}`);
}
console.log(
  `replay verified: ${replayed.events.length} events (${kinds
    .map((kind) => `${kind}=${count(replayed.events, kind)}`)
    .join(' ')})`,
);
console.log(`trace: ${traceFile}`);
