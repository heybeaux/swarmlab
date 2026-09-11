import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime,
  type Scorer, type TraceEvent,
} from '@swarmlab/core';
import type { Arm, FailureStatus, ScenarioId, ScenarioResult } from './types.js';

const SEED = 'effect-failure-receipt-binding-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp35-baseline';
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
type Effect = { operationId: string; permit: PermitRecord; state: EffectState; claimed: boolean; successReceipt?: SuccessReceipt; failureReceipt?: FailureReceipt };
type FailureResult = { status: FailureStatus; reason?: string };

class Store {
  records = new Map<string, PermitRecord>();
  effects = new Map<string, Effect>();
  failureWritesUnavailable = 0;
  async create(record: PermitRecord): Promise<boolean> { if (this.records.has(record.id)) return false; this.records.set(record.id, structuredClone(record)); return true; }
  async take(id: string): Promise<PermitRecord | undefined> { const record = this.records.get(id); this.records.delete(id); return record; }
  async prepareEffect(id: string, operationId: string): Promise<boolean> { const old = this.effects.get(operationId); if (old) return old.permit.id === id; const record = this.records.get(id); if (!record) return false; this.records.delete(id); this.effects.set(operationId, { operationId, permit: structuredClone(record), state: 'authorized', claimed: false }); return true; }
  async claimPreparedEffect(operationId: string): Promise<PermitRecord | undefined> { const effect = this.effects.get(operationId); if (!effect || effect.claimed || effect.state !== 'authorized') return undefined; effect.claimed = true; return structuredClone(effect.permit); }
  async beginEffect(operationId: string): Promise<boolean> { const effect = this.effects.get(operationId); if (!effect || !effect.claimed || effect.state !== 'authorized') return false; effect.state = 'started'; return true; }
  async commitEffect(operationId: string): Promise<boolean> { const effect = this.effects.get(operationId); if (!effect || effect.state !== 'started') return false; effect.state = 'committed'; return true; }
  async readEffect(operationId: string): Promise<Effect | undefined> { const effect = this.effects.get(operationId); return effect ? structuredClone(effect) : undefined; }
  async burnEffect(operationId: string): Promise<boolean> { const effect = this.effects.get(operationId); if (!effect || effect.state === 'committed' || effect.state === 'failed') return false; effect.state = 'burned'; return true; }
  async completeEffect(operationId: string, receipt: SuccessReceipt): Promise<'committed'|'already_committed'|'conflict'|'not_started'> { const effect = this.effects.get(operationId); if (!effect || (effect.state !== 'started' && effect.state !== 'committed')) return 'not_started'; if (effect.successReceipt) return JSON.stringify(effect.successReceipt) === JSON.stringify(receipt) ? 'already_committed' : 'conflict'; if (effect.state === 'committed') return 'conflict'; effect.successReceipt = structuredClone(receipt); effect.state = 'committed'; return 'committed'; }
  async failEffect(operationId: string, receipt: FailureReceipt): Promise<'failed'|'already_failed'|'conflict'|'not_started'> { if (this.failureWritesUnavailable-- > 0) throw new Error('down'); const effect = this.effects.get(operationId); if (!effect || (effect.state !== 'started' && effect.state !== 'failed' && effect.state !== 'committed')) return 'not_started'; if (effect.state === 'committed' || effect.successReceipt) return 'conflict'; if (effect.failureReceipt) return JSON.stringify(effect.failureReceipt) === JSON.stringify(receipt) ? 'already_failed' : 'conflict'; effect.failureReceipt = structuredClone(receipt); effect.state = 'failed'; return 'failed'; }
}

const links: Link[] = [{ actorId: 'user:beaux', verified: true, authorityLevel: 10 }, { actorId: 'agent:child-a', verified: true, authorityLevel: 6 }];
const call = { tool: 'Bash', command: 'npm publish ./dist/pkg.tgz', approvalEnvelope: { operation: 'approved_retry', riskLevel: 'high', freshnessWindowMs: 600000, observedAt: '2026-09-10T06:00:00Z', artifactDigest: 'sha256:pkg', verificationDigest: 'sha256:tests', targetDigest: 'registry:prod:v1' }, approvalProvenance: { actorId: 'agent:child-a', sessionId: 'session:a', workspaceId: 'workspace:aegis', taskIntentId: 'intent:publish', authorizationDigest: 'auth:epoch-7', grantScope: 'exact_session' }, approvalDelegation: { effectiveConsumerId: 'agent:child-a', declaredScope: 'direct', maxDepth: 1, links, revoked: false, revocationChecked: true, structurallyValid: true } };
const grant = { ...call, approvalProvenance: { ...call.approvalProvenance, actorId: 'user:beaux' }, approvalDelegation: { ...call.approvalDelegation, effectiveConsumerId: 'user:beaux', links: [links[0]] } };
const snapshot = (approvalId: string): Snapshot => ({ approvalId, authorizationDigest: 'auth:epoch-7', effectiveConsumerId: 'agent:child-a', links, revoked: false, revocationChecked: true, structurallyValid: true });

interface Runtime {
  evaluate(value: Record<string, unknown>): unknown;
  decide(evaluation: unknown, value: Record<string, unknown>, dir: string): any;
  approvePending(id: string, dir: string): void;
  approvalId(value: Record<string, unknown>, evaluation: unknown): string;
  createExecutionPermitWithStore(value: Record<string, unknown>, evaluation: unknown, id: string, store: Store): Promise<Permit>;
  finalizeExecutionPermitWithEffectJournal(permit: Permit, current: Snapshot, operationId: string, store: Store): Promise<unknown>;
  beginExecutionEffect(permit: Permit, current: Snapshot, operationId: string, store: Store): Promise<unknown>;
  completeExecutionEffect(permit: Permit, operationId: string, receipt: SuccessReceipt, store: Store): Promise<unknown>;
  failExecutionEffect?: (permit: Permit, operationId: string, receipt: FailureReceipt, store: Store) => Promise<FailureResult>;
  resolveExecutionEffect(permit: Permit, current: Snapshot, operationId: string, store: Store): Promise<{ status: string; retryable: boolean; reason?: string }>;
}

async function loadRuntime(): Promise<Runtime> {
  const aegis = await import(pathToFileURL(AEGIS_DIST).href) as any;
  const hook = await import(pathToFileURL(HOOK).href) as any;
  const rules = hook.loadAllPacks();
  return { evaluate: (value) => aegis.evaluate(value, rules), decide: (evaluation, value, dir) => hook.decide(evaluation, { call: value, approvalDir: dir }), approvePending: hook.approvePending, approvalId: hook.approvalId, createExecutionPermitWithStore: hook.createExecutionPermitWithStore, finalizeExecutionPermitWithEffectJournal: hook.finalizeExecutionPermitWithEffectJournal, beginExecutionEffect: hook.beginExecutionEffect, completeExecutionEffect: hook.completeExecutionEffect, resolveExecutionEffect: hook.resolveExecutionEffect, ...(typeof hook.failExecutionEffect === 'function' ? { failExecutionEffect: hook.failExecutionEffect } : {}) };
}

async function setup(runtime: Runtime, dir: string, store: Store): Promise<{ permit: Permit; operationId: string; ask: boolean; consume: boolean }> {
  mkdirSync(dir, { recursive: true });
  const grantEvaluation = runtime.evaluate(grant); const askDecision = runtime.decide(grantEvaluation, grant, dir); runtime.approvePending(askDecision.approval.id, dir);
  const evaluation = runtime.evaluate(call); const consumeDecision = runtime.decide(evaluation, call, dir); const permit = await runtime.createExecutionPermitWithStore(call, evaluation, runtime.approvalId(call, evaluation), store); const operationId = 'op_failure_binding';
  await runtime.finalizeExecutionPermitWithEffectJournal(permit, snapshot(permit.approvalId), operationId, store); await runtime.beginExecutionEffect(permit, snapshot(permit.approvalId), operationId, store);
  return { permit, operationId, ask: askDecision.exitCode === 2, consume: consumeDecision.approval?.event === 'consumed' };
}

async function runScenario(arm: Arm, scenarioId: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-exp35-')); const store = new Store(); const apiAvailable = arm !== 'aegis-wrapped' || typeof runtime.failExecutionEffect === 'function';
  try {
    const { permit, operationId, ask, consume } = await setup(runtime, dir, store);
    let receipt: FailureReceipt = { permitId: permit.id, approvalId: permit.approvalId, operationId, receiptDigest: `sha256:${'b'.repeat(64)}`, verified: true, failureCode: 'external_rejected' };
    if (scenarioId === 'wrong-permit-failure') receipt = { ...receipt, permitId: 'permit_000000000000000000000000' };
    if (scenarioId === 'wrong-approval-failure') receipt = { ...receipt, approvalId: 'aegis_0000000000000000' };
    if (scenarioId === 'wrong-operation-failure') receipt = { ...receipt, operationId: 'op_other' };
    if (scenarioId === 'unverified-failure') receipt = { ...receipt, verified: false };
    if (scenarioId === 'missing-failure-digest') receipt = { ...receipt, receiptDigest: '' };
    if (scenarioId === 'failure-after-committed-success') await runtime.completeExecutionEffect(permit, operationId, { permitId: permit.id, approvalId: permit.approvalId, operationId, receiptDigest: `sha256:${'a'.repeat(64)}`, verified: true }, store);
    if (scenarioId === 'failure-store-unavailable') store.failureWritesUnavailable = 1;
    const fail = async (): Promise<FailureResult> => {
      if (arm === 'bound-failure-fixture') {
        if (receipt.permitId !== permit.id || receipt.approvalId !== permit.approvalId || receipt.operationId !== operationId || !/^sha256:[a-f0-9]{64}$/.test(receipt.receiptDigest) || !/^[a-z0-9_]{1,64}$/.test(receipt.failureCode)) return { status: 'blocked' };
        if (!receipt.verified) return { status: 'blocked' };
        try { const result = await store.failEffect(operationId, receipt); return { status: result === 'failed' || result === 'already_failed' ? 'failed' : 'blocked' }; } catch { return { status: 'indeterminate' }; }
      }
      if (arm === 'aegis-wrapped' && runtime.failExecutionEffect) return runtime.failExecutionEffect(permit, operationId, receipt, store);
      const resolution = await runtime.resolveExecutionEffect(permit, snapshot(permit.approvalId), operationId, store);
      return { status: resolution.status === 'not_executed' ? 'failed' : resolution.status === 'indeterminate' ? 'indeterminate' : 'blocked' };
    };
    let result = await fail();
    if (scenarioId === 'duplicate-valid-failure') result = await fail();
    if (scenarioId === 'conflicting-failure-receipt') { await fail(); receipt = { ...receipt, receiptDigest: `sha256:${'c'.repeat(64)}`, failureCode: 'different_failure' }; result = await fail(); }
    const expectedStatus: FailureStatus = ['valid-verified-failure', 'duplicate-valid-failure'].includes(scenarioId) ? 'failed' : scenarioId === 'failure-store-unavailable' ? 'indeterminate' : 'blocked';
    const knownFailure = ['valid-verified-failure', 'duplicate-valid-failure'].includes(scenarioId);
    const invalidFailure = !knownFailure && scenarioId !== 'failure-store-unavailable';
    const finalState = store.effects.get(operationId)?.state;
    return { scenarioId, status: result.status, expectedStatus, missedKnownFailure: knownFailure && result.status !== 'failed', falseFailure: invalidFailure && result.status === 'failed', misboundFailure: ['wrong-permit-failure', 'wrong-approval-failure', 'wrong-operation-failure'].includes(scenarioId) && result.status === 'failed', unverifiedFailure: ['unverified-failure', 'missing-failure-digest'].includes(scenarioId) && result.status === 'failed', committedDowngrade: scenarioId === 'failure-after-committed-success' && finalState !== 'committed', indeterminateFailureExecution: scenarioId === 'failure-store-unavailable' && result.status === 'failed', correct: result.status === expectedStatus, apiAvailable, askCovered: ask, consumeCovered: consume, idempotentFailureSafe: scenarioId !== 'duplicate-valid-failure' || result.status === 'failed', terminalMonotonicitySafe: scenarioId !== 'failure-after-committed-success' || finalState === 'committed' };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const scenarios: ScenarioId[] = ['valid-verified-failure', 'duplicate-valid-failure', 'wrong-permit-failure', 'wrong-approval-failure', 'wrong-operation-failure', 'unverified-failure', 'missing-failure-digest', 'failure-after-committed-success', 'conflicting-failure-receipt', 'failure-store-unavailable'];
const arms: Arm[] = ['started-only-control', 'bound-failure-fixture', 'aegis-wrapped'];
const runtime = await loadRuntime(); const runId = `efrb-${Date.now().toString(36)}`; const runDir = join(import.meta.dirname, '..', 'runs'); mkdirSync(runDir, { recursive: true }); const tracePath = join(runDir, `${runId}.jsonl`); const trace = new TraceWriter(tracePath, { runId, experiment: '35-effect-failure-receipt-binding' }); const bus = new MessageBus({ trace }); const stub = new StubRuntime(); const results = new Map<Arm, ScenarioResult[]>();
bus.publish({ from: 'moderator', to: '*', topic: 'meta', body: { evidenceVersion: 1, experiment: '35-effect-failure-receipt-binding', spec: '41-effect-failure-receipt-binding', runId, timestamp: new Date().toISOString(), seed: SEED, scenarios, arms, aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'built-artifact+real-hook-public-api' } } });
for (const arm of arms) { const agent = await spawnAgent({ id: `efrb:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace }); const rows: ScenarioResult[] = []; for (const scenarioId of scenarios) { const row = await runScenario(arm, scenarioId, runtime); rows.push(row); bus.publish({ from: agent.id, to: 'moderator', topic: 'scenario', body: { arm, ...row } }); } results.set(arm, rows); await agent.kill(); bus.removeAgent(agent.id); }
const metrics = (arm: Arm) => { const rows = results.get(arm)!; const rate = (key: keyof ScenarioResult) => rows.filter((row) => row[key] === true).length / rows.length; return { missedKnownFailureRate: rate('missedKnownFailure'), falseFailureRate: rate('falseFailure'), misboundFailureRate: rate('misboundFailure'), unverifiedFailureRate: rate('unverifiedFailure'), committedDowngradeRate: rate('committedDowngrade'), indeterminateFailureExecutionRate: rate('indeterminateFailureExecution'), failureAccuracy: rows.filter((row) => row.correct).length / rows.length, failureApiAvailability: rows.filter((row) => row.apiAvailable).length / rows.length, askCoverage: rows.filter((row) => row.askCovered).length / rows.length, consumeCoverage: rows.filter((row) => row.consumeCovered).length / rows.length, idempotentFailureSafety: rows.find((row) => row.scenarioId === 'duplicate-valid-failure')?.idempotentFailureSafe ? 1 : 0, terminalMonotonicitySafety: rows.find((row) => row.scenarioId === 'failure-after-committed-success')?.terminalMonotonicitySafe ? 1 : 0 }; };
for (const arm of arms) { const values = metrics(arm); trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(values).map(([key, value]) => [`${arm.replaceAll('-', '_')}_${key}`, value])) }); console.log(arm, values); }
const scorer: Scorer = { score() { const fixture = metrics('bound-failure-fixture'); const aegis = metrics('aegis-wrapped'); const green = (m: ReturnType<typeof metrics>) => m.missedKnownFailureRate === 0 && m.falseFailureRate === 0 && m.misboundFailureRate === 0 && m.unverifiedFailureRate === 0 && m.committedDowngradeRate === 0 && m.indeterminateFailureExecutionRate === 0 && m.failureAccuracy === 1 && m.failureApiAvailability === 1 && m.askCoverage === 1 && m.consumeCoverage === 1 && m.idempotentFailureSafety === 1 && m.terminalMonotonicitySafety === 1; return { fixtureGreen: green(fixture) ? 1 : 0, baselineAegisRed: green(aegis) ? 0 : 1, ...Object.fromEntries(Object.entries(aegis).map(([key, value]) => [`aegisWrapped${key[0]!.toUpperCase()}${key.slice(1)}`, value])) }; } };
const summary = runScorer(scorer, trace.toRunRecord()); trace.append({ t: 'score', ts: Date.now(), scores: summary }); console.log('summary:', JSON.stringify(summary)); const written = trace.toRunRecord(); const replayed = await readRunRecord(tracePath); const count = (events: readonly TraceEvent[], type: TraceEvent['t']) => events.filter((event) => event.t === type).length; for (const type of ['spawn', 'message', 'score', 'kill'] as const) if (count(written.events, type) !== count(replayed.events, type)) throw new Error(`replay mismatch ${type}`); console.log(`replay verified: ${replayed.events.length} events`); console.log(`trace: ${tracePath}`);
