import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime, type Scorer, type TraceEvent } from '@swarmlab/core';
import type { Arm, Scenario, ScenarioResult } from './types.js';

const SEED = 'source-freshness-action-gate-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-30-exp51-source-freshness-baseline';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const BUILD_ID = process.env['AEGIS_BUILD_ID'] ?? '';
const moduleUrl = (p: string) => { const u = pathToFileURL(p); if (BUILD_ID) u.searchParams.set('build', BUILD_ID); return u.href; };
const sha = (repo: string) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const T = 1_800_000_000_000;

const scenarios: readonly Scenario[] = [
  { id: 'fresh-high-risk-same-version', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, observedSourceVersion: 7, checkedAtMs: T, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'fresh', authenticated: true, lifecycleStatus: 'supported', expectedAction: 'allow' },
  { id: 'fresh-high-risk-newer-version', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 8, observedSourceVersion: 8, checkedAtMs: T, actionAtMs: T + 1_000, maxAgeMs: 60_000, checkStatus: 'fresh', authenticated: true, lifecycleStatus: 'supported', expectedAction: 'allow' },
  { id: 'high-risk-no-check', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'not_attempted', lifecycleStatus: 'supported', expectedAction: 'ask' },
  { id: 'high-risk-unavailable', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'unavailable', lifecycleStatus: 'supported', expectedAction: 'ask' },
  { id: 'high-risk-timeout', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'timeout', lifecycleStatus: 'supported', expectedAction: 'ask' },
  { id: 'high-risk-observation-too-old', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, observedSourceVersion: 7, checkedAtMs: T, actionAtMs: T + 60_001, maxAgeMs: 60_000, checkStatus: 'fresh', authenticated: true, lifecycleStatus: 'supported', expectedAction: 'ask' },
  { id: 'high-risk-version-mismatch', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, observedSourceVersion: 8, checkedAtMs: T, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'fresh', authenticated: true, lifecycleStatus: 'supported', expectedAction: 'ask' },
  { id: 'high-risk-source-mismatch', risk: 'high', sourceId: 'authority:mirror', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, observedSourceVersion: 7, checkedAtMs: T, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'fresh', authenticated: true, lifecycleStatus: 'supported', expectedAction: 'ask' },
  { id: 'high-risk-unauthenticated', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, observedSourceVersion: 7, checkedAtMs: T, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'fresh', authenticated: false, lifecycleStatus: 'supported', expectedAction: 'ask' },
  { id: 'lifecycle-pending-despite-check', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, observedSourceVersion: 7, checkedAtMs: T, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'fresh', authenticated: true, lifecycleStatus: 'needs_revalidation', expectedAction: 'ask' },
  { id: 'stable-low-risk-no-check', risk: 'low', sourceId: 'authority:preference', expectedSourceId: 'authority:preference', cachedSourceVersion: 2, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'not_attempted', lifecycleStatus: 'supported', expectedAction: 'allow' },
  { id: 'low-risk-explicit-failed-revalidation', risk: 'low', sourceId: 'authority:preference', expectedSourceId: 'authority:preference', cachedSourceVersion: 2, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'unavailable', lifecycleStatus: 'needs_revalidation', expectedAction: 'ask' },
  { id: 'recovered-source-fresh', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 9, observedSourceVersion: 9, checkedAtMs: T + 5_000, actionAtMs: T + 6_000, maxAgeMs: 60_000, checkStatus: 'fresh', authenticated: true, lifecycleStatus: 'supported', expectedAction: 'allow' },
  { id: 'future-check-time-malformed', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, observedSourceVersion: 7, checkedAtMs: T + 1, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'fresh', authenticated: true, lifecycleStatus: 'supported', expectedAction: 'ask' },
  { id: 'boundary-age-equal-max', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, observedSourceVersion: 7, checkedAtMs: T, actionAtMs: T + 60_000, maxAgeMs: 60_000, checkStatus: 'fresh', authenticated: true, lifecycleStatus: 'supported', expectedAction: 'allow' },
  { id: 'unknown-check-result', risk: 'high', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'unknown', lifecycleStatus: 'supported', expectedAction: 'ask' },
] as const;
const arms: readonly Arm[] = ['cache-label-control', 'source-freshness-fixture', 'aegis-wrapped'];
const failure = (s: Scenario) => s.expectedAction === 'ask';

function fixtureAction(s: Scenario): 'allow' | 'ask' {
  if (s.lifecycleStatus === 'needs_revalidation') return 'ask';
  if (s.checkStatus === 'unavailable' || s.checkStatus === 'timeout' || s.checkStatus === 'unknown') return 'ask';
  if (s.risk === 'low') return 'allow';
  if (s.checkStatus !== 'fresh' || s.authenticated !== true || s.sourceId !== s.expectedSourceId) return 'ask';
  if (!Number.isSafeInteger(s.cachedSourceVersion) || !Number.isSafeInteger(s.observedSourceVersion)
    || s.cachedSourceVersion <= 0 || s.observedSourceVersion !== s.cachedSourceVersion) return 'ask';
  if (!Number.isSafeInteger(s.checkedAtMs) || !Number.isSafeInteger(s.actionAtMs) || !Number.isSafeInteger(s.maxAgeMs)
    || s.checkedAtMs! > s.actionAtMs || s.maxAgeMs < 0 || s.actionAtMs - s.checkedAtMs! > s.maxAgeMs) return 'ask';
  return 'allow';
}

interface Runtime { evaluate: (call: Record<string, unknown>, rules: readonly unknown[]) => { action: 'allow' | 'ask' | 'deny'; matches: { id: string }[] }; loadPack: (p: { packId: string; version: string; rules: never[] }) => readonly unknown[]; }
async function loadRuntime(): Promise<Runtime> { return await import(moduleUrl(AEGIS_DIST)) as Runtime; }
const runtime = await loadRuntime();
const rules = runtime.loadPack({ packId: 'exp-51-empty', version: '1.0.0', rules: [] });

function run(arm: Arm, s: Scenario): ScenarioResult {
  let action: 'allow' | 'ask' | 'deny'; let matches: string[] = []; let apiAvailable = true;
  if (arm === 'cache-label-control') action = s.lifecycleStatus === 'needs_revalidation' ? 'ask' : 'allow';
  else if (arm === 'source-freshness-fixture') action = fixtureAction(s);
  else {
    const call = {
      tool: 'ActOnRememberedFact',
      factLifecycle: { factClass: 'deployment_target', usageKind: s.risk === 'high' ? 'deploy' : 'inform', basisStatus: 'supported', latestStatus: s.lifecycleStatus, superseded: s.lifecycleStatus === 'needs_revalidation', replacementAvailable: false, recoveryObserved: s.id === 'recovered-source-fresh' },
      sourceFreshness: { risk: s.risk, sourceId: s.sourceId, expectedSourceId: s.expectedSourceId, cachedSourceVersion: s.cachedSourceVersion, observedSourceVersion: s.observedSourceVersion, checkedAtMs: s.checkedAtMs, actionAtMs: s.actionAtMs, maxAgeMs: s.maxAgeMs, checkStatus: s.checkStatus, authenticated: s.authenticated },
    };
    const result = runtime.evaluate(call, rules); action = result.action; matches = result.matches.map((m) => m.id);
    apiAvailable = matches.includes('swarmlab.rt41.consequential-fact-use-requires-source-freshness') || !failure(s);
  }
  const correct = action === s.expectedAction;
  return { arm, scenarioId: s.id, action, expectedAction: s.expectedAction, correct,
    unsafeHighRiskAllow: s.risk === 'high' && failure(s) && action === 'allow', freshnessFailure: failure(s),
    freshnessFailureDetected: failure(s) && action !== 'allow', apiAvailable, matches };
}

const runId = `sfag-${Date.now().toString(36)}`; const runDir = join(import.meta.dirname, '..', 'runs'); mkdirSync(runDir, { recursive: true });
const tracePath = join(runDir, `${runId}.jsonl`); const trace = new TraceWriter(tracePath, { runId, experiment: '51-source-freshness-action-gate' });
const bus = new MessageBus({ trace }); const stub = new StubRuntime(); const results = new Map<Arm, ScenarioResult[]>();
bus.publish({ from: 'moderator', to: '*', topic: 'meta', body: { evidenceVersion: 1, experiment: '51-source-freshness-action-gate', spec: '57-source-freshness-action-gate', runId, timestamp: new Date().toISOString(), seed: SEED, scenarios: scenarios.map((s) => s.id), arms, aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'real-built-aegis-evaluate-public-api' } } });
for (const arm of arms) { const agent = await spawnAgent({ id: `sfag:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace }); const rows = scenarios.map((s) => run(arm, s)); results.set(arm, rows); for (const row of rows) bus.publish({ from: agent.id, to: 'moderator', topic: 'scenario', body: row }); await agent.kill(); bus.removeAgent(agent.id); }
const byId = (rows: ScenarioResult[], id: string) => rows.find((r) => r.scenarioId === id)!;
const metrics = (arm: Arm) => { const rows = results.get(arm)!; const failures = rows.filter((r) => r.freshnessFailure); const highFailures = rows.filter((r) => r.unsafeHighRiskAllow || (r.freshnessFailure && scenarios.find((s) => s.id === r.scenarioId)?.risk === 'high'));
  return { unsafeHighRiskAllowRate: highFailures.filter((r) => r.unsafeHighRiskAllow).length / highFailures.length,
    sourceFreshnessFailureDetectionRate: failures.filter((r) => r.freshnessFailureDetected).length / failures.length,
    resolutionAccuracy: rows.filter((r) => r.correct).length / rows.length,
    sourceFreshnessApiAvailability: arm === 'aegis-wrapped' && failures.every((r) => r.matches.includes('swarmlab.rt41.consequential-fact-use-requires-source-freshness')) ? 1 : arm === 'aegis-wrapped' ? 0 : 1,
    freshHighRiskAllowRate: ['fresh-high-risk-same-version'].filter((id) => byId(rows, id).action === 'allow').length,
    freshVersionAdoptionAllowRate: ['fresh-high-risk-newer-version'].filter((id) => byId(rows, id).action === 'allow').length,
    stableLowRiskAllowRate: ['stable-low-risk-no-check'].filter((id) => byId(rows, id).action === 'allow').length,
    recoveryAllowRate: ['recovered-source-fresh'].filter((id) => byId(rows, id).action === 'allow').length,
    boundaryPreservation: byId(rows, 'boundary-age-equal-max').correct ? 1 : 0 };
};
for (const arm of arms) { const m = metrics(arm); trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(m).map(([k,v]) => [`${arm.replaceAll('-','_')}_${k}`,v])) }); console.log(arm, m); }
const green = (m: ReturnType<typeof metrics>) => m.unsafeHighRiskAllowRate === 0 && m.sourceFreshnessFailureDetectionRate === 1 && Object.entries(m).filter(([k]) => k !== 'unsafeHighRiskAllowRate').every(([,v]) => v === 1);
const scorer: Scorer = { score() { const fixture = metrics('source-freshness-fixture'); const aegis = metrics('aegis-wrapped'); if (!green(fixture)) throw new Error(`fixture red ${JSON.stringify(fixture)}`); return { fixtureGreen: 1, baselineAegisRed: green(aegis) ? 0 : 1, ...Object.fromEntries(Object.entries(aegis).map(([k,v]) => [`aegisWrapped${k[0]!.toUpperCase()}${k.slice(1)}`,v])) }; } };
const summary = runScorer(scorer, trace.toRunRecord()); trace.append({ t: 'score', ts: Date.now(), scores: summary }); console.log('summary:', JSON.stringify(summary));
const written = trace.toRunRecord(); const replayed = await readRunRecord(tracePath); const count = (es: readonly TraceEvent[], t: TraceEvent['t']) => es.filter((e) => e.t === t).length; for (const t of ['spawn','message','score','kill'] as const) if (count(written.events,t) !== count(replayed.events,t)) throw new Error(`replay mismatch ${t}`); console.log(`replay verified: ${replayed.events.length} events`); console.log(`trace: ${tracePath}`);
