import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime, type Scorer, type TraceEvent } from '@swarmlab/core';
import type { Arm, Outcome, ScenarioId, ScenarioResult } from './types.js';

const SEED = 'indeterminate-permit-take-reconciliation-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-09-exp31-baseline';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const HOOK = process.env['AEGIS_HOOK_DIST'] ?? `${AEGIS_REPO}/packages/aegis-hook/dist/index.js`;
const sha = (repo: string) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

type RecordValue = { id: string; approvalId: string; signature: string; authorizationDigest?: string; effectiveConsumerId?: string; links?: Link[]; declaredScope?: string; maxDepth?: number };
type Permit = { id: string; approvalId: string };
type Link = { actorId?: string; verified?: boolean; authorityLevel?: number; revoked?: boolean };
type Snapshot = { approvalId: string; authorizationDigest?: string; effectiveConsumerId?: string; links?: Link[]; revoked?: boolean; revocationChecked?: boolean; structurallyValid?: boolean };
type FinalizationResult = { status: Outcome; retryable?: boolean; reason?: string };

class JournalStore {
  readonly records = new Map<string, RecordValue>();
  readonly operations = new Map<string, RecordValue>();
  precommitFailures = 0;
  postcommitTimeouts = 0;
  reconciliationFailures = 0;

  async create(record: RecordValue): Promise<boolean> {
    if (this.records.has(record.id)) return false;
    this.records.set(record.id, structuredClone(record));
    return true;
  }

  // RT-21 legacy seam: a thrown timeout gives the caller no operation identifier to reconcile.
  async take(id: string): Promise<RecordValue | undefined> {
    if (this.precommitFailures-- > 0) throw new Error('definite pre-commit transport failure');
    const record = this.records.get(id);
    this.records.delete(id);
    if (this.postcommitTimeouts-- > 0) throw new Error('timeout after server-side destructive take');
    return record ? structuredClone(record) : undefined;
  }

  // Candidate seam: mutation and operation-journal insertion are one atomic store transaction.
  async prepareTake(id: string, operationId: string): Promise<boolean> {
    if (this.precommitFailures-- > 0) throw new Error('definite pre-commit transport failure');
    if (this.operations.has(operationId)) return true;
    const record = this.records.get(id);
    if (!record) return false;
    this.records.delete(id);
    this.operations.set(operationId, structuredClone(record));
    if (this.postcommitTimeouts-- > 0) throw new Error('timeout after committed prepare');
    return true;
  }

  // Atomic return-and-delete: an operation result can authorize execution at most once.
  async claimPreparedTake(operationId: string): Promise<RecordValue | undefined> {
    if (this.reconciliationFailures-- > 0) throw new Error('operation status unavailable');
    const record = this.operations.get(operationId);
    this.operations.delete(operationId);
    return record ? structuredClone(record) : undefined;
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
  evaluate(call: Record<string, unknown>): any;
  decide(evaluation: any, call: Record<string, unknown>, dir: string): any;
  approvePending(id: string, dir: string): void;
  approvalId(call: Record<string, unknown>, evaluation: any): string;
  createExecutionPermitWithStore(call: Record<string, unknown>, evaluation: any, id: string, store: JournalStore): Promise<Permit>;
  finalizeExecutionPermitWithStore(permit: Permit, current: Snapshot, store: JournalStore): Promise<boolean>;
  finalizeExecutionPermitWithReconciliation?: (permit: Permit, current: Snapshot, operationId: string, store: JournalStore) => Promise<FinalizationResult>;
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
    finalizeExecutionPermitWithStore: hook.finalizeExecutionPermitWithStore,
    ...(typeof hook.finalizeExecutionPermitWithReconciliation === 'function' ? { finalizeExecutionPermitWithReconciliation: hook.finalizeExecutionPermitWithReconciliation } : {}),
  };
}

async function setup(runtime: Runtime, dir: string, store: JournalStore) {
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
  return { evaluation, permit, ask: askDecision.exitCode === 2, consume: consumeDecision.approval?.event === 'consumed' };
}

function valid(record: RecordValue, current: Snapshot): boolean {
  return record.approvalId === current.approvalId && current.authorizationDigest === 'auth:epoch-7' && current.effectiveConsumerId === 'agent:child-a' && current.revoked === false && current.revocationChecked === true && current.structurallyValid === true;
}

async function fixtureFinalize(permit: Permit, current: Snapshot, operationId: string, store: JournalStore): Promise<FinalizationResult> {
  try { await store.prepareTake(permit.id, operationId); } catch { /* reconcile the journal */ }
  let record: RecordValue | undefined;
  try { record = await store.claimPreparedTake(operationId); } catch { return { status: 'indeterminate', retryable: false, reason: 'status_unavailable' }; }
  if (!record) return { status: 'blocked', retryable: true, reason: 'not_taken' };
  return valid(record, current) ? { status: 'execute', retryable: false } : { status: 'blocked', retryable: false, reason: 'invalid_snapshot' };
}

async function runScenario(arm: Arm, id: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const root = mkdtempSync(join(tmpdir(), 'aegis-exp31-'));
  const store = new JournalStore();
  let ask = true, consume = true, executions = 0;
  const apiAvailable = arm !== 'aegis-wrapped' || typeof runtime.finalizeExecutionPermitWithReconciliation === 'function';
  let last: FinalizationResult = { status: 'blocked' };
  try {
    const { permit, ask: asked, consume: consumed } = await setup(runtime, root, store);
    ask = asked; consume = consumed;
    const invoke = async (operationId: string, current = snapshot(permit.approvalId)): Promise<FinalizationResult> => {
      let result: FinalizationResult;
      if (arm === 'reconciling-fixture') result = await fixtureFinalize(permit, current, operationId, store);
      else if (arm === 'aegis-wrapped' && runtime.finalizeExecutionPermitWithReconciliation) result = await runtime.finalizeExecutionPermitWithReconciliation(permit, current, operationId, store);
      else result = { status: await runtime.finalizeExecutionPermitWithStore(permit, current, store) ? 'execute' : 'blocked' };
      if (result.status === 'execute') executions += 1;
      last = result;
      return result;
    };

    if (id === 'normal-commit') await invoke('op-normal');
    if (id === 'precommit-failure-retry') { store.precommitFailures = 1; await invoke('op-pre-fail'); await invoke('op-pre-retry'); }
    if (id === 'postcommit-timeout-reconcile') { store.postcommitTimeouts = 1; await invoke('op-post-timeout'); }
    if (id === 'postcommit-timeout-cross-host-retry') { store.postcommitTimeouts = 1; await invoke('op-original'); await invoke('op-other-host'); }
    if (id === 'status-unavailable') { store.postcommitTimeouts = 1; store.reconciliationFailures = 1; await invoke('op-status-down'); }
    if (id === 'invalid-snapshot-postcommit') { store.postcommitTimeouts = 1; await invoke('op-invalid', snapshot(permit.approvalId, false)); await invoke('op-invalid-retry'); }
    if (id === 'duplicate-reconcile') { store.postcommitTimeouts = 1; await invoke('op-duplicate'); await invoke('op-duplicate'); }

    const expectedExecutions = ['normal-commit', 'precommit-failure-retry', 'postcommit-timeout-reconcile', 'postcommit-timeout-cross-host-retry', 'duplicate-reconcile'].includes(id) ? 1 : 0;
    const expectedOutcome: Outcome = id === 'status-unavailable' ? 'indeterminate' : id === 'invalid-snapshot-postcommit' ? 'blocked' : id === 'postcommit-timeout-cross-host-retry' || id === 'duplicate-reconcile' ? 'blocked' : 'execute';
    const committedTake = ['postcommit-timeout-reconcile', 'postcommit-timeout-cross-host-retry', 'status-unavailable', 'invalid-snapshot-postcommit', 'duplicate-reconcile'].includes(id);
    const committedOrphan = committedTake && expectedExecutions === 1 && executions === 0;
    const ambiguityMisclassified = id === 'status-unavailable' && last.status !== 'indeterminate';
    const unsafeDuplicate = executions > expectedExecutions;
    const indeterminateExecution = last.status === 'indeterminate' && executions > 0;
    const legitimateBlock = expectedExecutions === 1 && executions === 0;
    const idempotentReplaySafe = id !== 'duplicate-reconcile' || executions === 1;
    const correct = executions === expectedExecutions && last.status === expectedOutcome && !ambiguityMisclassified;
    return { scenarioId: id, executions, expectedExecutions, outcome: last.status, expectedOutcome, committedTake, committedOrphan, ambiguityMisclassified, unsafeDuplicate, indeterminateExecution, legitimateBlock, correct, apiAvailable, askCovered: ask, consumeCovered: consume, idempotentReplaySafe };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const scenarios: ScenarioId[] = ['normal-commit', 'precommit-failure-retry', 'postcommit-timeout-reconcile', 'postcommit-timeout-cross-host-retry', 'status-unavailable', 'invalid-snapshot-postcommit', 'duplicate-reconcile'];
const arms: Arm[] = ['boolean-control', 'reconciling-fixture', 'aegis-wrapped'];
const runtime = await loadRuntime();
const runId = `ipr-${Date.now().toString(36)}`;
const runsDir = join(import.meta.dirname, '..', 'runs'); mkdirSync(runsDir, { recursive: true });
const file = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(file, { runId, experiment: '31-indeterminate-permit-take-reconciliation' });
const bus = new MessageBus({ trace }); const stub = new StubRuntime(); const all = new Map<Arm, ScenarioResult[]>();
bus.publish({ from: 'moderator', to: '*', topic: 'meta', body: { evidenceVersion: 1, experiment: '31-indeterminate-permit-take-reconciliation', spec: '37-indeterminate-permit-take-reconciliation', runId, timestamp: new Date().toISOString(), seed: SEED, scenarios, arms, aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'built-artifact+real-hook-public-api' } } });
for (const arm of arms) {
  const handle = await spawnAgent({ id: `ipr:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace });
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) { const result = await runScenario(arm, scenario, runtime); results.push(result); bus.publish({ from: handle.id, to: 'moderator', topic: 'scenario', body: { arm, ...result } }); }
  all.set(arm, results); await handle.kill(); bus.removeAgent(handle.id);
}
const metrics = (arm: Arm) => { const rows = all.get(arm)!; const rate = (key: keyof ScenarioResult) => rows.filter((row) => row[key] === true).length / rows.length; return { unsafeDuplicateExecutionRate: rate('unsafeDuplicate'), committedTakeOrphanRate: rate('committedOrphan'), ambiguityMisclassificationRate: rate('ambiguityMisclassified'), indeterminateExecutionRate: rate('indeterminateExecution'), legitimateExecutionBlockRate: rate('legitimateBlock'), reconciliationAccuracy: rows.filter((row) => row.correct).length / rows.length, reconciliationApiAvailability: rows.filter((row) => row.apiAvailable).length / rows.length, askCoverage: rows.filter((row) => row.askCovered).length / rows.length, consumeCoverage: rows.filter((row) => row.consumeCovered).length / rows.length, idempotentReplaySafety: rows.find((row) => row.scenarioId === 'duplicate-reconcile')?.idempotentReplaySafe ? 1 : 0 }; };
for (const arm of arms) { const value = metrics(arm); trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(value).map(([key, metric]) => [`${arm.replaceAll('-', '_')}_${key}`, metric])) }); console.log(arm, value); }
const scorer: Scorer = { score() { const fixture = metrics('reconciling-fixture'), aegis = metrics('aegis-wrapped'); const green = (m: ReturnType<typeof metrics>) => m.unsafeDuplicateExecutionRate === 0 && m.committedTakeOrphanRate === 0 && m.ambiguityMisclassificationRate === 0 && m.indeterminateExecutionRate === 0 && m.legitimateExecutionBlockRate === 0 && m.reconciliationAccuracy === 1 && m.reconciliationApiAvailability === 1 && m.askCoverage === 1 && m.consumeCoverage === 1 && m.idempotentReplaySafety === 1; return { fixtureGreen: green(fixture) ? 1 : 0, baselineAegisRed: green(aegis) ? 0 : 1, ...Object.fromEntries(Object.entries(aegis).map(([key, metric]) => [`aegisWrapped${key[0]!.toUpperCase()}${key.slice(1)}`, metric])) }; } };
const summary = runScorer(scorer, trace.toRunRecord()); trace.append({ t: 'score', ts: Date.now(), scores: summary }); console.log('summary:', JSON.stringify(summary));
const written = trace.toRunRecord(), replayed = await readRunRecord(file); const count = (events: readonly TraceEvent[], type: TraceEvent['t']) => events.filter((event) => event.t === type).length;
for (const type of ['spawn', 'message', 'score', 'kill'] as const) if (count(written.events, type) !== count(replayed.events, type)) throw new Error(`replay mismatch ${type}`);
console.log(`replay verified: ${replayed.events.length} events`); console.log(`trace: ${file}`);
