import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime, type Scorer, type TraceEvent } from '@swarmlab/core';
import type { Arm, ScenarioId, ScenarioResult, TerminalStatus } from './types.js';

const SEED = 'terminal-receipt-acknowledgement-reconciliation-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-11-exp36-baseline';
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
type ApiResult = { status: TerminalStatus; reason?: string };
type FailureMode = 'none' | 'precommit' | 'postcommit' | 'postcommit-read-unavailable' | 'conflicting-terminal';

class Store {
  records = new Map<string, PermitRecord>();
  effects = new Map<string, Effect>();
  mode: FailureMode = 'none';
  readFailures = 0;
  async create(record: PermitRecord): Promise<boolean> { if (this.records.has(record.id)) return false; this.records.set(record.id, structuredClone(record)); return true; }
  async take(id: string): Promise<PermitRecord | undefined> { const record = this.records.get(id); this.records.delete(id); return record; }
  async prepareEffect(id: string, operationId: string): Promise<boolean> { const old = this.effects.get(operationId); if (old) return old.permit.id === id; const record = this.records.get(id); if (!record) return false; this.records.delete(id); this.effects.set(operationId, { operationId, permit: structuredClone(record), state: 'authorized', claimed: false }); return true; }
  async claimPreparedEffect(operationId: string): Promise<PermitRecord | undefined> { const effect = this.effects.get(operationId); if (!effect || effect.claimed || effect.state !== 'authorized') return undefined; effect.claimed = true; return structuredClone(effect.permit); }
  async beginEffect(operationId: string): Promise<boolean> { const effect = this.effects.get(operationId); if (!effect || !effect.claimed || effect.state !== 'authorized') return false; effect.state = 'started'; return true; }
  async commitEffect(operationId: string): Promise<boolean> { const effect = this.effects.get(operationId); if (!effect || effect.state !== 'started') return false; effect.state = 'committed'; return true; }
  async readEffect(operationId: string): Promise<Effect | undefined> { if (this.readFailures-- > 0) throw new Error('read unavailable'); const effect = this.effects.get(operationId); return effect ? structuredClone(effect) : undefined; }
  async burnEffect(operationId: string): Promise<boolean> { const effect = this.effects.get(operationId); if (!effect || effect.state === 'committed' || effect.state === 'failed') return false; effect.state = 'burned'; return true; }
  async completeEffect(operationId: string, receipt: SuccessReceipt): Promise<'committed'|'already_committed'|'conflict'|'not_started'> {
    const mode = this.mode; this.mode = 'none';
    if (mode === 'precommit') throw new Error('precommit failure');
    if (mode === 'conflicting-terminal') { const effect = this.effects.get(operationId); if (effect) { effect.failureReceipt = { ...receipt, receiptDigest: `sha256:${'d'.repeat(64)}`, failureCode: 'external_rejected' }; effect.state = 'failed'; } throw new Error('concurrent terminal won'); }
    const result = this.persistSuccess(operationId, receipt);
    if (mode === 'postcommit' || mode === 'postcommit-read-unavailable') { if (mode === 'postcommit-read-unavailable') this.readFailures = 1; throw new Error('acknowledgement lost'); }
    return result;
  }
  async failEffect(operationId: string, receipt: FailureReceipt): Promise<'failed'|'already_failed'|'conflict'|'not_started'> {
    const mode = this.mode; this.mode = 'none';
    if (mode === 'precommit') throw new Error('precommit failure');
    if (mode === 'conflicting-terminal') { const effect = this.effects.get(operationId); if (effect) { effect.successReceipt = { permitId: receipt.permitId, approvalId: receipt.approvalId, operationId, receiptDigest: `sha256:${'e'.repeat(64)}`, verified: true }; effect.state = 'committed'; } throw new Error('concurrent terminal won'); }
    const result = this.persistFailure(operationId, receipt);
    if (mode === 'postcommit' || mode === 'postcommit-read-unavailable') { if (mode === 'postcommit-read-unavailable') this.readFailures = 1; throw new Error('acknowledgement lost'); }
    return result;
  }
  private persistSuccess(operationId: string, receipt: SuccessReceipt): 'committed'|'already_committed'|'conflict'|'not_started' { const effect = this.effects.get(operationId); if (!effect || (effect.state !== 'started' && effect.state !== 'committed' && effect.state !== 'failed')) return 'not_started'; if (effect.state === 'failed' || effect.failureReceipt) return 'conflict'; if (effect.successReceipt) return JSON.stringify(effect.successReceipt) === JSON.stringify(receipt) ? 'already_committed' : 'conflict'; effect.successReceipt = structuredClone(receipt); effect.state = 'committed'; return 'committed'; }
  private persistFailure(operationId: string, receipt: FailureReceipt): 'failed'|'already_failed'|'conflict'|'not_started' { const effect = this.effects.get(operationId); if (!effect || (effect.state !== 'started' && effect.state !== 'failed' && effect.state !== 'committed')) return 'not_started'; if (effect.state === 'committed' || effect.successReceipt) return 'conflict'; if (effect.failureReceipt) return JSON.stringify(effect.failureReceipt) === JSON.stringify(receipt) ? 'already_failed' : 'conflict'; effect.failureReceipt = structuredClone(receipt); effect.state = 'failed'; return 'failed'; }
}

const links: Link[] = [{ actorId: 'user:beaux', verified: true, authorityLevel: 10 }, { actorId: 'agent:child-a', verified: true, authorityLevel: 6 }];
const call = { tool: 'Bash', command: 'npm publish ./dist/pkg.tgz', approvalEnvelope: { operation: 'approved_retry', riskLevel: 'high', freshnessWindowMs: 600000, observedAt: '2026-09-12T06:00:00Z', artifactDigest: 'sha256:pkg', verificationDigest: 'sha256:tests', targetDigest: 'registry:prod:v1' }, approvalProvenance: { actorId: 'agent:child-a', sessionId: 'session:a', workspaceId: 'workspace:aegis', taskIntentId: 'intent:publish', authorizationDigest: 'auth:epoch-8', grantScope: 'exact_session' }, approvalDelegation: { effectiveConsumerId: 'agent:child-a', declaredScope: 'direct', maxDepth: 1, links, revoked: false, revocationChecked: true, structurallyValid: true } };
const grant = { ...call, approvalProvenance: { ...call.approvalProvenance, actorId: 'user:beaux' }, approvalDelegation: { ...call.approvalDelegation, effectiveConsumerId: 'user:beaux', links: [links[0]] } };
const snapshot = (approvalId: string): Snapshot => ({ approvalId, authorizationDigest: 'auth:epoch-8', effectiveConsumerId: 'agent:child-a', links, revoked: false, revocationChecked: true, structurallyValid: true });

interface Runtime {
  evaluate(value: Record<string, unknown>): unknown; decide(evaluation: unknown, value: Record<string, unknown>, dir: string): any; approvePending(id: string, dir: string): void; approvalId(value: Record<string, unknown>, evaluation: unknown): string;
  createExecutionPermitWithStore(value: Record<string, unknown>, evaluation: unknown, id: string, store: Store): Promise<Permit>;
  finalizeExecutionPermitWithEffectJournal(permit: Permit, current: Snapshot, operationId: string, store: Store): Promise<unknown>;
  beginExecutionEffect(permit: Permit, current: Snapshot, operationId: string, store: Store): Promise<unknown>;
  completeExecutionEffect(permit: Permit, operationId: string, receipt: SuccessReceipt, store: Store): Promise<ApiResult>;
  failExecutionEffect(permit: Permit, operationId: string, receipt: FailureReceipt, store: Store): Promise<ApiResult>;
}
async function loadRuntime(): Promise<Runtime> { const aegis = await import(pathToFileURL(AEGIS_DIST).href) as any; const hook = await import(pathToFileURL(HOOK).href) as any; const rules = hook.loadAllPacks(); return { evaluate: (value) => aegis.evaluate(value, rules), decide: (evaluation, value, dir) => hook.decide(evaluation, { call: value, approvalDir: dir }), approvePending: hook.approvePending, approvalId: hook.approvalId, createExecutionPermitWithStore: hook.createExecutionPermitWithStore, finalizeExecutionPermitWithEffectJournal: hook.finalizeExecutionPermitWithEffectJournal, beginExecutionEffect: hook.beginExecutionEffect, completeExecutionEffect: hook.completeExecutionEffect, failExecutionEffect: hook.failExecutionEffect }; }
async function setup(runtime: Runtime, dir: string, store: Store) { mkdirSync(dir, { recursive: true }); const grantEvaluation = runtime.evaluate(grant); const askDecision = runtime.decide(grantEvaluation, grant, dir); runtime.approvePending(askDecision.approval.id, dir); const evaluation = runtime.evaluate(call); const consumeDecision = runtime.decide(evaluation, call, dir); const permit = await runtime.createExecutionPermitWithStore(call, evaluation, runtime.approvalId(call, evaluation), store); const operationId = 'op_terminal_ack_reconcile'; await runtime.finalizeExecutionPermitWithEffectJournal(permit, snapshot(permit.approvalId), operationId, store); await runtime.beginExecutionEffect(permit, snapshot(permit.approvalId), operationId, store); return { permit, operationId, ask: askDecision.exitCode === 2, consume: consumeDecision.approval?.event === 'consumed' }; }

const exactMatch = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
async function fixtureCall(kind: 'success'|'failure', permit: Permit, operationId: string, success: SuccessReceipt, failure: FailureReceipt, store: Store): Promise<ApiResult> { try { if (kind === 'success') { const r = await store.completeEffect(operationId, success); return r === 'committed' || r === 'already_committed' ? { status: 'executed' } : r === 'conflict' ? { status: 'blocked', reason: 'receipt_conflict' } : { status: 'blocked', reason: 'effect_not_started' }; } const r = await store.failEffect(operationId, failure); return r === 'failed' || r === 'already_failed' ? { status: 'failed' } : r === 'conflict' ? { status: 'blocked', reason: 'receipt_conflict' } : { status: 'blocked', reason: 'effect_not_started' }; } catch { try { const effect = await store.readEffect(operationId); if (!effect || effect.permit.id !== permit.id || effect.permit.approvalId !== permit.approvalId) return { status: 'indeterminate', reason: 'store_unavailable' }; if (kind === 'success' && effect.state === 'committed' && exactMatch(effect.successReceipt, success)) return { status: 'executed' }; if (kind === 'failure' && effect.state === 'failed' && exactMatch(effect.failureReceipt, failure)) return { status: 'failed' }; if (effect.state === 'committed' || effect.state === 'failed') return { status: 'blocked', reason: 'receipt_conflict' }; return { status: 'indeterminate', reason: 'store_unavailable' }; } catch { return { status: 'indeterminate', reason: 'store_unavailable' }; } } }

async function runScenario(arm: Arm, scenarioId: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-exp36-')); const store = new Store();
  try {
    const { permit, operationId, ask, consume } = await setup(runtime, dir, store); const success: SuccessReceipt = { permitId: permit.id, approvalId: permit.approvalId, operationId, receiptDigest: `sha256:${'a'.repeat(64)}`, verified: true }; const failure: FailureReceipt = { ...success, receiptDigest: `sha256:${'b'.repeat(64)}`, failureCode: 'external_rejected' };
    const kind: 'success'|'failure' = scenarioId.startsWith('success-') ? 'success' : 'failure';
    store.mode = scenarioId.includes('precommit') ? 'precommit' : scenarioId.includes('status-unavailable') ? 'postcommit-read-unavailable' : scenarioId.includes('conflicting') ? 'conflicting-terminal' : 'postcommit';
    const invoke = async (): Promise<ApiResult> => {
      if (arm === 'exception-only-control') { try { if (kind === 'success') await store.completeEffect(operationId, success); else await store.failEffect(operationId, failure); } catch { return { status: 'indeterminate', reason: 'store_unavailable' }; } return { status: kind === 'success' ? 'executed' : 'failed' }; }
      if (arm === 'receipt-readback-fixture') return fixtureCall(kind, permit, operationId, success, failure, store);
      return kind === 'success' ? runtime.completeExecutionEffect(permit, operationId, success, store) : runtime.failExecutionEffect(permit, operationId, failure, store);
    };
    let result = await invoke();
    if (scenarioId.includes('exact-retry')) result = kind === 'success' ? await runtimeOrFixture(arm, () => fixtureCall(kind, permit, operationId, success, failure, store), () => runtime.completeExecutionEffect(permit, operationId, success, store)) : await runtimeOrFixture(arm, () => fixtureCall(kind, permit, operationId, success, failure, store), () => runtime.failExecutionEffect(permit, operationId, failure, store));
    const expectedStatus: TerminalStatus = scenarioId.includes('postcommit-ack-loss') || scenarioId.includes('exact-retry') ? (kind === 'success' ? 'executed' : 'failed') : scenarioId.includes('conflicting') ? 'blocked' : 'indeterminate';
    const final = store.effects.get(operationId); const committedAckLoss = scenarioId.includes('postcommit-ack-loss') || scenarioId.includes('exact-retry'); const conflict = scenarioId.includes('conflicting'); const precommit = scenarioId.includes('precommit'); const unavailable = scenarioId.includes('status-unavailable'); const terminalForKind = kind === 'success' ? result.status === 'executed' : result.status === 'failed';
    return { scenarioId, status: result.status, expectedStatus, ...(result.reason ? { reason: result.reason } : {}), committedReceiptOrphan: committedAckLoss && !terminalForKind, terminalMisclassification: result.status !== expectedStatus, conflictingReceiptAcceptance: conflict && terminalForKind, precommitFalseTerminal: precommit && terminalForKind, correct: result.status === expectedStatus, apiAvailable: true, askCovered: ask, consumeCovered: consume, idempotentSafe: !scenarioId.includes('exact-retry') || terminalForKind, terminalMonotonicitySafe: !conflict || (kind === 'success' ? final?.state === 'failed' : final?.state === 'committed'), unavailableReadFailClosedSafe: !unavailable || result.status === 'indeterminate' };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
async function runtimeOrFixture(arm: Arm, fixture: () => Promise<ApiResult>, aegis: () => Promise<ApiResult>): Promise<ApiResult> { if (arm === 'receipt-readback-fixture') return fixture(); if (arm === 'aegis-wrapped') return aegis(); return { status: 'indeterminate', reason: 'store_unavailable' }; }

const scenarios: ScenarioId[] = ['success-postcommit-ack-loss','failure-postcommit-ack-loss','success-precommit-failure','failure-precommit-failure','success-postcommit-status-unavailable','failure-postcommit-status-unavailable','success-conflicting-terminal-readback','failure-conflicting-terminal-readback','success-exact-retry-after-ack-loss','failure-exact-retry-after-ack-loss'];
const arms: Arm[] = ['exception-only-control','receipt-readback-fixture','aegis-wrapped'];
const runtime = await loadRuntime(); const runId = `tra-${Date.now().toString(36)}`; const runDir = join(import.meta.dirname,'..','runs'); mkdirSync(runDir,{recursive:true}); const tracePath=join(runDir,`${runId}.jsonl`); const trace=new TraceWriter(tracePath,{runId,experiment:'36-terminal-receipt-acknowledgement-reconciliation'}); const bus=new MessageBus({trace}); const stub=new StubRuntime(); const results=new Map<Arm,ScenarioResult[]>();
bus.publish({from:'moderator',to:'*',topic:'meta',body:{evidenceVersion:1,experiment:'36-terminal-receipt-acknowledgement-reconciliation',spec:'42-terminal-receipt-acknowledgement-reconciliation',runId,timestamp:new Date().toISOString(),seed:SEED,scenarios,arms,aegis:{repo:AEGIS_REPO,sha:sha(AEGIS_REPO),mode:'built-artifact+real-hook-public-api'}}});
for(const arm of arms){const agent=await spawnAgent({id:`tra:${arm}`,systemPrompt:`deterministic ${arm}`},{runtime:stub,trace});const rows:ScenarioResult[]=[];for(const scenarioId of scenarios){const row=await runScenario(arm,scenarioId,runtime);rows.push(row);bus.publish({from:agent.id,to:'moderator',topic:'scenario',body:{arm,...row}});}results.set(arm,rows);await agent.kill();bus.removeAgent(agent.id);}
const metrics=(arm:Arm)=>{const rows=results.get(arm)!;const rate=(key:keyof ScenarioResult)=>rows.filter(row=>row[key]===true).length/rows.length;return{committedReceiptOrphanRate:rate('committedReceiptOrphan'),terminalMisclassificationRate:rate('terminalMisclassification'),conflictingReceiptAcceptanceRate:rate('conflictingReceiptAcceptance'),precommitFalseTerminalRate:rate('precommitFalseTerminal'),reconciliationAccuracy:rows.filter(row=>row.correct).length/rows.length,reconciliationApiAvailability:rows.filter(row=>row.apiAvailable).length/rows.length,askCoverage:rows.filter(row=>row.askCovered).length/rows.length,consumeCoverage:rows.filter(row=>row.consumeCovered).length/rows.length,idempotentReconciliationSafety:rows.filter(row=>row.scenarioId.includes('exact-retry')).every(row=>row.idempotentSafe)?1:0,terminalMonotonicitySafety:rows.filter(row=>row.scenarioId.includes('conflicting')).every(row=>row.terminalMonotonicitySafe)?1:0,unavailableReadFailClosedSafety:rows.filter(row=>row.scenarioId.includes('status-unavailable')).every(row=>row.unavailableReadFailClosedSafe)?1:0};};
for(const arm of arms){const values=metrics(arm);trace.append({t:'score',ts:Date.now(),scores:Object.fromEntries(Object.entries(values).map(([key,value])=>[`${arm.replaceAll('-','_')}_${key}`,value]))});console.log(arm,values);}
const scorer:Scorer={score(){const fixture=metrics('receipt-readback-fixture'),aegis=metrics('aegis-wrapped');const green=(m:ReturnType<typeof metrics>)=>m.committedReceiptOrphanRate===0&&m.terminalMisclassificationRate===0&&m.conflictingReceiptAcceptanceRate===0&&m.precommitFalseTerminalRate===0&&m.reconciliationAccuracy===1&&m.reconciliationApiAvailability===1&&m.askCoverage===1&&m.consumeCoverage===1&&m.idempotentReconciliationSafety===1&&m.terminalMonotonicitySafety===1&&m.unavailableReadFailClosedSafety===1;return{fixtureGreen:green(fixture)?1:0,baselineAegisRed:green(aegis)?0:1,...Object.fromEntries(Object.entries(aegis).map(([key,value])=>[`aegisWrapped${key[0]!.toUpperCase()}${key.slice(1)}`,value]))};}};
const summary=runScorer(scorer,trace.toRunRecord());trace.append({t:'score',ts:Date.now(),scores:summary});console.log('summary:',JSON.stringify(summary));const written=trace.toRunRecord();const replayed=await readRunRecord(tracePath);const count=(events:readonly TraceEvent[],type:TraceEvent['t'])=>events.filter(event=>event.t===type).length;for(const type of ['spawn','message','score','kill'] as const)if(count(written.events,type)!==count(replayed.events,type))throw new Error(`replay mismatch ${type}`);console.log(`replay verified: ${replayed.events.length} events`);console.log(`trace: ${tracePath}`);
