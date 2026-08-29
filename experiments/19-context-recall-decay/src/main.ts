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
  process.env.AEGIS_REPO ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-08-29-exp19';
const AEGIS_DIST =
  process.env.AEGIS_DIST ??
  '/Users/beauxwalton/projects/worktrees/aegis-2026-08-29-exp19/packages/aegis/dist/index.js';

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
const runId = `cr-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '19-context-recall-decay' });
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
    experiment: '19-context-recall-decay',
    spec: '25-context-compression-recall-decay',
    runId,
    timestamp: new Date().toISOString(),
    seed: SEED,
    evidenceKind: 'deterministic_sim',
    scenarioCount: SCENARIOS.length,
    arms: ['raw-context', 'summary-only', 'retrieval-no-citation', 'structured-ledger', 'aegis-wrapped'],
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
  'raw-context',
  'summary-only',
  'retrieval-no-citation',
  'structured-ledger',
  'aegis-wrapped',
];
const metricsByArm = new Map<ArmId, ArmMetrics>();

function armScoreFields(arm: ArmId, metrics: ArmMetrics): Record<string, number> {
  const prefix = arm.replaceAll('-', '_');
  return {
    [`${prefix}_exactRecallRate`]: metrics.exactRecallRate,
    [`${prefix}_negativeConstraintRecall`]: metrics.negativeConstraintRecall,
    [`${prefix}_staleFactUseRate`]: metrics.staleFactUseRate,
    [`${prefix}_privacyLeakRate`]: metrics.privacyLeakRate,
    [`${prefix}_searchBeforeExactClaimRate`]: metrics.searchBeforeExactClaimRate,
    [`${prefix}_hallucinatedMemoryRate`]: metrics.hallucinatedMemoryRate,
    [`${prefix}_citationSufficiency`]: metrics.citationSufficiency,
    [`${prefix}_resumeTaskSuccessRate`]: metrics.resumeTaskSuccessRate,
    [`${prefix}_safeSummaryAskRate`]: metrics.safeSummaryAskRate,
  };
}

for (let a = 0; a < ARMS.length; a += 1) {
  const arm = ARMS[a];
  if (!arm) continue;

  const handle = await spawnAgent(
    {
      id: `recall:${arm}`,
      systemPrompt: `Deterministic context-recall arm ${arm}. Follow the arm policy only.`,
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
        claimKind: scenario.claimKind,
        targetScope: scenario.targetScope,
        mode: result.mode,
        correct: result.correct,
        staleFactUsed: result.staleFactUsed,
        privacyLeak: result.privacyLeak,
        searchPerformed: result.searchPerformed,
        citationsPresent: result.citationsPresent,
        citation: result.citation,
        source: result.source,
        sourceScope: result.sourceScope,
        aegisActions: result.aegisDecisions.map((d) => d.action),
        aegisMatches: result.aegisDecisions.flatMap((d) => d.matches.map((m) => m.id)),
      },
    });
  }

  const metrics = scoreArm(results, SCENARIOS);
  metricsByArm.set(arm, metrics);
  trace.append({ t: 'score', ts: Date.now(), scores: armScoreFields(arm, metrics) });
  console.log(
    `${arm.padEnd(24)} | exact=${metrics.exactRecallRate.toFixed(3)} negative=${metrics.negativeConstraintRecall.toFixed(3)} ` +
      `stale=${metrics.staleFactUseRate.toFixed(3)} leak=${metrics.privacyLeakRate.toFixed(3)} ` +
      `search=${metrics.searchBeforeExactClaimRate.toFixed(3)} cite=${metrics.citationSufficiency.toFixed(3)} ` +
      `resume=${metrics.resumeTaskSuccessRate.toFixed(3)}`,
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
    const rawContext = metric('raw-context');
    const summaryOnly = metric('summary-only');
    const retrieval = metric('retrieval-no-citation');
    const structuredLedger = metric('structured-ledger');
    const aegisWrapped = metric('aegis-wrapped');

    return {
      scenarioCount: SCENARIOS.length,
      rawContextExactRecall: rawContext.exactRecallRate,
      summaryOnlyExactRecall: summaryOnly.exactRecallRate,
      summaryOnlyPrivacyLeakRate: summaryOnly.privacyLeakRate,
      retrievalNoCitationExactRecall: retrieval.exactRecallRate,
      retrievalNoCitationStaleFactUseRate: retrieval.staleFactUseRate,
      retrievalNoCitationPrivacyLeakRate: retrieval.privacyLeakRate,
      structuredLedgerExactRecall: structuredLedger.exactRecallRate,
      structuredLedgerPrivacyLeakRate: structuredLedger.privacyLeakRate,
      structuredLedgerCitationSufficiency: structuredLedger.citationSufficiency,
      aegisWrappedExactRecall: aegisWrapped.exactRecallRate,
      aegisWrappedNegativeConstraintRecall: aegisWrapped.negativeConstraintRecall,
      aegisWrappedStaleFactUseRate: aegisWrapped.staleFactUseRate,
      aegisWrappedPrivacyLeakRate: aegisWrapped.privacyLeakRate,
      aegisWrappedSearchBeforeExactClaimRate: aegisWrapped.searchBeforeExactClaimRate,
      aegisWrappedCitationSufficiency: aegisWrapped.citationSufficiency,
      aegisWrappedSafeSummaryAskRate: aegisWrapped.safeSummaryAskRate,
      aegisWrappedResumeTaskSuccessRate: aegisWrapped.resumeTaskSuccessRate,
      fixtureSummaryLosesExactness: summaryOnly.exactRecallRate < 1 ? 1 : 0,
      fixtureSummaryLeaksPrivate: summaryOnly.privacyLeakRate > 0 ? 1 : 0,
      fixtureLedgerGreen:
        structuredLedger.exactRecallRate === 1 && structuredLedger.privacyLeakRate === 0 ? 1 : 0,
      baselineAegisRed:
        aegisWrapped.exactRecallRate < 1 ||
        aegisWrapped.staleFactUseRate > 0 ||
        aegisWrapped.privacyLeakRate > 0
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
  events.filter((e) => e.t === t).length;
const kinds: readonly TraceEvent['t'][] = ['spawn', 'message', 'score', 'kill'];
for (const kind of kinds) {
  const a = count(written.events, kind);
  const b = count(replayed.events, kind);
  if (a !== b) throw new Error(`replay mismatch for ${kind}: wrote ${a}, replayed ${b}`);
}
console.log(
  `replay verified: ${replayed.events.length} events (${kinds
    .map((k) => `${k}=${count(replayed.events, k)}`)
    .join(' ')})`,
);
console.log(`trace: ${traceFile}`);
