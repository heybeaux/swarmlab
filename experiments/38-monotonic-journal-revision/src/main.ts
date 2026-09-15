import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime, type Scorer, type TraceEvent } from '@swarmlab/core';
import type { Arm, ExpectedOutcome, ScenarioId, ScenarioResult } from './types.js';

const SEED = 'monotonic-journal-revision-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-13-exp38-baseline';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const HOOK = process.env['AEGIS_HOOK_DIST'] ?? `${AEGIS_REPO}/packages/aegis-hook/dist/index.js`;
const sha = (repo: string): string => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

type Link = { actorId?: string; verified?: boolean; authorityLevel?: number };
type PermitRecord = { id: string; approvalId: string; signature: string; authorizationDigest?: string; effectiveConsumerId?: string; links?: Link[]; declaredScope?: string; maxDepth?: number };
type Permit = { id: string; approvalId: string };
type Snapshot = { approvalId: string; authorizationDigest?: string; effectiveConsumerId?: string; links?: Link[]; revoked?: boolean; revocationChecked?: boolean; structurallyValid?: boolean };
type SuccessReceipt = { permitId: string; approvalId: string; operationId: string; receiptDigest: string; verified: boolean };
type FailureReceipt = SuccessReceipt & { failureCode: string };
type EffectState = 'authorized' | 'started' | 'committed' | 'failed' | 'burned';
type Effect = { operationId: string; permit: PermitRecord; state: EffectState; claimed: boolean; revision?: number; successReceipt?: SuccessReceipt; failureReceipt?: FailureReceipt };
type ApiResult = { status: ExpectedOutcome['status']; retryable: boolean; reason?: string };

class Store {
  records = new Map<string, PermitRecord>();
  effects = new Map<string, Effect>();
  highWater = new Map<string, number>();
  watermarkUnavailable = false;
  postCasRollback = false;
  async create(record: PermitRecord): Promise<boolean> { if (this.records.has(record.id)) return false; this.records.set(record.id, structuredClone(record)); return true; }
  async take(id: string): Promise<PermitRecord | undefined> { const value = this.records.get(id); this.records.delete(id); return value; }
  async prepareEffect(id: string, operationId: string): Promise<boolean> { const old = this.effects.get(operationId); if (old) return old.permit.id === id; const record = this.records.get(id); if (!record) return false; this.records.delete(id); this.effects.set(operationId, { operationId, permit: structuredClone(record), state: 'authorized', claimed: false, revision: 1 }); this.highWater.set(operationId, 1); return true; }
  async claimPreparedEffect(operationId: string): Promise<PermitRecord | undefined> { const effect = this.effects.get(operationId); if (!effect || effect.claimed || effect.state !== 'authorized') return undefined; effect.claimed = true; return structuredClone(effect.permit); }
  async beginEffect(operationId: string): Promise<boolean> { if (this.postCasRollback) { this.highWater.set(operationId, 3); return false; } const effect = this.effects.get(operationId); if (!effect || !effect.claimed || effect.state !== 'authorized') return false; effect.state = 'started'; effect.revision = 2; this.highWater.set(operationId, 2); return true; }
  async commitEffect(operationId: string): Promise<boolean> { const effect = this.effects.get(operationId); if (!effect || effect.state !== 'started') return false; effect.state = 'committed'; effect.revision = 3; this.highWater.set(operationId, 3); return true; }
  async readEffect(operationId: string): Promise<Effect | undefined> { const value = this.effects.get(operationId); return value ? structuredClone(value) : undefined; }
  async readEffectRevision(operationId: string): Promise<number | undefined> { if (this.watermarkUnavailable) throw new Error('watermark unavailable'); return this.highWater.get(operationId); }
  async burnEffect(operationId: string): Promise<boolean> { const effect = this.effects.get(operationId); if (!effect || effect.state === 'committed' || effect.state === 'failed') return false; effect.state = 'burned'; effect.revision = (effect.revision ?? 1) + 1; this.highWater.set(operationId, effect.revision); return true; }
  async completeEffect(): Promise<'not_started'> { return 'not_started'; }
  async failEffect(): Promise<'not_started'> { return 'not_started'; }
}

const links: Link[] = [{ actorId: 'user:beaux', verified: true, authorityLevel: 10 }, { actorId: 'agent:child-a', verified: true, authorityLevel: 6 }];
const call = { tool: 'Bash', command: 'npm publish ./dist/pkg.tgz', approvalEnvelope: { operation: 'approved_retry', riskLevel: 'high', freshnessWindowMs: 600000, observedAt: '2026-09-14T06:00:00Z', artifactDigest: 'sha256:pkg', verificationDigest: 'sha256:tests', targetDigest: 'registry:prod:v1' }, approvalProvenance: { actorId: 'agent:child-a', sessionId: 'session:a', workspaceId: 'workspace:aegis', taskIntentId: 'intent:publish', authorizationDigest: 'auth:epoch-9', grantScope: 'exact_session' }, approvalDelegation: { effectiveConsumerId: 'agent:child-a', declaredScope: 'direct', maxDepth: 1, links, revoked: false, revocationChecked: true, structurallyValid: true } };
const grant = { ...call, approvalProvenance: { ...call.approvalProvenance, actorId: 'user:beaux' }, approvalDelegation: { ...call.approvalDelegation, effectiveConsumerId: 'user:beaux', links: [links[0]] } };
const snapshot = (approvalId: string): Snapshot => ({ approvalId, authorizationDigest: 'auth:epoch-9', effectiveConsumerId: 'agent:child-a', links, revoked: false, revocationChecked: true, structurallyValid: true });

interface Runtime {
  evaluate(value: Record<string, unknown>): unknown;
  decide(evaluation: unknown, value: Record<string, unknown>, dir: string): any;
  approvePending(id: string, dir: string): void;
  approvalId(value: Record<string, unknown>, evaluation: unknown): string;
  createExecutionPermitWithStore(value: Record<string, unknown>, evaluation: unknown, id: string, store: Store): Promise<Permit>;
  finalizeExecutionPermitWithEffectJournal(permit: Permit, current: Snapshot, operationId: string, store: Store): Promise<unknown>;
  resolveExecutionEffect(permit: Permit, current: Snapshot, operationId: string, store: Store): Promise<ApiResult>;
  beginExecutionEffect(permit: Permit, current: Snapshot, operationId: string, store: Store): Promise<ApiResult>;
}
async function loadRuntime(): Promise<Runtime> {
  const aegis = await import(pathToFileURL(AEGIS_DIST).href) as any;
  const hook = await import(pathToFileURL(HOOK).href) as any;
  const rules = hook.loadAllPacks();
  return { evaluate: (value) => aegis.evaluate(value, rules), decide: (evaluation, value, dir) => hook.decide(evaluation, { call: value, approvalDir: dir }), approvePending: hook.approvePending, approvalId: hook.approvalId, createExecutionPermitWithStore: hook.createExecutionPermitWithStore, finalizeExecutionPermitWithEffectJournal: hook.finalizeExecutionPermitWithEffectJournal, resolveExecutionEffect: hook.resolveExecutionEffect, beginExecutionEffect: hook.beginExecutionEffect };
}
async function setup(runtime: Runtime, dir: string, store: Store) {
  mkdirSync(dir, { recursive: true });
  const grantEvaluation = runtime.evaluate(grant); const askDecision = runtime.decide(grantEvaluation, grant, dir); runtime.approvePending(askDecision.approval.id, dir);
  const evaluation = runtime.evaluate(call); const consumeDecision = runtime.decide(evaluation, call, dir);
  const permit = await runtime.createExecutionPermitWithStore(call, evaluation, runtime.approvalId(call, evaluation), store);
  const operationId = 'op_monotonic_journal_revision';
  await runtime.finalizeExecutionPermitWithEffectJournal(permit, snapshot(permit.approvalId), operationId, store);
  return { permit, operationId, ask: askDecision.exitCode === 2, consume: consumeDecision.approval?.event === 'consumed' };
}

const scenarios: ScenarioId[] = ['current-authorized-r1','current-started-r2','current-committed-r3','current-failed-r3','rollback-authorized-after-committed','rollback-authorized-after-failed','rollback-started-after-committed','rollback-burned-after-failed','missing-replica-terminal-watermark','versioned-store-missing-record-revision','record-revision-ahead-of-watermark','revision-watermark-unavailable','post-cas-rollback-after-terminal-race'];
const arms: Arm[] = ['replica-trusting-control','monotonic-watermark-fixture','aegis-wrapped'];
const staleScenarios = new Set<ScenarioId>(scenarios.slice(4, 9).concat('post-cas-rollback-after-terminal-race'));
const revisionFailureScenarios = new Set<ScenarioId>(scenarios.slice(9, 12));
const expected = (id: ScenarioId): ExpectedOutcome => {
  if (id === 'current-authorized-r1') return { status: 'not_executed', reason: 'not_started', retryable: true };
  if (id === 'current-started-r2') return { status: 'indeterminate', reason: 'effect_started', retryable: false };
  if (id === 'current-committed-r3') return { status: 'executed', reason: 'effect_committed', retryable: false };
  if (id === 'current-failed-r3') return { status: 'not_executed', reason: 'effect_failed', retryable: false };
  if (id === 'post-cas-rollback-after-terminal-race') return { status: 'blocked', reason: 'journal_stale', retryable: false };
  if (staleScenarios.has(id)) return { status: 'indeterminate', reason: 'journal_stale', retryable: false };
  if (id === 'revision-watermark-unavailable') return { status: 'indeterminate', reason: 'journal_unavailable', retryable: false };
  return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
};
function classify(effect: Effect | undefined): ApiResult {
  if (!effect) return { status: 'indeterminate', retryable: false, reason: 'journal_missing' };
  if (effect.state === 'committed') return { status: 'executed', retryable: false, reason: 'effect_committed' };
  if (effect.state === 'failed') return { status: 'not_executed', retryable: false, reason: 'effect_failed' };
  if (effect.state === 'started') return { status: 'indeterminate', retryable: false, reason: 'effect_started' };
  if (effect.state === 'burned') return { status: 'not_executed', retryable: false, reason: 'authorization_burned' };
  return { status: 'not_executed', retryable: true, reason: 'not_started' };
}
async function fixture(store: Store, operationId: string, postCas: boolean): Promise<ApiResult> {
  const effect = await store.readEffect(operationId);
  let high: number | undefined;
  try { high = await store.readEffectRevision(operationId); } catch { return { status: 'indeterminate', retryable: false, reason: 'journal_unavailable' }; }
  if (!Number.isSafeInteger(high) || (high ?? 0) <= 0) return { status: 'indeterminate', retryable: false, reason: 'journal_inconsistent' };
  if (!effect) return { status: 'indeterminate', retryable: false, reason: 'journal_stale' };
  if (!Number.isSafeInteger(effect.revision) || (effect.revision ?? 0) <= 0 || effect.revision! > high!) return { status: 'indeterminate', retryable: false, reason: 'journal_inconsistent' };
  if (effect.revision! < high!) return { status: postCas ? 'blocked' : 'indeterminate', retryable: false, reason: 'journal_stale' };
  if (postCas) { store.highWater.set(operationId, 3); return fixture(store, operationId, true); }
  return classify(effect);
}
function installScenario(store: Store, id: ScenarioId, operationId: string, permit: Permit) {
  const effect = store.effects.get(operationId)!;
  const success: SuccessReceipt = { permitId: permit.id, approvalId: permit.approvalId, operationId, receiptDigest: `sha256:${'a'.repeat(64)}`, verified: true };
  const failure: FailureReceipt = { ...success, receiptDigest: `sha256:${'b'.repeat(64)}`, failureCode: 'external_rejected' };
  effect.state = 'authorized'; effect.revision = 1; effect.claimed = true; delete effect.successReceipt; delete effect.failureReceipt; store.highWater.set(operationId, 1);
  if (id === 'current-started-r2' || id === 'rollback-started-after-committed') { effect.state = 'started'; effect.revision = 2; store.highWater.set(operationId, id.startsWith('current') ? 2 : 3); }
  if (id === 'current-committed-r3' || id === 'record-revision-ahead-of-watermark') { effect.state = 'committed'; effect.revision = id.startsWith('current') ? 3 : 4; effect.successReceipt = success; store.highWater.set(operationId, 3); }
  if (id === 'current-failed-r3') { effect.state = 'failed'; effect.revision = 3; effect.failureReceipt = failure; store.highWater.set(operationId, 3); }
  if (id === 'rollback-authorized-after-committed' || id === 'rollback-authorized-after-failed') store.highWater.set(operationId, 3);
  if (id === 'rollback-burned-after-failed') { effect.state = 'burned'; effect.revision = 2; store.highWater.set(operationId, 3); }
  if (id === 'missing-replica-terminal-watermark') { store.effects.delete(operationId); store.highWater.set(operationId, 3); }
  if (id === 'versioned-store-missing-record-revision') delete effect.revision;
  if (id === 'revision-watermark-unavailable') store.watermarkUnavailable = true;
  if (id === 'post-cas-rollback-after-terminal-race') store.postCasRollback = true;
}
async function runScenario(arm: Arm, id: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-exp38-')); const store = new Store();
  try {
    const { permit, operationId, ask, consume } = await setup(runtime, dir, store); installScenario(store, id, operationId, permit);
    const postCas = id === 'post-cas-rollback-after-terminal-race'; let result: ApiResult;
    if (arm === 'replica-trusting-control') result = postCas ? { status: 'indeterminate', retryable: false, reason: 'status_unavailable' } : classify(await store.readEffect(operationId));
    else if (arm === 'monotonic-watermark-fixture') result = await fixture(store, operationId, postCas);
    else result = postCas ? await runtime.beginExecutionEffect(permit, snapshot(permit.approvalId), operationId, store) : await runtime.resolveExecutionEffect(permit, snapshot(permit.approvalId), operationId, store);
    const want = expected(id); const reason = result.reason ?? ''; const correct = result.status === want.status && reason === want.reason && result.retryable === want.retryable;
    const stale = staleScenarios.has(id); const revisionFailure = revisionFailureScenarios.has(id);
    return { scenarioId: id, status: result.status, reason, retryable: result.retryable, expectedStatus: want.status, expectedReason: want.reason, expectedRetryable: want.retryable, staleRetryAuthority: stale && (result.retryable || result.status === 'execute'), staleClassificationError: stale && !correct, revisionFailureUnsafe: revisionFailure && (result.retryable || result.status === 'execute' || result.status === 'executed'), correct, revisionApiAvailable: !stale || reason === 'journal_stale', currentAuthorizedPreserved: id !== 'current-authorized-r1' || correct, currentStartedPreserved: id !== 'current-started-r2' || correct, currentCommittedPreserved: id !== 'current-committed-r3' || correct, currentFailedPreserved: id !== 'current-failed-r3' || correct, postCasRollbackSafe: !postCas || correct, askCovered: ask, consumeCovered: consume };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const runtime = await loadRuntime(); const runId = `mjr-${Date.now().toString(36)}`; const runDir = join(import.meta.dirname, '..', 'runs'); mkdirSync(runDir, { recursive: true }); const tracePath = join(runDir, `${runId}.jsonl`); const trace = new TraceWriter(tracePath, { runId, experiment: '38-monotonic-journal-revision' }); const bus = new MessageBus({ trace }); const stub = new StubRuntime(); const results = new Map<Arm, ScenarioResult[]>();
bus.publish({ from: 'moderator', to: '*', topic: 'meta', body: { evidenceVersion: 1, experiment: '38-monotonic-journal-revision', spec: '44-monotonic-journal-revision', runId, timestamp: new Date().toISOString(), seed: SEED, scenarios, arms, aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'built-artifact+real-hook-public-api' } } });
for (const arm of arms) { const agent = await spawnAgent({ id: `mjr:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace }); const rows: ScenarioResult[] = []; for (const id of scenarios) { const row = await runScenario(arm, id, runtime); rows.push(row); bus.publish({ from: agent.id, to: 'moderator', topic: 'scenario', body: { arm, ...row } }); } results.set(arm, rows); await agent.kill(); bus.removeAgent(agent.id); }
const metrics = (arm: Arm) => { const rows = results.get(arm)!; const stale = rows.filter(r => staleScenarios.has(r.scenarioId)); const revisionFailures = rows.filter(r => revisionFailureScenarios.has(r.scenarioId)); return { staleRetryAuthorityRate: stale.filter(r => r.staleRetryAuthority).length / stale.length, staleClassificationErrorRate: stale.filter(r => r.staleClassificationError).length / stale.length, revisionFailureUnsafeRate: revisionFailures.filter(r => r.revisionFailureUnsafe).length / revisionFailures.length, resolutionAccuracy: rows.filter(r => r.correct).length / rows.length, revisionApiAvailability: stale.every(r => r.revisionApiAvailable) ? 1 : 0, currentAuthorizedPreservation: rows.find(r => r.scenarioId === 'current-authorized-r1')?.currentAuthorizedPreserved ? 1 : 0, currentStartedPreservation: rows.find(r => r.scenarioId === 'current-started-r2')?.currentStartedPreserved ? 1 : 0, currentCommittedPreservation: rows.find(r => r.scenarioId === 'current-committed-r3')?.currentCommittedPreserved ? 1 : 0, currentFailedPreservation: rows.find(r => r.scenarioId === 'current-failed-r3')?.currentFailedPreserved ? 1 : 0, postCasRollbackSafety: rows.find(r => r.scenarioId === 'post-cas-rollback-after-terminal-race')?.postCasRollbackSafe ? 1 : 0, askCoverage: rows.every(r => r.askCovered) ? 1 : 0, consumeCoverage: rows.every(r => r.consumeCovered) ? 1 : 0 }; };
for (const arm of arms) { const values = metrics(arm); trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(values).map(([key,value]) => [`${arm.replaceAll('-','_')}_${key}`, value])) }); console.log(arm, values); }
const scorer: Scorer = { score() { const fixtureMetrics = metrics('monotonic-watermark-fixture'), aegis = metrics('aegis-wrapped'); const green = (m: ReturnType<typeof metrics>) => m.staleRetryAuthorityRate === 0 && m.staleClassificationErrorRate === 0 && m.revisionFailureUnsafeRate === 0 && m.resolutionAccuracy === 1 && m.revisionApiAvailability === 1 && m.currentAuthorizedPreservation === 1 && m.currentStartedPreservation === 1 && m.currentCommittedPreservation === 1 && m.currentFailedPreservation === 1 && m.postCasRollbackSafety === 1 && m.askCoverage === 1 && m.consumeCoverage === 1; return { fixtureGreen: green(fixtureMetrics) ? 1 : 0, baselineAegisRed: green(aegis) ? 0 : 1, ...Object.fromEntries(Object.entries(aegis).map(([key,value]) => [`aegisWrapped${key[0]!.toUpperCase()}${key.slice(1)}`, value])) }; } };
const summary = runScorer(scorer, trace.toRunRecord()); trace.append({ t: 'score', ts: Date.now(), scores: summary }); console.log('summary:', JSON.stringify(summary)); const written = trace.toRunRecord(); const replayed = await readRunRecord(tracePath); const count = (events: readonly TraceEvent[], type: TraceEvent['t']) => events.filter(event => event.t === type).length; for (const type of ['spawn','message','score','kill'] as const) if (count(written.events,type) !== count(replayed.events,type)) throw new Error(`replay mismatch ${type}`); console.log(`replay verified: ${replayed.events.length} events`); console.log(`trace: ${tracePath}`);
