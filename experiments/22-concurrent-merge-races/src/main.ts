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
  process.env.AEGIS_REPO ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-08-30-exp22';
const AEGIS_DIST =
  process.env.AEGIS_DIST ??
  '/Users/beauxwalton/projects/worktrees/aegis-2026-08-30-exp22/packages/aegis/dist/index.js';

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
  const compiledRules = mod.loadPack({ packId: 'exp-22-empty', version: '1.0.0', rules: [] });

  return {
    decide(call) {
      return mod.evaluate(call as unknown as Record<string, unknown>, compiledRules);
    },
  };
}

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `cmr-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '22-concurrent-merge-races' });
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
    experiment: '22-concurrent-merge-races',
    spec: '28-concurrent-agent-merge-races',
    runId,
    timestamp: new Date().toISOString(),
    seed: SEED,
    evidenceKind: 'deterministic_repo_sim',
    scenarioCount: SCENARIOS.length,
    arms: [
      'no-coordination',
      'file-locks',
      'task-leases',
      'merge-queue',
      'merge-queue+reviewer',
      'shared-intent-ledger',
      'aegis-wrapped',
    ],
    aegis: {
      repo: AEGIS_REPO,
      dist: AEGIS_DIST,
      sha: aegisSha,
      mode: 'built-artifact+coordination-runtime-policy',
    },
  },
});

console.log(`run ${runId} | scenarios=${SCENARIOS.length} seed=${SEED} aegis=${aegisSha}`);

const ARMS: readonly ArmId[] = [
  'no-coordination',
  'file-locks',
  'task-leases',
  'merge-queue',
  'merge-queue+reviewer',
  'shared-intent-ledger',
  'aegis-wrapped',
];
const metricsByArm = new Map<ArmId, ArmMetrics>();

function armScoreFields(arm: ArmId, metrics: ArmMetrics): Record<string, number> {
  const prefix = arm.replaceAll('-', '_').replaceAll('+', '_plus_');
  return {
    [`${prefix}_buildBreakRate`]: metrics.buildBreakRate,
    [`${prefix}_semanticRegressionRate`]: metrics.semanticRegressionRate,
    [`${prefix}_duplicateWorkRate`]: metrics.duplicateWorkRate,
    [`${prefix}_staleAssumptionRate`]: metrics.staleAssumptionRate,
    [`${prefix}_cleanSafeAskRate`]: metrics.cleanSafeAskRate,
    [`${prefix}_textConflictRate`]: metrics.textConflictRate,
    [`${prefix}_coordinationRecoveryRate`]: metrics.coordinationRecoveryRate,
    [`${prefix}_idleCost`]: metrics.idleCost,
    [`${prefix}_recoverySteps`]: metrics.recoverySteps,
  };
}

for (let a = 0; a < ARMS.length; a += 1) {
  const arm = ARMS[a];
  if (!arm) continue;

  const handle = await spawnAgent(
    {
      id: `merge-race:${arm}`,
      systemPrompt: `Deterministic merge-race arm ${arm}. Follow the arm policy only.`,
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
        overlapClass: scenario.overlapClass,
        branchFreshness: scenario.branchFreshness,
        clean: scenario.clean,
        buildBroken: result.buildBroken,
        semanticRegression: result.semanticRegression,
        duplicateWork: result.duplicateWork,
        staleAssumption: result.staleAssumption,
        textConflict: result.textConflict,
        coordinationRecovered: result.coordinationRecovered,
        idleCost: result.idleCost,
        recoverySteps: result.recoverySteps,
        usedFallback: result.usedFallback,
        secondPlanKind: result.secondPlanKind,
        landedTasks: result.landedTasks,
        landedIntents: result.landedIntents,
        validatorSummary: result.validatorSummary,
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
    `${arm.padEnd(22)} | build=${metrics.buildBreakRate.toFixed(3)} semantic=${metrics.semanticRegressionRate.toFixed(3)} ` +
      `dup=${metrics.duplicateWorkRate.toFixed(3)} stale=${metrics.staleAssumptionRate.toFixed(3)} ` +
      `cleanAsk=${metrics.cleanSafeAskRate.toFixed(3)} recover=${metrics.coordinationRecoveryRate.toFixed(3)}`,
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
    const none = metric('no-coordination');
    const queueReviewer = metric('merge-queue+reviewer');
    const aegisWrapped = metric('aegis-wrapped');

    return {
      scenarioCount: SCENARIOS.length,
      noCoordinationBuildBreakRate: none.buildBreakRate,
      noCoordinationSemanticRegressionRate: none.semanticRegressionRate,
      noCoordinationDuplicateWorkRate: none.duplicateWorkRate,
      noCoordinationStaleAssumptionRate: none.staleAssumptionRate,
      queueReviewerBuildBreakRate: queueReviewer.buildBreakRate,
      queueReviewerSemanticRegressionRate: queueReviewer.semanticRegressionRate,
      queueReviewerDuplicateWorkRate: queueReviewer.duplicateWorkRate,
      queueReviewerStaleAssumptionRate: queueReviewer.staleAssumptionRate,
      aegisWrappedBuildBreakRate: aegisWrapped.buildBreakRate,
      aegisWrappedSemanticRegressionRate: aegisWrapped.semanticRegressionRate,
      aegisWrappedDuplicateWorkRate: aegisWrapped.duplicateWorkRate,
      aegisWrappedStaleAssumptionRate: aegisWrapped.staleAssumptionRate,
      aegisWrappedCleanSafeAskRate: aegisWrapped.cleanSafeAskRate,
      fixtureNoCoordinationRed:
        none.buildBreakRate > 0 && none.semanticRegressionRate > 0 ? 1 : 0,
      fixtureQueueReviewerGreen:
        queueReviewer.buildBreakRate === 0 &&
        queueReviewer.semanticRegressionRate === 0 &&
        queueReviewer.duplicateWorkRate === 0 &&
        queueReviewer.staleAssumptionRate === 0
          ? 1
          : 0,
      baselineAegisRed:
        aegisWrapped.buildBreakRate > 0 ||
        aegisWrapped.semanticRegressionRate > 0 ||
        aegisWrapped.duplicateWorkRate > 0 ||
        aegisWrapped.staleAssumptionRate > 0
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
