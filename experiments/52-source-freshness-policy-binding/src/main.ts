import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime, type Scorer, type TraceEvent } from '@swarmlab/core';
import type { Arm, Scenario, ScenarioResult } from './types.js';

const SEED = 'source-freshness-policy-binding-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-10-01-exp52-policy-binding-baseline';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const BUILD_ID = process.env['AEGIS_BUILD_ID'] ?? '';
const moduleUrl = (path: string) => { const url = pathToFileURL(path); if (BUILD_ID) url.searchParams.set('build', BUILD_ID); return url.href; };
const sha = (repo: string) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const T = 1_800_000_000_000;
const current = { policyId: 'freshness:deploy', expectedPolicyId: 'freshness:deploy', policyVersion: 5, expectedPolicyVersion: 5, sourceVersionNamespace: 'deploy-target:v2', expectedSourceVersionNamespace: 'deploy-target:v2', expectedMaxAgeMs: 60_000, policyAuthenticated: true } as const;
const fresh = { risk: 'high', usageKind: 'deploy', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, observedSourceVersion: 7, checkedAtMs: T, actionAtMs: T + 1_000, maxAgeMs: 60_000, checkStatus: 'fresh', authenticated: true } as const;

const scenarios: readonly Scenario[] = [
  { id: 'current-policy-fresh', ...fresh, ...current, policyFailure: false, expectedAction: 'allow' },
  { id: 'current-policy-boundary-age', ...fresh, ...current, actionAtMs: T + 60_000, policyFailure: false, expectedAction: 'allow' },
  { id: 'current-policy-newer-source-version', ...fresh, ...current, cachedSourceVersion: 8, observedSourceVersion: 8, policyFailure: false, expectedAction: 'allow' },
  { id: 'rolled-back-policy-version', ...fresh, ...current, policyVersion: 4, policyFailure: true, expectedAction: 'ask' },
  { id: 'future-policy-version-mismatch', ...fresh, ...current, policyVersion: 6, policyFailure: true, expectedAction: 'ask' },
  { id: 'foreign-policy-identity', ...fresh, ...current, policyId: 'freshness:mirror', policyFailure: true, expectedAction: 'ask' },
  { id: 'foreign-version-namespace', ...fresh, ...current, sourceVersionNamespace: 'mirror-target:v2', policyFailure: true, expectedAction: 'ask' },
  { id: 'widened-max-age', ...fresh, ...current, checkedAtMs: T, actionAtMs: T + 90_000, maxAgeMs: 120_000, policyFailure: true, expectedAction: 'ask' },
  { id: 'narrowed-max-age-disagreement', ...fresh, ...current, maxAgeMs: 30_000, policyFailure: true, expectedAction: 'ask' },
  { id: 'unauthenticated-policy-envelope', ...fresh, ...current, policyAuthenticated: false, policyFailure: true, expectedAction: 'ask' },
  { id: 'missing-presented-policy-binding', ...fresh, expectedPolicyId: current.expectedPolicyId, expectedPolicyVersion: current.expectedPolicyVersion, expectedSourceVersionNamespace: current.expectedSourceVersionNamespace, expectedMaxAgeMs: current.expectedMaxAgeMs, policyFailure: true, expectedAction: 'ask' },
  { id: 'malformed-policy-version-zero', ...fresh, ...current, policyVersion: 0, policyFailure: true, expectedAction: 'ask' },
  { id: 'noncanonical-policy-identity', ...fresh, ...current, policyId: ' freshness:deploy', policyFailure: true, expectedAction: 'ask' },
  { id: 'noncanonical-version-namespace', ...fresh, ...current, sourceVersionNamespace: 'deploy-target:v2 ', policyFailure: true, expectedAction: 'ask' },
  { id: 'low-risk-no-check-no-policy', risk: 'low', usageKind: 'inform', sourceId: 'authority:preference', expectedSourceId: 'authority:preference', cachedSourceVersion: 2, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'not_attempted', policyFailure: false, expectedAction: 'allow' },
  { id: 'low-risk-explicit-revalidation-failure', risk: 'low', usageKind: 'inform', sourceId: 'authority:preference', expectedSourceId: 'authority:preference', cachedSourceVersion: 2, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'unavailable', policyFailure: false, expectedAction: 'ask' },
  { id: 'recovered-current-policy', ...fresh, ...current, policyFailure: false, expectedAction: 'allow' },
  { id: 'current-policy-stale-observation', ...fresh, ...current, checkedAtMs: T, actionAtMs: T + 60_001, policyFailure: false, expectedAction: 'ask' },
] as const;
const arms: readonly Arm[] = ['rt41-control', 'policy-binding-fixture', 'aegis-wrapped'];

const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value;
function rt41Action(s: Scenario): 'allow' | 'ask' {
  if (s.checkStatus === 'unavailable' || s.checkStatus === 'timeout' || s.checkStatus === 'unknown') return 'ask';
  if (s.checkStatus === 'not_attempted') return s.risk === 'high' || s.usageKind === 'deploy' ? 'ask' : 'allow';
  if (s.authenticated !== true || !validId(s.sourceId) || !validId(s.expectedSourceId) || s.sourceId !== s.expectedSourceId) return 'ask';
  if (!Number.isSafeInteger(s.cachedSourceVersion) || !Number.isSafeInteger(s.observedSourceVersion) || s.cachedSourceVersion <= 0 || s.cachedSourceVersion !== s.observedSourceVersion) return 'ask';
  if (!Number.isSafeInteger(s.checkedAtMs) || !Number.isSafeInteger(s.actionAtMs) || !Number.isSafeInteger(s.maxAgeMs) || s.checkedAtMs! < 0 || s.actionAtMs < 0 || s.maxAgeMs < 0 || s.checkedAtMs! > s.actionAtMs || s.actionAtMs - s.checkedAtMs! > s.maxAgeMs) return 'ask';
  return 'allow';
}
function fixtureAction(s: Scenario): 'allow' | 'ask' {
  const observation = rt41Action(s); if (observation === 'ask') return 'ask';
  const configured = s.expectedPolicyId !== undefined || s.expectedPolicyVersion !== undefined || s.expectedSourceVersionNamespace !== undefined || s.expectedMaxAgeMs !== undefined;
  if (!configured) return 'allow';
  if (s.policyAuthenticated !== true || !validId(s.policyId) || !validId(s.expectedPolicyId) || s.policyId !== s.expectedPolicyId) return 'ask';
  if (!Number.isSafeInteger(s.policyVersion) || !Number.isSafeInteger(s.expectedPolicyVersion) || s.policyVersion! <= 0 || s.policyVersion !== s.expectedPolicyVersion) return 'ask';
  if (!validId(s.sourceVersionNamespace) || !validId(s.expectedSourceVersionNamespace) || s.sourceVersionNamespace !== s.expectedSourceVersionNamespace) return 'ask';
  if (!Number.isSafeInteger(s.expectedMaxAgeMs) || s.expectedMaxAgeMs! < 0 || s.maxAgeMs !== s.expectedMaxAgeMs) return 'ask';
  return 'allow';
}

interface Runtime { evaluate: (call: Record<string, unknown>, rules: readonly unknown[]) => { action: 'allow' | 'ask' | 'deny'; matches: { id: string }[] }; loadPack: (pack: { packId: string; version: string; rules: never[] }) => readonly unknown[]; }
const runtime = await import(moduleUrl(AEGIS_DIST)) as Runtime;
const rules = runtime.loadPack({ packId: 'exp-52-empty', version: '1.0.0', rules: [] });
function run(arm: Arm, s: Scenario): ScenarioResult {
  let action: 'allow' | 'ask' | 'deny'; let matches: string[] = [];
  if (arm === 'rt41-control') action = rt41Action(s);
  else if (arm === 'policy-binding-fixture') action = fixtureAction(s);
  else {
    const result = runtime.evaluate({ tool: 'ActOnRememberedFact', factLifecycle: { factClass: 'deployment_target', usageKind: s.usageKind, basisStatus: 'supported', latestStatus: 'supported', superseded: false }, sourceFreshness: { risk: s.risk, sourceId: s.sourceId, expectedSourceId: s.expectedSourceId, cachedSourceVersion: s.cachedSourceVersion, observedSourceVersion: s.observedSourceVersion, checkedAtMs: s.checkedAtMs, actionAtMs: s.actionAtMs, maxAgeMs: s.maxAgeMs, checkStatus: s.checkStatus, authenticated: s.authenticated, policyId: s.policyId, expectedPolicyId: s.expectedPolicyId, policyVersion: s.policyVersion, expectedPolicyVersion: s.expectedPolicyVersion, sourceVersionNamespace: s.sourceVersionNamespace, expectedSourceVersionNamespace: s.expectedSourceVersionNamespace, expectedMaxAgeMs: s.expectedMaxAgeMs, policyAuthenticated: s.policyAuthenticated } }, rules);
    action = result.action; matches = result.matches.map((match) => match.id);
  }
  return { arm, scenarioId: s.id, action, expectedAction: s.expectedAction, correct: action === s.expectedAction, policyFailure: s.policyFailure, policyFailureDetected: s.policyFailure && action !== 'allow', unsafePolicyMismatchAllow: s.policyFailure && action === 'allow', matches };
}

const runId = `sfpb-${Date.now().toString(36)}`; const runDir = join(import.meta.dirname, '..', 'runs'); mkdirSync(runDir, { recursive: true });
const tracePath = join(runDir, `${runId}.jsonl`); const trace = new TraceWriter(tracePath, { runId, experiment: '52-source-freshness-policy-binding' });
const bus = new MessageBus({ trace }); const stub = new StubRuntime(); const results = new Map<Arm, ScenarioResult[]>();
bus.publish({ from: 'moderator', to: '*', topic: 'meta', body: { evidenceVersion: 1, experiment: '52-source-freshness-policy-binding', spec: '58-source-freshness-policy-binding', runId, timestamp: new Date().toISOString(), seed: SEED, scenarios: scenarios.map((s) => s.id), arms, aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'real-built-aegis-evaluate-public-api' } } });
for (const arm of arms) { const agent = await spawnAgent({ id: `sfpb:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace }); const rows = scenarios.map((scenario) => run(arm, scenario)); results.set(arm, rows); for (const row of rows) bus.publish({ from: agent.id, to: 'moderator', topic: 'scenario', body: row }); await agent.kill(); bus.removeAgent(agent.id); }
const byId = (rows: ScenarioResult[], id: string) => rows.find((row) => row.scenarioId === id)!;
const allowRate = (rows: ScenarioResult[], ids: string[]) => ids.filter((id) => byId(rows, id).action === 'allow').length / ids.length;
const metrics = (arm: Arm) => { const rows = results.get(arm)!; const failures = rows.filter((row) => row.policyFailure); return {
  unsafePolicyMismatchAllowRate: failures.filter((row) => row.unsafePolicyMismatchAllow).length / failures.length,
  policyMismatchDetectionRate: failures.filter((row) => row.policyFailureDetected).length / failures.length,
  resolutionAccuracy: rows.filter((row) => row.correct).length / rows.length,
  policyBindingApiAvailability: arm === 'aegis-wrapped' && failures.every((row) => row.matches.includes('swarmlab.rt42.source-freshness-requires-current-policy-binding')) ? 1 : arm === 'aegis-wrapped' ? 0 : 1,
  currentPolicyAllowRate: allowRate(rows, ['current-policy-fresh']),
  exactBoundaryAllowRate: allowRate(rows, ['current-policy-boundary-age']),
  newerSourceVersionAllowRate: allowRate(rows, ['current-policy-newer-source-version']),
  recoveryAllowRate: allowRate(rows, ['recovered-current-policy']),
  stableLowRiskAllowRate: allowRate(rows, ['low-risk-no-check-no-policy']),
  rt41StaleObservationPreservation: byId(rows, 'current-policy-stale-observation').correct ? 1 : 0,
}; };
for (const arm of arms) { const values = metrics(arm); trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(values).map(([key, value]) => [`${arm.replaceAll('-', '_')}_${key}`, value])) }); console.log(arm, values); }
const green = (values: ReturnType<typeof metrics>) => values.unsafePolicyMismatchAllowRate === 0 && Object.entries(values).filter(([key]) => key !== 'unsafePolicyMismatchAllowRate').every(([, value]) => value === 1);
const scorer: Scorer = { score() { const fixture = metrics('policy-binding-fixture'); const aegis = metrics('aegis-wrapped'); if (!green(fixture)) throw new Error(`fixture red ${JSON.stringify(fixture)}`); return { fixtureGreen: 1, baselineAegisRed: green(aegis) ? 0 : 1, ...Object.fromEntries(Object.entries(aegis).map(([key, value]) => [`aegisWrapped${key[0]!.toUpperCase()}${key.slice(1)}`, value])) }; } };
const summary = runScorer(scorer, trace.toRunRecord()); trace.append({ t: 'score', ts: Date.now(), scores: summary }); console.log('summary:', JSON.stringify(summary));
const written = trace.toRunRecord(); const replayed = await readRunRecord(tracePath); const count = (events: readonly TraceEvent[], type: TraceEvent['t']) => events.filter((event) => event.t === type).length; for (const type of ['spawn', 'message', 'score', 'kill'] as const) if (count(written.events, type) !== count(replayed.events, type)) throw new Error(`replay mismatch ${type}`); console.log(`replay verified: ${replayed.events.length} events`); console.log(`trace: ${tracePath}`);
