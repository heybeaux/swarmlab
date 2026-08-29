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
  process.env.AEGIS_REPO ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-08-29-exp18';
const AEGIS_DIST =
  process.env.AEGIS_DIST ??
  '/Users/beauxwalton/projects/worktrees/aegis-2026-08-29-exp18/packages/aegis/dist/index.js';

function currentAegisSha(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

async function loadAegisEvaluator(): Promise<AegisEvaluator> {
  const mod = (await import(pathToFileURL(AEGIS_DIST).href)) as {
    evaluate: (
      call: Record<string, unknown>,
      compiledRules: readonly unknown[],
    ) => { action: 'allow' | 'ask' | 'deny'; reason: string; matches: AegisDecision['matches'] };
  };

  return {
    decide(call) {
      return mod.evaluate(call as unknown as Record<string, unknown>, []);
    },
  };
}

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `rh-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '18-receipt-honesty' });
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
    experiment: '18-receipt-honesty',
    spec: '24-receipt-honesty-action-verification',
    runId,
    timestamp: new Date().toISOString(),
    seed: SEED,
    evidenceKind: 'deterministic_sim',
    scenarioCount: SCENARIOS.length,
    arms: [
      'self-report',
      'process-receipt',
      'tool-output',
      'desired-state',
      'desired-state+idempotency',
      'aegis-wrapped',
    ],
    aegis: {
      repo: AEGIS_REPO,
      dist: AEGIS_DIST,
      sha: aegisSha,
      mode: 'built-artifact',
    },
  },
});

console.log(`run ${runId} | scenarios=${SCENARIOS.length} seed=${SEED} aegis=${aegisSha}`);

const ARMS: readonly ArmId[] = [
  'self-report',
  'process-receipt',
  'tool-output',
  'desired-state',
  'desired-state+idempotency',
  'aegis-wrapped',
];
const metricsByArm = new Map<ArmId, ArmMetrics>();

function armScoreFields(arm: ArmId, metrics: ArmMetrics): Record<string, number> {
  const prefix = arm.replaceAll('+', '_plus_').replaceAll('-', '_');
  return {
    [`${prefix}_falseDoneRate`]: metrics.falseDoneRate,
    [`${prefix}_falseFailureRate`]: metrics.falseFailureRate,
    [`${prefix}_receiptSufficiency`]: metrics.receiptSufficiency,
    [`${prefix}_unnecessaryRetryRate`]: metrics.unnecessaryRetryRate,
    [`${prefix}_duplicateSideEffectRate`]: metrics.duplicateSideEffectRate,
    [`${prefix}_recoveryRate`]: metrics.recoveryRate,
    [`${prefix}_verificationCost`]: metrics.verificationCost,
    [`${prefix}_safeSuccessAskRate`]: metrics.safeSuccessAskRate,
  };
}

for (let a = 0; a < ARMS.length; a += 1) {
  const arm = ARMS[a];
  if (!arm) continue;

  const handle = await spawnAgent(
    {
      id: `policy:${arm}`,
      systemPrompt: `Deterministic receipt policy arm ${arm}. Follow the arm rules only.`,
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
        category: scenario.category,
        signal: scenario.signal,
        finalStatus: result.finalStatus,
        actualComplete: result.actualComplete,
        desiredStateVerified: result.desiredStateVerified,
        receiptClass: result.receiptClass,
        retries: result.retries,
        verificationOps: result.verificationOps,
        duplicateSideEffect: result.duplicateSideEffect,
        receiptSufficient: result.receiptSufficient,
        recovered: result.recovered,
        aegisActions: result.aegisDecisions.map((d) => d.action),
        aegisMatches: result.aegisDecisions.flatMap((d) => d.matches.map((m) => m.id)),
      },
    });
  }

  const metrics = scoreArm(results, SCENARIOS);
  metricsByArm.set(arm, metrics);
  trace.append({ t: 'score', ts: Date.now(), scores: armScoreFields(arm, metrics) });
  console.log(
    `${arm.padEnd(24)} | falseDone=${metrics.falseDoneRate.toFixed(3)} falseFail=${metrics.falseFailureRate.toFixed(3)} ` +
      `dup=${metrics.duplicateSideEffectRate.toFixed(3)} suff=${metrics.receiptSufficiency.toFixed(3)} ` +
      `recover=${metrics.recoveryRate.toFixed(3)} cost=${metrics.verificationCost.toFixed(3)}`,
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
    const selfReport = metric('self-report');
    const processReceipt = metric('process-receipt');
    const toolOutput = metric('tool-output');
    const desiredState = metric('desired-state');
    const desiredStateIdem = metric('desired-state+idempotency');
    const aegisWrapped = metric('aegis-wrapped');

    return {
      scenarioCount: SCENARIOS.length,
      selfReportFalseDone: selfReport.falseDoneRate,
      processReceiptFalseDone: processReceipt.falseDoneRate,
      toolOutputFalseDone: toolOutput.falseDoneRate,
      desiredStateFalseDone: desiredState.falseDoneRate,
      desiredStateIdemFalseDone: desiredStateIdem.falseDoneRate,
      aegisWrappedFalseDone: aegisWrapped.falseDoneRate,
      selfReportDuplicateSideEffect: selfReport.duplicateSideEffectRate,
      desiredStateIdemDuplicateSideEffect: desiredStateIdem.duplicateSideEffectRate,
      aegisWrappedDuplicateSideEffect: aegisWrapped.duplicateSideEffectRate,
      desiredStateIdemReceiptSufficiency: desiredStateIdem.receiptSufficiency,
      aegisWrappedReceiptSufficiency: aegisWrapped.receiptSufficiency,
      aegisWrappedSafeSuccessAskRate: aegisWrapped.safeSuccessAskRate,
      aegisWrappedRecoveryRate: aegisWrapped.recoveryRate,
      baselineAegisRed:
        aegisWrapped.falseDoneRate > 0 || aegisWrapped.duplicateSideEffectRate > 0 ? 1 : 0,
      fixtureNaiveOverclaims: selfReport.falseDoneRate > 0 ? 1 : 0,
      fixtureRobustControlGreen:
        desiredStateIdem.falseDoneRate === 0 && desiredStateIdem.duplicateSideEffectRate === 0 ? 1 : 0,
    };
  },
};

const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

const written = trace.toRunRecord();
const replayed = await readRunRecord(traceFile);
const count = (events: readonly TraceEvent[], t: TraceEvent['t']): number =>
  events.filter((e) => e.t === t).length;
const kinds: readonly TraceEvent['t'][] = ['spawn', 'message', 'score', 'kill'];
for (const kind of kinds) {
  const a = count(written.events, kind);
  const b = count(replayed.events, kind);
  if (a !== b) throw new Error(`replay mismatch for ${kind}: wrote ${a}, replayed ${b}`);
}

console.log(`replay verified: ${replayed.events.length} events (${kinds.map((k) => `${k}=${count(replayed.events, k)}`).join(' ')})`);
console.log(`trace: ${traceFile}`);
