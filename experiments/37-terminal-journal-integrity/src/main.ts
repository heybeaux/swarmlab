import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime, type Scorer, type TraceEvent } from '@swarmlab/core';
import type { Arm, ExpectedResolution, ScenarioId, ScenarioResult } from './types.js';

const SEED = 'terminal-journal-integrity-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-12-exp37-baseline';
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
type Effect = { operationId: string; permit: PermitRecord; state: EffectState; claimed: boolean; successReceipt?: unknown; failureReceipt?: unknown };
type ApiResult = { status: ExpectedResolution['status']; retryable: boolean; reason?: string };

class Store {
  records = new Map<string, PermitRecord>();
  effects = new Map<string, Effect>();
  async create(record: PermitRecord): Promise<boolean> { if (this.records.has(record.id)) return false; this.records.set(record.id, structuredClone(record)); return true; }
  async take(id: string): Promise<PermitRecord | undefined> { const record = this.records.get(id); this.records.delete(id); return record; }
  async prepareEffect(id: string, operationId: string): Promise<boolean> { const old = this.effects.get(operationId); if (old) return old.permit.id === id; const record = this.records.get(id); if (!record) return false; this.records.delete(id); this.effects.set(operationId, { operationId, permit: structuredClone(record), state: 'authorized', claimed: false }); return true; }
  async claimPreparedEffect(operationId: string): Promise<PermitRecord | undefined> { const effect = this.effects.get(operationId); if (!effect || effect.claimed || effect.state !== 'authorized') return undefined; effect.claimed = true; return structuredClone(effect.permit); }
  async beginEffect(operationId: string): Promise<boolean> { const effect = this.effects.get(operationId); if (!effect || !effect.claimed || effect.state !== 'authorized') return false; effect.state = 'started'; return true; }
  async commitEffect(operationId: string): Promise<boolean> { const effect = this.effects.get(operationId); if (!effect || effect.state !== 'started') return false; effect.state = 'committed'; return true; }
  async readEffect(operationId: string): Promise<Effect | undefined> { const effect = this.effects.get(operationId); return effect ? structuredClone(effect) : undefined; }
  async burnEffect(operationId: string): Promise<boolean> { const effect = this.effects.get(operationId); if (!effect || effect.state === 'committed' || effect.state === 'failed') return false; effect.state = 'burned'; return true; }
  async completeEffect(): Promise<'not_started'> { return 'not_started'; }
  async failEffect(): Promise<'not_started'> { return 'not_started'; }
}

const links: Link[] = [{ actorId: 'user:beaux', verified: true, authorityLevel: 10 }, { actorId: 'agent:child-a', verified: true, authorityLevel: 6 }];
const call = { tool: 'Bash', command: 'npm publish ./dist/pkg.tgz', approvalEnvelope: { operation: 'approved_retry', riskLevel: 'high', freshnessWindowMs: 600000, observedAt: '2026-09-13T06:00:00Z', artifactDigest: 'sha256:pkg', verificationDigest: 'sha256:tests', targetDigest: 'registry:prod:v1' }, approvalProvenance: { actorId: 'agent:child-a', sessionId: 'session:a', workspaceId: 'workspace:aegis', taskIntentId: 'intent:publish', authorizationDigest: 'auth:epoch-8', grantScope: 'exact_session' }, approvalDelegation: { effectiveConsumerId: 'agent:child-a', declaredScope: 'direct', maxDepth: 1, links, revoked: false, revocationChecked: true, structurallyValid: true } };
const grant = { ...call, approvalProvenance: { ...call.approvalProvenance, actorId: 'user:beaux' }, approvalDelegation: { ...call.approvalDelegation, effectiveConsumerId: 'user:beaux', links: [links[0]] } };
const snapshot = (approvalId: string): Snapshot => ({ approvalId, authorizationDigest: 'auth:epoch-8', effectiveConsumerId: 'agent:child-a', links, revoked: false, revocationChecked: true, structurallyValid: true });

interface Runtime {
  evaluate(value: Record<string, unknown>): unknown;
  decide(evaluation: unknown, value: Record<string, unknown>, dir: string): any;
  approvePending(id: string, dir: string): void;
  approvalId(value: Record<string, unknown>, evaluation: unknown): string;
  createExecutionPermitWithStore(value: Record<string, unknown>, evaluation: unknown, id: string, store: Store): Promise<Permit>;
  finalizeExecutionPermitWithEffectJournal(permit: Permit, current: Snapshot, operationId: string, store: Store): Promise<unknown>;
  resolveExecutionEffect(permit: Permit, current: Snapshot, operationId: string, store: Store): Promise<ApiResult>;
}
async function loadRuntime(): Promise<Runtime> {
  const aegis = await import(pathToFileURL(AEGIS_DIST).href) as any;
  const hook = await import(pathToFileURL(HOOK).href) as any;
  const rules = hook.loadAllPacks();
  return { evaluate: (value) => aegis.evaluate(value, rules), decide: (evaluation, value, dir) => hook.decide(evaluation, { call: value, approvalDir: dir }), approvePending: hook.approvePending, approvalId: hook.approvalId, createExecutionPermitWithStore: hook.createExecutionPermitWithStore, finalizeExecutionPermitWithEffectJournal: hook.finalizeExecutionPermitWithEffectJournal, resolveExecutionEffect: hook.resolveExecutionEffect };
}
async function setup(runtime: Runtime, dir: string, store: Store) {
  mkdirSync(dir, { recursive: true });
  const grantEvaluation = runtime.evaluate(grant); const askDecision = runtime.decide(grantEvaluation, grant, dir); runtime.approvePending(askDecision.approval.id, dir);
  const evaluation = runtime.evaluate(call); const consumeDecision = runtime.decide(evaluation, call, dir);
  const permit = await runtime.createExecutionPermitWithStore(call, evaluation, runtime.approvalId(call, evaluation), store);
  const operationId = 'op_terminal_journal_integrity';
  await runtime.finalizeExecutionPermitWithEffectJournal(permit, snapshot(permit.approvalId), operationId, store);
  return { permit, operationId, ask: askDecision.exitCode === 2, consume: consumeDecision.approval?.event === 'consumed' };
}

const scenarios: ScenarioId[] = ['coherent-committed-success','coherent-failed-negative','clean-authorized','clean-started','committed-missing-success-receipt','failed-missing-failure-receipt','committed-opposite-failure-receipt','failed-opposite-success-receipt','committed-both-receipts','failed-both-receipts','committed-malformed-success-receipt','failed-misbound-failure-receipt','authorized-with-success-receipt','started-with-failure-receipt'];
const arms: Arm[] = ['state-only-control','coherence-fixture','aegis-wrapped'];
const inconsistent = new Set<ScenarioId>(scenarios.slice(4));
const receiptBearingNonterminal = new Set<ScenarioId>(['authorized-with-success-receipt','started-with-failure-receipt']);
const expected = (scenarioId: ScenarioId): ExpectedResolution => {
  if (scenarioId === 'coherent-committed-success') return { status: 'executed', reason: 'effect_committed', retryable: false };
  if (scenarioId === 'coherent-failed-negative') return { status: 'not_executed', reason: 'effect_failed', retryable: false };
  if (scenarioId === 'clean-authorized') return { status: 'not_executed', reason: 'not_started', retryable: true };
  if (scenarioId === 'clean-started') return { status: 'indeterminate', reason: 'effect_started', retryable: false };
  return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
};
function validSuccess(value: unknown, permit: Permit, operationId: string): boolean { if (!value || typeof value !== 'object') return false; const r = value as Record<string, unknown>; return r.permitId === permit.id && r.approvalId === permit.approvalId && r.operationId === operationId && typeof r.receiptDigest === 'string' && /^sha256:[a-f0-9]{64}$/.test(r.receiptDigest) && r.verified === true; }
function validFailure(value: unknown, permit: Permit, operationId: string): boolean { if (!validSuccess(value, permit, operationId)) return false; const r = value as Record<string, unknown>; return typeof r.failureCode === 'string' && /^[a-z0-9_]{1,64}$/.test(r.failureCode); }
function coherent(effect: Effect, permit: Permit, operationId: string): boolean {
  const hasSuccess = effect.successReceipt !== undefined; const hasFailure = effect.failureReceipt !== undefined;
  if (effect.state === 'committed') return validSuccess(effect.successReceipt, permit, operationId) && !hasFailure;
  if (effect.state === 'failed') return validFailure(effect.failureReceipt, permit, operationId) && !hasSuccess;
  return !hasSuccess && !hasFailure;
}
function stateOnly(effect: Effect): ApiResult { if (effect.state === 'committed') return { status: 'executed', retryable: false, reason: 'effect_committed' }; if (effect.state === 'failed') return { status: 'not_executed', retryable: false, reason: 'effect_failed' }; if (effect.state === 'started') return { status: 'indeterminate', retryable: false, reason: 'effect_started' }; return { status: 'not_executed', retryable: true, reason: 'not_started' }; }
function fixture(effect: Effect, permit: Permit, operationId: string): ApiResult { return coherent(effect, permit, operationId) ? stateOnly(effect) : { status: 'indeterminate', retryable: false, reason: 'journal_inconsistent' }; }
function installScenario(store: Store, scenarioId: ScenarioId, operationId: string, permit: Permit) {
  const effect = store.effects.get(operationId)!;
  const success: SuccessReceipt = { permitId: permit.id, approvalId: permit.approvalId, operationId, receiptDigest: `sha256:${'a'.repeat(64)}`, verified: true };
  const failure: FailureReceipt = { ...success, receiptDigest: `sha256:${'b'.repeat(64)}`, failureCode: 'external_rejected' };
  delete effect.successReceipt; delete effect.failureReceipt;
  if (scenarioId.includes('committed')) effect.state = 'committed'; else if (scenarioId.includes('failed')) effect.state = 'failed'; else if (scenarioId.includes('started')) effect.state = 'started'; else effect.state = 'authorized';
  if (scenarioId === 'coherent-committed-success' || scenarioId === 'authorized-with-success-receipt' || scenarioId === 'failed-opposite-success-receipt') effect.successReceipt = success;
  if (scenarioId === 'coherent-failed-negative' || scenarioId === 'started-with-failure-receipt' || scenarioId === 'committed-opposite-failure-receipt') effect.failureReceipt = failure;
  if (scenarioId === 'committed-both-receipts' || scenarioId === 'failed-both-receipts') { effect.successReceipt = success; effect.failureReceipt = failure; }
  if (scenarioId === 'committed-malformed-success-receipt') effect.successReceipt = { ...success, receiptDigest: 'sha256:not-a-digest' };
  if (scenarioId === 'failed-misbound-failure-receipt') effect.failureReceipt = { ...failure, permitId: 'permit_000000000000000000000000' };
}

async function runScenario(arm: Arm, scenarioId: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-exp37-')); const store = new Store();
  try {
    const { permit, operationId, ask, consume } = await setup(runtime, dir, store); installScenario(store, scenarioId, operationId, permit); const effect = store.effects.get(operationId)!;
    let result: ApiResult;
    if (arm === 'state-only-control') result = stateOnly(effect);
    else if (arm === 'coherence-fixture') result = fixture(effect, permit, operationId);
    else result = await runtime.resolveExecutionEffect(permit, snapshot(permit.approvalId), operationId, store);
    const want = expected(scenarioId); const reason = result.reason ?? '';
    const correct = result.status === want.status && reason === want.reason && result.retryable === want.retryable;
    return { scenarioId, status: result.status, reason, retryable: result.retryable, expectedStatus: want.status, expectedReason: want.reason, expectedRetryable: want.retryable, falseTerminalCertainty: inconsistent.has(scenarioId) && !receiptBearingNonterminal.has(scenarioId) && result.status !== 'indeterminate', unsafeRetry: receiptBearingNonterminal.has(scenarioId) && result.retryable, classificationError: !correct, correct, apiAvailable: true, coherentSuccessPreserved: scenarioId !== 'coherent-committed-success' || correct, coherentFailurePreserved: scenarioId !== 'coherent-failed-negative' || correct, cleanRetryPreserved: scenarioId !== 'clean-authorized' || correct, startedFailClosedSafe: scenarioId !== 'clean-started' || correct, askCovered: ask, consumeCovered: consume };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const runtime = await loadRuntime(); const runId = `tji-${Date.now().toString(36)}`; const runDir = join(import.meta.dirname, '..', 'runs'); mkdirSync(runDir, { recursive: true }); const tracePath = join(runDir, `${runId}.jsonl`); const trace = new TraceWriter(tracePath, { runId, experiment: '37-terminal-journal-integrity' }); const bus = new MessageBus({ trace }); const stub = new StubRuntime(); const results = new Map<Arm, ScenarioResult[]>();
bus.publish({ from: 'moderator', to: '*', topic: 'meta', body: { evidenceVersion: 1, experiment: '37-terminal-journal-integrity', spec: '43-terminal-journal-integrity', runId, timestamp: new Date().toISOString(), seed: SEED, scenarios, arms, aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'built-artifact+real-hook-public-api' } } });
for (const arm of arms) { const agent = await spawnAgent({ id: `tji:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace }); const rows: ScenarioResult[] = []; for (const scenarioId of scenarios) { const row = await runScenario(arm, scenarioId, runtime); rows.push(row); bus.publish({ from: agent.id, to: 'moderator', topic: 'scenario', body: { arm, ...row } }); } results.set(arm, rows); await agent.kill(); bus.removeAgent(agent.id); }
const metrics = (arm: Arm) => { const rows = results.get(arm)!; const subsetRate = (ids: Set<ScenarioId>, key: keyof ScenarioResult) => { const subset = rows.filter(row => ids.has(row.scenarioId)); return subset.filter(row => row[key] === true).length / subset.length; }; return { falseTerminalCertaintyRate: subsetRate(new Set(scenarios.slice(4,12)), 'falseTerminalCertainty'), unsafeRetryRate: subsetRate(receiptBearingNonterminal, 'unsafeRetry'), integrityClassificationErrorRate: rows.filter(row => row.classificationError).length / rows.length, resolutionAccuracy: rows.filter(row => row.correct).length / rows.length, integrityApiAvailability: rows.filter(row => row.apiAvailable).length / rows.length, coherentSuccessPreservation: rows.find(row => row.scenarioId === 'coherent-committed-success')?.coherentSuccessPreserved ? 1 : 0, coherentFailurePreservation: rows.find(row => row.scenarioId === 'coherent-failed-negative')?.coherentFailurePreserved ? 1 : 0, cleanRetryPreservation: rows.find(row => row.scenarioId === 'clean-authorized')?.cleanRetryPreserved ? 1 : 0, startedFailClosedSafety: rows.find(row => row.scenarioId === 'clean-started')?.startedFailClosedSafe ? 1 : 0, askCoverage: rows.every(row => row.askCovered) ? 1 : 0, consumeCoverage: rows.every(row => row.consumeCovered) ? 1 : 0 }; };
for (const arm of arms) { const values = metrics(arm); trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(values).map(([key,value]) => [`${arm.replaceAll('-','_')}_${key}`, value])) }); console.log(arm, values); }
const scorer: Scorer = { score() { const fixtureMetrics = metrics('coherence-fixture'), aegis = metrics('aegis-wrapped'); const green = (m: ReturnType<typeof metrics>) => m.falseTerminalCertaintyRate === 0 && m.unsafeRetryRate === 0 && m.integrityClassificationErrorRate === 0 && m.resolutionAccuracy === 1 && m.integrityApiAvailability === 1 && m.coherentSuccessPreservation === 1 && m.coherentFailurePreservation === 1 && m.cleanRetryPreservation === 1 && m.startedFailClosedSafety === 1 && m.askCoverage === 1 && m.consumeCoverage === 1; return { fixtureGreen: green(fixtureMetrics) ? 1 : 0, baselineAegisRed: green(aegis) ? 0 : 1, ...Object.fromEntries(Object.entries(aegis).map(([key,value]) => [`aegisWrapped${key[0]!.toUpperCase()}${key.slice(1)}`, value])) }; } };
const summary = runScorer(scorer, trace.toRunRecord()); trace.append({ t: 'score', ts: Date.now(), scores: summary }); console.log('summary:', JSON.stringify(summary)); const written = trace.toRunRecord(); const replayed = await readRunRecord(tracePath); const count = (events: readonly TraceEvent[], type: TraceEvent['t']) => events.filter(event => event.t === type).length; for (const type of ['spawn','message','score','kill'] as const) if (count(written.events,type) !== count(replayed.events,type)) throw new Error(`replay mismatch ${type}`); console.log(`replay verified: ${replayed.events.length} events`); console.log(`trace: ${tracePath}`);
