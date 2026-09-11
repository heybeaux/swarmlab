import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime, type Scorer, type TraceEvent } from '@swarmlab/core';
import type { Arm, ScenarioId, ScenarioResult, StartStatus } from './types.js';

const SEED = 'concurrent-effect-start-fencing-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-10-exp33-baseline';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const HOOK = process.env['AEGIS_HOOK_DIST'] ?? `${AEGIS_REPO}/packages/aegis-hook/dist/index.js`;
const sha = (repo: string) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

type Link = { actorId?: string; verified?: boolean; authorityLevel?: number; revoked?: boolean };
type RecordValue = { id: string; approvalId: string; signature: string; authorizationDigest?: string; effectiveConsumerId?: string; links?: Link[]; declaredScope?: string; maxDepth?: number };
type Permit = { id: string; approvalId: string };
type Snapshot = { approvalId: string; authorizationDigest?: string; effectiveConsumerId?: string; links?: Link[]; revoked?: boolean; revocationChecked?: boolean; structurallyValid?: boolean };
type FinalizationResult = { status: StartStatus; retryable: boolean; reason?: string };
type EffectRecord = { operationId: string; permit: RecordValue; state: 'authorized' | 'started' | 'committed' | 'burned'; claimed: boolean };

class StartStore {
  readonly records = new Map<string, RecordValue>();
  readonly effects = new Map<string, EffectRecord>();
  beginFailures = 0;
  async create(record: RecordValue) { if (this.records.has(record.id)) return false; this.records.set(record.id, structuredClone(record)); return true; }
  async take(id: string) { const value = this.records.get(id); this.records.delete(id); return value ? structuredClone(value) : undefined; }
  async prepareEffect(id: string, operationId: string) { const existing = this.effects.get(operationId); if (existing) return existing.permit.id === id; const record = this.records.get(id); if (!record) return false; this.records.delete(id); this.effects.set(operationId, { operationId, permit: structuredClone(record), state: 'authorized', claimed: false }); return true; }
  async claimPreparedEffect(operationId: string) { const effect = this.effects.get(operationId); if (!effect || effect.claimed || effect.state !== 'authorized') return undefined; effect.claimed = true; return structuredClone(effect.permit); }
  async beginEffect(operationId: string) { if (this.beginFailures-- > 0) throw new Error('start store unavailable'); await Promise.resolve(); const effect = this.effects.get(operationId); if (!effect || !effect.claimed || effect.state !== 'authorized') return false; effect.state = 'started'; return true; }
  async commitEffect(operationId: string) { const effect = this.effects.get(operationId); if (!effect || effect.state !== 'started') return false; effect.state = 'committed'; return true; }
  async readEffect(operationId: string) { const effect = this.effects.get(operationId); return effect ? structuredClone(effect) : undefined; }
  async burnEffect(operationId: string) { const effect = this.effects.get(operationId); if (!effect || effect.state === 'committed') return false; effect.state = 'burned'; return true; }
}

const links: Link[] = [{ actorId: 'user:beaux', verified: true, authorityLevel: 10 }, { actorId: 'agent:child-a', verified: true, authorityLevel: 6 }];
const call = { tool: 'Bash', command: 'npm publish ./dist/pkg.tgz', approvalEnvelope: { operation: 'approved_retry', riskLevel: 'high', freshnessWindowMs: 600000, observedAt: '2026-09-10T06:00:00Z', artifactDigest: 'sha256:pkg', verificationDigest: 'sha256:tests', targetDigest: 'registry:prod:v1' }, approvalProvenance: { actorId: 'agent:child-a', sessionId: 'session:a', workspaceId: 'workspace:aegis', taskIntentId: 'intent:publish', authorizationDigest: 'auth:epoch-7', grantScope: 'exact_session' }, approvalDelegation: { effectiveConsumerId: 'agent:child-a', declaredScope: 'direct', maxDepth: 1, links, revoked: false, revocationChecked: true, structurallyValid: true } };
const grant = { ...call, approvalProvenance: { ...call.approvalProvenance, actorId: 'user:beaux' }, approvalDelegation: { ...call.approvalDelegation, effectiveConsumerId: 'user:beaux', links: [links[0]] } };
const snapshot = (approvalId: string, valid = true): Snapshot => ({ approvalId, authorizationDigest: valid ? 'auth:epoch-7' : 'auth:epoch-8', effectiveConsumerId: 'agent:child-a', links, revoked: false, revocationChecked: true, structurallyValid: true });

interface Runtime {
  evaluate(input: Record<string, unknown>): any; decide(evaluation: any, input: Record<string, unknown>, dir: string): any; approvePending(id: string, dir: string): void; approvalId(input: Record<string, unknown>, evaluation: any): string;
  createExecutionPermitWithStore(input: Record<string, unknown>, evaluation: any, id: string, store: StartStore): Promise<Permit>;
  finalizeExecutionPermitWithEffectJournal(permit: Permit, current: Snapshot, operationId: string, store: StartStore): Promise<FinalizationResult>;
  resolveExecutionEffect(permit: Permit, current: Snapshot, operationId: string, store: StartStore): Promise<{ status: 'executed'|'not_executed'|'indeterminate'; retryable: boolean; reason?: string }>;
  beginExecutionEffect?: (permit: Permit, current: Snapshot, operationId: string, store: StartStore) => Promise<FinalizationResult>;
}
async function loadRuntime(): Promise<Runtime> { const aegis = await import(pathToFileURL(AEGIS_DIST).href) as any; const hook = await import(pathToFileURL(HOOK).href) as any; const rules = hook.loadAllPacks(); return { evaluate: (input) => aegis.evaluate(input, rules), decide: (evaluation, input, dir) => hook.decide(evaluation, { call: input, approvalDir: dir }), approvePending: hook.approvePending, approvalId: hook.approvalId, createExecutionPermitWithStore: hook.createExecutionPermitWithStore, finalizeExecutionPermitWithEffectJournal: hook.finalizeExecutionPermitWithEffectJournal, resolveExecutionEffect: hook.resolveExecutionEffect, ...(typeof hook.beginExecutionEffect === 'function' ? { beginExecutionEffect: hook.beginExecutionEffect } : {}) }; }
async function setup(runtime: Runtime, dir: string, store: StartStore) { mkdirSync(dir, { recursive: true }); const ge = runtime.evaluate(grant), ad = runtime.decide(ge, grant, dir); if (!ad.approval) throw new Error('expected approval'); runtime.approvePending(ad.approval.id, dir); const e = runtime.evaluate(call), cd = runtime.decide(e, call, dir); if (cd.exitCode !== 0) throw new Error('consumption failed'); const permit = await runtime.createExecutionPermitWithStore(call, e, runtime.approvalId(call, e), store); const operationId = 'op_effect_start_fence'; const finalized = await runtime.finalizeExecutionPermitWithEffectJournal(permit, snapshot(permit.approvalId), operationId, store); if (finalized.status !== 'execute') throw new Error('effect authorization failed'); return { permit, operationId, ask: ad.exitCode === 2, consume: cd.approval?.event === 'consumed' }; }

async function runScenario(arm: Arm, id: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const root = mkdtempSync(join(tmpdir(), 'aegis-exp33-')); const store = new StartStore(); let executions = 0, finalStatus: StartStatus = 'blocked';
  const apiAvailable = arm !== 'aegis-wrapped' || typeof runtime.beginExecutionEffect === 'function'; let ask = true, consume = true;
  try {
    const setupValue = await setup(runtime, root, store); ask = setupValue.ask; consume = setupValue.consume; const { permit, operationId } = setupValue; const current = snapshot(permit.approvalId);
    const start = async (fresh = current): Promise<FinalizationResult> => {
      if (arm === 'atomic-start-fixture') {
        const effect = await store.readEffect(operationId); if (!effect) return { status: 'blocked', retryable: false, reason: 'missing' };
        if (fresh.authorizationDigest !== 'auth:epoch-7') { await store.burnEffect(operationId); return { status: 'blocked', retryable: false, reason: 'invalid_snapshot' }; }
        try { return await store.beginEffect(operationId) ? { status: 'execute', retryable: false } : { status: 'blocked', retryable: false, reason: 'already_started' }; } catch { return { status: 'indeterminate', retryable: false, reason: 'store_unavailable' }; }
      }
      if (arm === 'aegis-wrapped' && runtime.beginExecutionEffect) return runtime.beginExecutionEffect(permit, fresh, operationId, store);
      const resolved = await runtime.resolveExecutionEffect(permit, fresh, operationId, store);
      return resolved.status === 'not_executed' && resolved.retryable ? { status: 'execute', retryable: false } : resolved.status === 'indeterminate' ? { status: 'indeterminate', retryable: false } : { status: 'blocked', retryable: false };
    };
    const act = async (fresh = current) => { const result = await start(fresh); finalStatus = result.status; if (result.status === 'execute') executions += 1; return result; };
    if (id === 'single-resume-start') await act();
    if (id === 'two-host-concurrent-resume') await Promise.all([act(), act()]);
    if (id === 'stale-original-after-resume') { await act(); await act(); }
    if (id === 'duplicate-start-same-host') { await act(); await act(); }
    if (id === 'invalid-snapshot-before-start') await act(snapshot(permit.approvalId, false));
    if (id === 'start-store-unavailable') { store.beginFailures = 1; await act(); }
    if (id === 'already-committed-at-resume') { await store.beginEffect(operationId); await store.commitEffect(operationId); await act(); }
    const expectedExecutions = ['single-resume-start','two-host-concurrent-resume','stale-original-after-resume','duplicate-start-same-host'].includes(id) ? 1 : 0;
    const expectedStatus: StartStatus = id === 'single-resume-start' ? 'execute' : id === 'start-store-unavailable' ? 'indeterminate' : 'blocked';
    const duplicateEffect = executions > expectedExecutions; const unauthorizedStart = (id === 'invalid-snapshot-before-start' || id === 'already-committed-at-resume') && executions > 0; const indeterminateStartExecution = id === 'start-store-unavailable' && executions > 0; const legitimateStartBlock = id === 'single-resume-start' && executions === 0; const idempotentStartSafe = !['stale-original-after-resume','duplicate-start-same-host'].includes(id) || executions === 1; const correct = executions === expectedExecutions && finalStatus === expectedStatus;
    return { scenarioId: id, executions, expectedExecutions, finalStatus, expectedStatus, duplicateEffect, unauthorizedStart, indeterminateStartExecution, legitimateStartBlock, correct, apiAvailable, askCovered: ask, consumeCovered: consume, idempotentStartSafe };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const scenarios: ScenarioId[] = ['single-resume-start','two-host-concurrent-resume','stale-original-after-resume','duplicate-start-same-host','invalid-snapshot-before-start','start-store-unavailable','already-committed-at-resume']; const arms: Arm[] = ['resolution-only-control','atomic-start-fixture','aegis-wrapped']; const runtime = await loadRuntime(); const runId = `cesf-${Date.now().toString(36)}`; const runsDir = join(import.meta.dirname,'..','runs'); mkdirSync(runsDir,{recursive:true}); const file=join(runsDir,`${runId}.jsonl`); const trace=new TraceWriter(file,{runId,experiment:'33-concurrent-effect-start-fencing'}); const bus=new MessageBus({trace}); const stub=new StubRuntime(); const all=new Map<Arm,ScenarioResult[]>();
bus.publish({from:'moderator',to:'*',topic:'meta',body:{evidenceVersion:1,experiment:'33-concurrent-effect-start-fencing',spec:'39-concurrent-effect-start-fencing',runId,timestamp:new Date().toISOString(),seed:SEED,scenarios,arms,aegis:{repo:AEGIS_REPO,sha:sha(AEGIS_REPO),mode:'built-artifact+real-hook-public-api'}}});
for(const arm of arms){const handle=await spawnAgent({id:`cesf:${arm}`,systemPrompt:`deterministic ${arm}`},{runtime:stub,trace});const rows=[];for(const scenario of scenarios){const result=await runScenario(arm,scenario,runtime);rows.push(result);bus.publish({from:handle.id,to:'moderator',topic:'scenario',body:{arm,...result}});}all.set(arm,rows);await handle.kill();bus.removeAgent(handle.id);}
const metrics=(arm:Arm)=>{const rows=all.get(arm)!;const rate=(key:keyof ScenarioResult)=>rows.filter(r=>r[key]===true).length/rows.length;return{duplicateEffectRate:rate('duplicateEffect'),unauthorizedStartRate:rate('unauthorizedStart'),indeterminateStartExecutionRate:rate('indeterminateStartExecution'),legitimateStartBlockRate:rate('legitimateStartBlock'),startDecisionAccuracy:rows.filter(r=>r.correct).length/rows.length,startFenceApiAvailability:rows.filter(r=>r.apiAvailable).length/rows.length,askCoverage:rows.filter(r=>r.askCovered).length/rows.length,consumeCoverage:rows.filter(r=>r.consumeCovered).length/rows.length,idempotentStartSafety:rows.filter(r=>r.idempotentStartSafe).length/rows.length};};
for(const arm of arms){const value=metrics(arm);trace.append({t:'score',ts:Date.now(),scores:Object.fromEntries(Object.entries(value).map(([k,v])=>[`${arm.replaceAll('-','_')}_${k}`,v]))});console.log(arm,value);}const scorer:Scorer={score(){const f=metrics('atomic-start-fixture'),a=metrics('aegis-wrapped');const green=(m:ReturnType<typeof metrics>)=>m.duplicateEffectRate===0&&m.unauthorizedStartRate===0&&m.indeterminateStartExecutionRate===0&&m.legitimateStartBlockRate===0&&m.startDecisionAccuracy===1&&m.startFenceApiAvailability===1&&m.askCoverage===1&&m.consumeCoverage===1&&m.idempotentStartSafety===1;return{fixtureGreen:green(f)?1:0,baselineAegisRed:green(a)?0:1,...Object.fromEntries(Object.entries(a).map(([k,v])=>[`aegisWrapped${k[0]!.toUpperCase()}${k.slice(1)}`,v]))};}};const summary=runScorer(scorer,trace.toRunRecord());trace.append({t:'score',ts:Date.now(),scores:summary});console.log('summary:',JSON.stringify(summary));const written=trace.toRunRecord(),replayed=await readRunRecord(file),count=(events:readonly TraceEvent[],t:TraceEvent['t'])=>events.filter(e=>e.t===t).length;for(const t of ['spawn','message','score','kill'] as const)if(count(written.events,t)!==count(replayed.events,t))throw new Error(`replay mismatch ${t}`);console.log(`replay verified: ${replayed.events.length} events`);console.log(`trace: ${file}`);
