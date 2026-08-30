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
  process.env.AEGIS_REPO ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-08-29-exp21';
const AEGIS_DIST =
  process.env.AEGIS_DIST ??
  '/Users/beauxwalton/projects/worktrees/aegis-2026-08-29-exp21/packages/aegis/dist/index.js';

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
  const compiledRules = mod.loadPack({ packId: 'exp-21-empty', version: '1.0.0', rules: [] });

  return {
    decide(call) {
      return mod.evaluate(call as unknown as Record<string, unknown>, compiledRules);
    },
  };
}

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `frs-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '21-fact-revocation-stale-trust' });
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
    experiment: '21-fact-revocation-stale-trust',
    spec: '27-fact-revocation-stale-trust',
    runId,
    timestamp: new Date().toISOString(),
    seed: SEED,
    evidenceKind: 'deterministic_sim',
    scenarioCount: SCENARIOS.length,
    arms: ['stale-basis', 'ttl-only', 'lifecycle-aware', 'aegis-wrapped'],
    aegis: {
      repo: AEGIS_REPO,
      dist: AEGIS_DIST,
      sha: aegisSha,
      mode: 'built-artifact+fact-lifecycle-runtime-policy',
    },
  },
});

console.log(`run ${runId} | scenarios=${SCENARIOS.length} seed=${SEED} aegis=${aegisSha}`);

const ARMS: readonly ArmId[] = ['stale-basis', 'ttl-only', 'lifecycle-aware', 'aegis-wrapped'];
const metricsByArm = new Map<ArmId, ArmMetrics>();

function armScoreFields(arm: ArmId, metrics: ArmMetrics): Record<string, number> {
  const prefix = arm.replaceAll('-', '_');
  return {
    [`${prefix}_staleUseRate`]: metrics.staleUseRate,
    [`${prefix}_correctionAdoptionRate`]: metrics.correctionAdoptionRate,
    [`${prefix}_revalidationBypassRate`]: metrics.revalidationBypassRate,
    [`${prefix}_overForgetRate`]: metrics.overForgetRate,
    [`${prefix}_recoveryRecognitionRate`]: metrics.recoveryRecognitionRate,
    [`${prefix}_lifecycleCitationRate`]: metrics.lifecycleCitationRate,
    [`${prefix}_cleanActionAskRate`]: metrics.cleanActionAskRate,
    [`${prefix}_safeRefusalRate`]: metrics.safeRefusalRate,
  };
}

for (let a = 0; a < ARMS.length; a += 1) {
  const arm = ARMS[a];
  if (!arm) continue;

  const handle = await spawnAgent(
    {
      id: `fact-lifecycle:${arm}`,
      systemPrompt: `Deterministic fact-lifecycle arm ${arm}. Follow the arm policy only.`,
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
        factClass: scenario.factClass,
        usageKind: scenario.usageKind,
        basisStatus: scenario.basisStatus,
        latestStatus: scenario.latestStatus,
        superseded: scenario.superseded,
        recoveryObserved: scenario.recoveryObserved,
        stable: scenario.stable,
        action: result.action,
        correct: result.correct,
        staleUse: result.staleUse,
        correctionAdopted: result.correctionAdopted,
        revalidationBypass: result.revalidationBypass,
        overForget: result.overForget,
        recoveryRecognized: result.recoveryRecognized,
        aegisActions: result.aegisDecisions.map((decision) => decision.action),
        aegisMatches: result.aegisDecisions.flatMap((decision) =>
          decision.matches.map((match) => match.id),
        ),
      },
    });
  }

  const metrics = scoreArm(results, SCENARIOS);
  metricsByArm.set(arm, metrics);
  trace.append({ t: 'score', ts: Date.now(), scores: armScoreFields(arm, metrics) });
  console.log(
    `${arm.padEnd(24)} | stale=${metrics.staleUseRate.toFixed(3)} correction=${metrics.correctionAdoptionRate.toFixed(3)} ` +
      `revalidate=${metrics.revalidationBypassRate.toFixed(3)} overForget=${metrics.overForgetRate.toFixed(3)} ` +
      `recovery=${metrics.recoveryRecognitionRate.toFixed(3)} cite=${metrics.lifecycleCitationRate.toFixed(3)} ` +
      `cleanAsk=${metrics.cleanActionAskRate.toFixed(3)}`,
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
    const stale = metric('stale-basis');
    const ttl = metric('ttl-only');
    const lifecycle = metric('lifecycle-aware');
    const aegisWrapped = metric('aegis-wrapped');

    return {
      scenarioCount: SCENARIOS.length,
      staleBasisStaleUseRate: stale.staleUseRate,
      staleBasisCorrectionAdoptionRate: stale.correctionAdoptionRate,
      ttlOnlyStaleUseRate: ttl.staleUseRate,
      ttlOnlyOverForgetRate: ttl.overForgetRate,
      lifecycleAwareStaleUseRate: lifecycle.staleUseRate,
      lifecycleAwareCorrectionAdoptionRate: lifecycle.correctionAdoptionRate,
      lifecycleAwareRevalidationBypassRate: lifecycle.revalidationBypassRate,
      lifecycleAwareOverForgetRate: lifecycle.overForgetRate,
      lifecycleAwareRecoveryRecognitionRate: lifecycle.recoveryRecognitionRate,
      aegisWrappedStaleUseRate: aegisWrapped.staleUseRate,
      aegisWrappedCorrectionAdoptionRate: aegisWrapped.correctionAdoptionRate,
      aegisWrappedRevalidationBypassRate: aegisWrapped.revalidationBypassRate,
      aegisWrappedOverForgetRate: aegisWrapped.overForgetRate,
      aegisWrappedRecoveryRecognitionRate: aegisWrapped.recoveryRecognitionRate,
      aegisWrappedLifecycleCitationRate: aegisWrapped.lifecycleCitationRate,
      aegisWrappedCleanActionAskRate: aegisWrapped.cleanActionAskRate,
      fixtureStaleBasisRed: stale.staleUseRate > 0 ? 1 : 0,
      fixtureLifecycleAwareGreen:
        lifecycle.staleUseRate === 0 &&
        lifecycle.revalidationBypassRate === 0 &&
        lifecycle.overForgetRate === 0 &&
        lifecycle.recoveryRecognitionRate === 1
          ? 1
          : 0,
      baselineAegisRed:
        aegisWrapped.staleUseRate > 0 || aegisWrapped.revalidationBypassRate > 0 ? 1 : 0,
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
