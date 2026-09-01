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
  process.env.AEGIS_REPO ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-08-31-exp23';
const AEGIS_DIST =
  process.env.AEGIS_DIST ??
  '/Users/beauxwalton/projects/worktrees/aegis-2026-08-31-exp23/packages/aegis/dist/index.js';

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
  const compiledRules = mod.loadPack({ packId: 'exp-23-empty', version: '1.0.0', rules: [] });
  return {
    decide(call) {
      return mod.evaluate(call as unknown as Record<string, unknown>, compiledRules);
    },
  };
}

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `mdc-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '23-model-diversity-correlated-error' });
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
    experiment: '23-model-diversity-correlated-error',
    spec: '29-model-diversity-correlated-error',
    runId,
    timestamp: new Date().toISOString(),
    seed: SEED,
    evidenceKind: 'deterministic_panel_sim',
    scenarioCount: SCENARIOS.length,
    arms: [
      'single-model',
      'same-model-n',
      'same-provider-different-models',
      'cross-provider',
      'cross-provider+pinned-criterion',
      'cross-provider+adversarial',
      'specialist+panel',
      'aegis-wrapped',
    ],
    aegis: {
      repo: AEGIS_REPO,
      dist: AEGIS_DIST,
      sha: aegisSha,
      mode: 'built-artifact+panel-independence-runtime-policy',
    },
  },
});

console.log(`run ${runId} | scenarios=${SCENARIOS.length} seed=${SEED} aegis=${aegisSha}`);

const ARMS: readonly ArmId[] = [
  'single-model',
  'same-model-n',
  'same-provider-different-models',
  'cross-provider',
  'cross-provider+pinned-criterion',
  'cross-provider+adversarial',
  'specialist+panel',
  'aegis-wrapped',
];
const metricsByArm = new Map<ArmId, ArmMetrics>();

function armScoreFields(arm: ArmId, metrics: ArmMetrics): Record<string, number> {
  const prefix = arm.replaceAll('-', '_').replaceAll('+', '_plus_');
  return {
    [`${prefix}_panelAccuracy`]: metrics.panelAccuracy,
    [`${prefix}_correlatedWrongRate`]: metrics.correlatedWrongRate,
    [`${prefix}_minorityCorrectSuppressionRate`]: metrics.minorityCorrectSuppressionRate,
    [`${prefix}_criterionDriftRate`]: metrics.criterionDriftRate,
    [`${prefix}_evidenceUseRate`]: metrics.evidenceUseRate,
    [`${prefix}_cleanSafeAskRate`]: metrics.cleanSafeAskRate,
    [`${prefix}_costUnits`]: metrics.costUnits,
    [`${prefix}_specialistUseRate`]: metrics.specialistUseRate,
    [`${prefix}_adversarialUseRate`]: metrics.adversarialUseRate,
  };
}

for (let a = 0; a < ARMS.length; a += 1) {
  const arm = ARMS[a];
  if (!arm) continue;

  const handle = await spawnAgent(
    {
      id: `model-diversity:${arm}`,
      systemPrompt: `Deterministic model-diversity arm ${arm}. Follow the arm policy only.`,
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
        taskClass: scenario.taskClass,
        clean: scenario.clean,
        finalAnswer: result.finalAnswer,
        finalCriterionId: result.finalCriterionId,
        correct: result.correct,
        correlatedWrong: result.correlatedWrong,
        minorityCorrectSuppression: result.minorityCorrectSuppression,
        criterionDrift: result.criterionDrift,
        evidenceUse: result.evidenceUse,
        usedSpecialist: result.usedSpecialist,
        usedAdversarial: result.usedAdversarial,
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
    `${arm.padEnd(30)} | acc=${metrics.panelAccuracy.toFixed(3)} corrWrong=${metrics.correlatedWrongRate.toFixed(3)} ` +
      `minority=${metrics.minorityCorrectSuppressionRate.toFixed(3)} drift=${metrics.criterionDriftRate.toFixed(3)} ` +
      `evidence=${metrics.evidenceUseRate.toFixed(3)} cleanAsk=${metrics.cleanSafeAskRate.toFixed(3)}`,
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
    const crossProvider = metric('cross-provider');
    const specialist = metric('specialist+panel');
    const aegisWrapped = metric('aegis-wrapped');

    return {
      scenarioCount: SCENARIOS.length,
      crossProviderPanelAccuracy: crossProvider.panelAccuracy,
      crossProviderCorrelatedWrongRate: crossProvider.correlatedWrongRate,
      crossProviderMinorityCorrectSuppressionRate: crossProvider.minorityCorrectSuppressionRate,
      crossProviderCriterionDriftRate: crossProvider.criterionDriftRate,
      specialistPanelAccuracy: specialist.panelAccuracy,
      specialistCorrelatedWrongRate: specialist.correlatedWrongRate,
      specialistCriterionDriftRate: specialist.criterionDriftRate,
      aegisWrappedPanelAccuracy: aegisWrapped.panelAccuracy,
      aegisWrappedCorrelatedWrongRate: aegisWrapped.correlatedWrongRate,
      aegisWrappedMinorityCorrectSuppressionRate: aegisWrapped.minorityCorrectSuppressionRate,
      aegisWrappedCriterionDriftRate: aegisWrapped.criterionDriftRate,
      aegisWrappedEvidenceUseRate: aegisWrapped.evidenceUseRate,
      aegisWrappedCleanSafeAskRate: aegisWrapped.cleanSafeAskRate,
      fixtureCrossProviderRed:
        crossProvider.panelAccuracy < 1 && crossProvider.correlatedWrongRate > 0 ? 1 : 0,
      fixtureSpecialistGreen:
        specialist.panelAccuracy === 1 &&
        specialist.correlatedWrongRate === 0 &&
        specialist.criterionDriftRate === 0
          ? 1
          : 0,
      baselineAegisRed:
        aegisWrapped.panelAccuracy < 1 ||
        aegisWrapped.correlatedWrongRate > 0 ||
        aegisWrapped.minorityCorrectSuppressionRate > 0 ||
        aegisWrapped.criterionDriftRate > 0
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
