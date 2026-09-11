import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime, type Scorer, type TraceEvent } from '@swarmlab/core';
import type { Arm, Resolution, ScenarioId, ScenarioResult } from './types.js';

const SEED = 'execution-effect-commitment-journal-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp32-baseline';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const HOOK = process.env['AEGIS_HOOK_DIST'] ?? `${AEGIS_REPO}/packages/aegis-hook/dist/index.js`;
const sha = (repo: string) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

type Link = { actorId?: string; verified?: boolean; authorityLevel?: number; revoked?: boolean };
type RecordValue = { id: string; approvalId: string; signature: string; authorizationDigest?: string; effectiveConsumerId?: string; links?: Link[]; declaredScope?: string; maxDepth?: number };
type Permit = { id: string; approvalId: string };
type Snapshot = { approvalId: string; authorizationDigest?: string; effectiveConsumerId?: string; links?: Link[]; revoked?: boolean; revocationChecked?: boolean; structurallyValid?: boolean };
type FinalizationResult = { status: 'execute' | 'blocked' | 'indeterminate'; retryable?: boolean; reason?: string };
type ResolutionResult = { status: Resolution; retryable?: boolean; reason?: string };
type EffectState = 'authorized' | 'started' | 'committed' | 'burned';
type EffectRecord = { operationId: string; permit: RecordValue; state: EffectState; claimed: boolean };

class EffectJournalStore {
  readonly records = new Map<string, RecordValue>();
  readonly operations = new Map<string, RecordValue>();
  readonly effects = new Map<string, EffectRecord>();
  effectReadsUnavailable = 0;

  async create(record: RecordValue): Promise<boolean> {
    if (this.records.has(record.id)) return false;
    this.records.set(record.id, structuredClone(record));
    return true;
  }

  async take(id: string): Promise<RecordValue | undefined> {
    const record = this.records.get(id);
    this.records.delete(id);
    return record ? structuredClone(record) : undefined;
  }

  // RT-22 protocol. Its claim intentionally deletes the only operation record.
  async prepareTake(id: string, operationId: string): Promise<boolean> {
    if (this.operations.has(operationId)) return true;
    const record = this.records.get(id);
    if (!record) return false;
    this.records.delete(id);
    this.operations.set(operationId, structuredClone(record));
    return true;
  }

  async claimPreparedTake(operationId: string): Promise<RecordValue | undefined> {
    const record = this.operations.get(operationId);
    this.operations.delete(operationId);
    return record ? structuredClone(record) : undefined;
  }

  // RT-23 candidate protocol. Permit consumption and durable authorization creation are atomic.
  async prepareEffect(id: string, operationId: string): Promise<boolean> {
    const existing = this.effects.get(operationId);
    if (existing) return existing.permit.id === id;
    const record = this.records.get(id);
    if (!record) return false;
    this.records.delete(id);
    this.effects.set(operationId, { operationId, permit: structuredClone(record), state: 'authorized', claimed: false });
    return true;
  }

  // One caller receives the initial execute authority, but the journal entry is retained.
  async claimPreparedEffect(operationId: string): Promise<RecordValue | undefined> {
    const effect = this.effects.get(operationId);
    if (!effect || effect.claimed || effect.state !== 'authorized') return undefined;
    effect.claimed = true;
    return structuredClone(effect.permit);
  }

  async beginEffect(operationId: string): Promise<boolean> {
    const effect = this.effects.get(operationId);
    if (!effect || !effect.claimed || effect.state !== 'authorized') return false;
    effect.state = 'started';
    return true;
  }

  async commitEffect(operationId: string): Promise<boolean> {
    const effect = this.effects.get(operationId);
    if (!effect || effect.state !== 'started') return false;
    effect.state = 'committed';
    return true;
  }

  async readEffect(operationId: string): Promise<EffectRecord | undefined> {
    if (this.effectReadsUnavailable-- > 0) throw new Error('effect journal unavailable');
    const effect = this.effects.get(operationId);
    return effect ? structuredClone(effect) : undefined;
  }

  async burnEffect(operationId: string): Promise<boolean> {
    const effect = this.effects.get(operationId);
    if (!effect || effect.state === 'committed') return false;
    effect.state = 'burned';
    return true;
  }
}

const links: Link[] = [
  { actorId: 'user:beaux', verified: true, authorityLevel: 10 },
  { actorId: 'agent:child-a', verified: true, authorityLevel: 6 },
];
const call = {
  tool: 'Bash', command: 'npm publish ./dist/pkg.tgz',
  approvalEnvelope: { operation: 'approved_retry', riskLevel: 'high', freshnessWindowMs: 600000, observedAt: '2026-09-10T06:00:00Z', artifactDigest: 'sha256:pkg', verificationDigest: 'sha256:tests', targetDigest: 'registry:prod:v1' },
  approvalProvenance: { actorId: 'agent:child-a', sessionId: 'session:a', workspaceId: 'workspace:aegis', taskIntentId: 'intent:publish', authorizationDigest: 'auth:epoch-7', grantScope: 'exact_session' },
  approvalDelegation: { effectiveConsumerId: 'agent:child-a', declaredScope: 'direct', maxDepth: 1, links, revoked: false, revocationChecked: true, structurallyValid: true },
};
const grant = { ...call, approvalProvenance: { ...call.approvalProvenance, actorId: 'user:beaux' }, approvalDelegation: { ...call.approvalDelegation, effectiveConsumerId: 'user:beaux', links: [links[0]] } };
const snapshot = (approvalId: string, valid = true): Snapshot => ({ approvalId, authorizationDigest: valid ? 'auth:epoch-7' : 'auth:epoch-8', effectiveConsumerId: 'agent:child-a', links, revoked: false, revocationChecked: true, structurallyValid: true });

interface Runtime {
  evaluate(input: Record<string, unknown>): any;
  decide(evaluation: any, input: Record<string, unknown>, dir: string): any;
  approvePending(id: string, dir: string): void;
  approvalId(input: Record<string, unknown>, evaluation: any): string;
  createExecutionPermitWithStore(input: Record<string, unknown>, evaluation: any, id: string, store: EffectJournalStore): Promise<Permit>;
  finalizeExecutionPermitWithReconciliation: (permit: Permit, current: Snapshot, operationId: string, store: EffectJournalStore) => Promise<FinalizationResult>;
  finalizeExecutionPermitWithEffectJournal?: (permit: Permit, current: Snapshot, operationId: string, store: EffectJournalStore) => Promise<FinalizationResult>;
  resolveExecutionEffect?: (permit: Permit, current: Snapshot, operationId: string, store: EffectJournalStore) => Promise<ResolutionResult>;
}

async function loadRuntime(): Promise<Runtime> {
  const aegis = await import(pathToFileURL(AEGIS_DIST).href) as any;
  const hook = await import(pathToFileURL(HOOK).href) as any;
  const rules = hook.loadAllPacks();
  return {
    evaluate: (input) => aegis.evaluate(input, rules),
    decide: (evaluation, input, dir) => hook.decide(evaluation, { call: input, approvalDir: dir }),
    approvePending: hook.approvePending,
    approvalId: hook.approvalId,
    createExecutionPermitWithStore: hook.createExecutionPermitWithStore,
    finalizeExecutionPermitWithReconciliation: hook.finalizeExecutionPermitWithReconciliation,
    ...(typeof hook.finalizeExecutionPermitWithEffectJournal === 'function' ? { finalizeExecutionPermitWithEffectJournal: hook.finalizeExecutionPermitWithEffectJournal } : {}),
    ...(typeof hook.resolveExecutionEffect === 'function' ? { resolveExecutionEffect: hook.resolveExecutionEffect } : {}),
  };
}

async function setup(runtime: Runtime, dir: string, store: EffectJournalStore) {
  mkdirSync(dir, { recursive: true });
  const grantEvaluation = runtime.evaluate(grant);
  const askDecision = runtime.decide(grantEvaluation, grant, dir);
  if (!askDecision.approval) throw new Error('expected approval request');
  runtime.approvePending(askDecision.approval.id, dir);
  const evaluation = runtime.evaluate(call);
  const consumeDecision = runtime.decide(evaluation, call, dir);
  if (consumeDecision.exitCode !== 0) throw new Error('approval consumption failed');
  const approvalId = runtime.approvalId(call, evaluation);
  const permit = await runtime.createExecutionPermitWithStore(call, evaluation, approvalId, store);
  return { permit, ask: askDecision.exitCode === 2, consume: consumeDecision.approval?.event === 'consumed' };
}

function valid(record: RecordValue, permit: Permit, current: Snapshot): boolean {
  return record.id === permit.id && record.approvalId === permit.approvalId && current.approvalId === permit.approvalId && current.authorizationDigest === 'auth:epoch-7' && current.effectiveConsumerId === 'agent:child-a' && current.revoked === false && current.revocationChecked === true && current.structurallyValid === true;
}

async function fixtureAuthorize(permit: Permit, current: Snapshot, operationId: string, store: EffectJournalStore): Promise<FinalizationResult> {
  let prepared = false;
  try { prepared = await store.prepareEffect(permit.id, operationId); } catch { return { status: 'indeterminate', retryable: false, reason: 'store_unavailable' }; }
  if (!prepared) return { status: 'blocked', retryable: true, reason: 'not_taken' };
  let record: RecordValue | undefined;
  try { record = await store.claimPreparedEffect(operationId); } catch { return { status: 'indeterminate', retryable: false, reason: 'status_unavailable' }; }
  if (!record) return { status: 'blocked', retryable: false, reason: 'already_claimed' };
  if (!valid(record, permit, current)) { await store.burnEffect(operationId); return { status: 'blocked', retryable: false, reason: 'invalid_snapshot' }; }
  return { status: 'execute', retryable: false };
}

async function fixtureResolve(permit: Permit, current: Snapshot, operationId: string, store: EffectJournalStore): Promise<ResolutionResult> {
  let effect: EffectRecord | undefined;
  try { effect = await store.readEffect(operationId); } catch { return { status: 'indeterminate', retryable: false, reason: 'journal_unavailable' }; }
  if (!effect || effect.permit.id !== permit.id || effect.permit.approvalId !== permit.approvalId) return { status: 'indeterminate', retryable: false, reason: 'journal_missing' };
  if (effect.state === 'committed') return { status: 'executed', retryable: false };
  if (effect.state === 'started') return { status: 'indeterminate', retryable: false, reason: 'effect_started' };
  if (effect.state === 'burned') return { status: 'not_executed', retryable: false, reason: 'authorization_burned' };
  if (!valid(effect.permit, permit, current)) { await store.burnEffect(operationId); return { status: 'not_executed', retryable: false, reason: 'invalid_snapshot' }; }
  return { status: 'not_executed', retryable: true };
}

async function runScenario(arm: Arm, id: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const root = mkdtempSync(join(tmpdir(), 'aegis-exp32-'));
  const store = new EffectJournalStore();
  let ask = true, consume = true, executions = 0, postResolutionExecutions = 0;
  const apiAvailable = arm !== 'aegis-wrapped' || (typeof runtime.finalizeExecutionPermitWithEffectJournal === 'function' && typeof runtime.resolveExecutionEffect === 'function');
  let last: ResolutionResult = { status: 'indeterminate', retryable: false };
  try {
    const { permit, ask: asked, consume: consumed } = await setup(runtime, root, store);
    ask = asked; consume = consumed;
    const operationId = `op_${id.replaceAll('-', '_')}`;
    const current = snapshot(permit.approvalId);
    const authorize = async (): Promise<FinalizationResult> => {
      if (arm === 'journaling-fixture') return fixtureAuthorize(permit, current, operationId, store);
      if (arm === 'aegis-wrapped' && runtime.finalizeExecutionPermitWithEffectJournal) return runtime.finalizeExecutionPermitWithEffectJournal(permit, current, operationId, store);
      return runtime.finalizeExecutionPermitWithReconciliation(permit, current, operationId, store);
    };
    const resolve = async (fresh = current): Promise<ResolutionResult> => {
      if (arm === 'journaling-fixture') return fixtureResolve(permit, fresh, operationId, store);
      if (arm === 'aegis-wrapped' && runtime.resolveExecutionEffect) return runtime.resolveExecutionEffect(permit, fresh, operationId, store);
      const result = await runtime.finalizeExecutionPermitWithReconciliation(permit, fresh, operationId, store);
      return result.status === 'indeterminate'
        ? { status: 'indeterminate', retryable: false, ...(result.reason ? { reason: result.reason } : {}) }
        : result.status === 'blocked'
          ? { status: 'not_executed', retryable: result.retryable ?? false, ...(result.reason ? { reason: result.reason } : {}) }
          : { status: 'indeterminate', retryable: false, reason: 'authorization_replayed' };
    };
    const journalCapable = arm === 'journaling-fixture' || apiAvailable;
    const performEffect = async (afterResolution = false, recordOutcome = true) => {
      if (journalCapable) await store.beginEffect(operationId);
      executions += 1;
      if (afterResolution) postResolutionExecutions += 1;
      if (recordOutcome && journalCapable) await store.commitEffect(operationId);
    };

    const authorized = (await authorize()).status === 'execute';
    if (!authorized) throw new Error(`${arm}/${id}: initial authorization failed`);

    if (id === 'normal-effect-commit' || id === 'duplicate-resolve' || id === 'cross-host-resume') await performEffect(false, true);
    if (id === 'crash-after-effect-before-outcome') await performEffect(false, false);
    if (id === 'effect-journal-unavailable') store.effectReadsUnavailable = 1;

    const resumeSnapshot = id === 'invalid-snapshot-at-resume' ? snapshot(permit.approvalId, false) : current;
    last = await resolve(resumeSnapshot);
    if (last.status === 'not_executed' && last.retryable === true) await performEffect(true, true);
    if (id === 'duplicate-resolve') last = await resolve(resumeSnapshot);

    const expectedExecutions = id === 'effect-journal-unavailable' || id === 'invalid-snapshot-at-resume' ? 0 : 1;
    const expectedResolution: Resolution = id === 'normal-effect-commit' || id === 'duplicate-resolve' || id === 'cross-host-resume'
      ? 'executed'
      : id === 'crash-after-effect-before-outcome' || id === 'effect-journal-unavailable'
        ? 'indeterminate'
        : 'not_executed';
    const orphanedAuthorization = id === 'crash-after-authorize-before-effect' && executions === 0;
    const effectMisclassified = last.status !== expectedResolution;
    const unsafeDuplicateEffect = executions > expectedExecutions;
    const indeterminateEffectExecution = postResolutionExecutions > 0 && last.status === 'indeterminate';
    const legitimateResumeBlock = id === 'crash-after-authorize-before-effect' && executions === 0;
    const idempotentResolveSafe = id !== 'duplicate-resolve' || executions === 1;
    const correct = executions === expectedExecutions && last.status === expectedResolution && !indeterminateEffectExecution;
    return { scenarioId: id, executions, expectedExecutions, resolution: last.status, expectedResolution, authorized, orphanedAuthorization, effectMisclassified, unsafeDuplicateEffect, indeterminateEffectExecution, legitimateResumeBlock, correct, apiAvailable, askCovered: ask, consumeCovered: consume, idempotentResolveSafe };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const scenarios: ScenarioId[] = ['normal-effect-commit', 'crash-after-authorize-before-effect', 'crash-after-effect-before-outcome', 'duplicate-resolve', 'effect-journal-unavailable', 'invalid-snapshot-at-resume', 'cross-host-resume'];
const arms: Arm[] = ['destructive-control', 'journaling-fixture', 'aegis-wrapped'];
const runtime = await loadRuntime();
const runId = `eecj-${Date.now().toString(36)}`;
const runsDir = join(import.meta.dirname, '..', 'runs'); mkdirSync(runsDir, { recursive: true });
const file = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(file, { runId, experiment: '32-execution-effect-commitment-journal' });
const bus = new MessageBus({ trace }); const stub = new StubRuntime(); const all = new Map<Arm, ScenarioResult[]>();
bus.publish({ from: 'moderator', to: '*', topic: 'meta', body: { evidenceVersion: 1, experiment: '32-execution-effect-commitment-journal', spec: '38-execution-effect-commitment-journal', runId, timestamp: new Date().toISOString(), seed: SEED, scenarios, arms, aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'built-artifact+real-hook-public-api' } } });
for (const arm of arms) {
  const handle = await spawnAgent({ id: `eecj:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace });
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) { const result = await runScenario(arm, scenario, runtime); results.push(result); bus.publish({ from: handle.id, to: 'moderator', topic: 'scenario', body: { arm, ...result } }); }
  all.set(arm, results); await handle.kill(); bus.removeAgent(handle.id);
}
const metrics = (arm: Arm) => { const rows = all.get(arm)!; const rate = (key: keyof ScenarioResult) => rows.filter((row) => row[key] === true).length / rows.length; return { unsafeDuplicateEffectRate: rate('unsafeDuplicateEffect'), orphanedAuthorizationRate: rate('orphanedAuthorization'), effectMisclassificationRate: rate('effectMisclassified'), indeterminateEffectExecutionRate: rate('indeterminateEffectExecution'), legitimateResumeBlockRate: rate('legitimateResumeBlock'), effectResolutionAccuracy: rows.filter((row) => row.correct).length / rows.length, effectJournalApiAvailability: rows.filter((row) => row.apiAvailable).length / rows.length, askCoverage: rows.filter((row) => row.askCovered).length / rows.length, consumeCoverage: rows.filter((row) => row.consumeCovered).length / rows.length, idempotentResolveSafety: rows.find((row) => row.scenarioId === 'duplicate-resolve')?.idempotentResolveSafe ? 1 : 0 }; };
for (const arm of arms) { const value = metrics(arm); trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(value).map(([key, metric]) => [`${arm.replaceAll('-', '_')}_${key}`, metric])) }); console.log(arm, value); }
const scorer: Scorer = { score() { const fixture = metrics('journaling-fixture'), aegis = metrics('aegis-wrapped'); const green = (m: ReturnType<typeof metrics>) => m.unsafeDuplicateEffectRate === 0 && m.orphanedAuthorizationRate === 0 && m.effectMisclassificationRate === 0 && m.indeterminateEffectExecutionRate === 0 && m.legitimateResumeBlockRate === 0 && m.effectResolutionAccuracy === 1 && m.effectJournalApiAvailability === 1 && m.askCoverage === 1 && m.consumeCoverage === 1 && m.idempotentResolveSafety === 1; return { fixtureGreen: green(fixture) ? 1 : 0, baselineAegisRed: green(aegis) ? 0 : 1, ...Object.fromEntries(Object.entries(aegis).map(([key, metric]) => [`aegisWrapped${key[0]!.toUpperCase()}${key.slice(1)}`, metric])) }; } };
const summary = runScorer(scorer, trace.toRunRecord()); trace.append({ t: 'score', ts: Date.now(), scores: summary }); console.log('summary:', JSON.stringify(summary));
const written = trace.toRunRecord(), replayed = await readRunRecord(file); const count = (events: readonly TraceEvent[], type: TraceEvent['t']) => events.filter((event) => event.t === type).length;
for (const type of ['spawn', 'message', 'score', 'kill'] as const) if (count(written.events, type) !== count(replayed.events, type)) throw new Error(`replay mismatch ${type}`);
console.log(`replay verified: ${replayed.events.length} events`); console.log(`trace: ${file}`);
