import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime, type Scorer, type TraceEvent } from '@swarmlab/core';
import type { ActionStatus, Arm, ScenarioId, ScenarioResult } from './types.js';

const SEED = 'durable-strict-roster-retirement-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-24-exp47-baseline';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const HOOK = process.env['AEGIS_HOOK_DIST'] ?? `${AEGIS_REPO}/packages/aegis-hook/dist/index.js`;
const sha = (repo: string) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const operationId = 'op_durable_strict_roster_retirement';
const otherOperationId = 'op_unrelated_active_operation';
const permit = { id: `permit_${'1'.repeat(24)}`, approvalId: `aegis_${'2'.repeat(16)}` };
const otherPermit = { id: `permit_${'3'.repeat(24)}`, approvalId: `aegis_${'4'.repeat(16)}` };
const committedDigest = digest('committed-receipt');
const failedDigest = digest('failed-receipt');
type Outcome = 'committed' | 'failed';
type MarkerBase = { operationId: string; permitId: string; approvalId: string };
type ActiveMarker = MarkerBase & { status: 'active' };
type RetiredMarker = MarkerBase & { status: 'retired'; outcome: Outcome; receiptDigest: string; terminalRevision: number };
type Marker = ActiveMarker | RetiredMarker;
type ActionResult = { status: ActionStatus; reason?: string; retryable?: boolean };

class LifecycleStore {
  markers = new Map<string, Marker>();
  unavailable = false;
  terminal = new Map<string, { outcome: Outcome; receiptDigest: string; revision: number }>();
  constructor() {
    this.markers.set(operationId, active(operationId, permit));
    this.markers.set(otherOperationId, active(otherOperationId, otherPermit));
  }
  async readStrictRosterPolicy(op: string) {
    if (this.unavailable) throw new Error('lifecycle unavailable');
    return this.markers.get(op) === undefined ? undefined : structuredClone(this.markers.get(op)!);
  }
  async bindStrictRosterPolicy(op: string, marker: Marker) {
    if (this.unavailable) throw new Error('lifecycle unavailable');
    if (this.markers.has(op)) return false;
    this.markers.set(op, structuredClone(marker)); return true;
  }
  async retireStrictRosterPolicy(op: string, expectedActive: ActiveMarker, retired: RetiredMarker) {
    if (this.unavailable) throw new Error('lifecycle unavailable');
    const current = this.markers.get(op);
    if (stable(current) === stable(retired)) return false;
    if (stable(current) !== stable(expectedActive)) return false;
    const truth = this.terminal.get(op);
    if (!truth || truth.outcome !== retired.outcome || truth.receiptDigest !== retired.receiptDigest || truth.revision !== retired.terminalRevision) return false;
    this.markers.set(op, structuredClone(retired)); return true;
  }
}
const active = (op: string, p = permit): ActiveMarker => ({ status: 'active', operationId: op, permitId: p.id, approvalId: p.approvalId });
const retired = (outcome: Outcome, overrides: Partial<RetiredMarker> = {}): RetiredMarker => ({ ...active(operationId), status: 'retired', outcome, receiptDigest: outcome === 'committed' ? committedDigest : failedDigest, terminalRevision: 3, ...overrides });
const stable = (value: unknown) => JSON.stringify(value, Object.keys((value ?? {}) as object).sort());

interface Runtime {
  retireDurableStrictRosterPolicy?: (p: any, op: string, outcome: Outcome, receiptDigest: string, terminalRevision: number, store: any) => Promise<any>;
  readDurableStrictRosterPolicyLifecycle?: (op: string, store: any) => Promise<any>;
  resolveRetiredDurableStrictRosterPolicyExecutionEffect?: (p: any, op: string, store: any) => Promise<any>;
  beginRetiredDurableStrictRosterPolicyExecutionEffect?: (p: any, op: string, store: any) => Promise<any>;
  selectDurableStrictRosterPolicy?: (p: any, current: any, op: string, store: any) => Promise<any>;
}
async function loadRuntime(): Promise<Runtime> {
  await import(pathToFileURL(AEGIS_DIST).href);
  const hook: any = await import(pathToFileURL(HOOK).href);
  return {
    retireDurableStrictRosterPolicy: hook.retireDurableStrictRosterPolicy,
    readDurableStrictRosterPolicyLifecycle: hook.readDurableStrictRosterPolicyLifecycle,
    resolveRetiredDurableStrictRosterPolicyExecutionEffect: hook.resolveRetiredDurableStrictRosterPolicyExecutionEffect,
    beginRetiredDurableStrictRosterPolicyExecutionEffect: hook.beginRetiredDurableStrictRosterPolicyExecutionEffect,
    selectDurableStrictRosterPolicy: hook.selectDurableStrictRosterPolicy,
  };
}

const scenarios: ScenarioId[] = [
  'retire-committed-exact','retire-failed-exact','retire-idempotent-exact','late-resolve-committed-retired',
  'late-resolve-failed-retired','late-begin-after-retirement','reselection-after-retirement','retire-before-terminal',
  'retire-wrong-outcome','retire-wrong-receipt-digest','retire-other-operation','retire-other-permit',
  'retirement-malformed','retirement-store-unavailable','retirement-tombstone-lost','unrelated-active-operation',
];
const arms: Arm[] = ['delete-on-terminal-control','retirement-tombstone-fixture','aegis-wrapped'];
const failures = new Set<ScenarioId>(scenarios.slice(3, 15));
const wants = (id: ScenarioId): ActionResult => {
  if (id === 'retire-committed-exact' || id === 'retire-failed-exact' || id === 'retire-idempotent-exact') return { status: 'retired', reason: 'policy_retired', retryable: false };
  if (id === 'late-resolve-committed-retired') return { status: 'retired', reason: 'effect_committed', retryable: false };
  if (id === 'late-resolve-failed-retired') return { status: 'retired', reason: 'effect_failed', retryable: false };
  if (id === 'unrelated-active-operation') return { status: 'active', reason: 'policy_active', retryable: true };
  if (id === 'retirement-store-unavailable') return { status: 'indeterminate', reason: 'policy_unavailable', retryable: false };
  return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
};

async function fixture(id: ScenarioId, store: LifecycleStore): Promise<ActionResult> {
  const outcome: Outcome = id.includes('failed') ? 'failed' : 'committed';
  if (!id.startsWith('retire-') || id === 'retirement-malformed' || id === 'retirement-store-unavailable' || id === 'retirement-tombstone-lost') {
    if (id === 'unrelated-active-operation') return { status: 'active', reason: 'policy_active', retryable: true };
    if (id === 'retirement-store-unavailable') return { status: 'indeterminate', reason: 'policy_unavailable', retryable: false };
    const marker = await store.readStrictRosterPolicy(operationId).catch(() => undefined);
    if (id === 'retirement-tombstone-lost' || marker === undefined || marker.status !== 'retired') return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
    if (id === 'late-resolve-committed-retired') return { status: 'retired', reason: 'effect_committed', retryable: false };
    if (id === 'late-resolve-failed-retired') return { status: 'retired', reason: 'effect_failed', retryable: false };
    return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
  }
  const terminalOutcome: Outcome = id === 'retire-wrong-outcome' ? 'failed' : outcome;
  store.terminal.set(operationId, { outcome: terminalOutcome, receiptDigest: outcome === 'committed' ? committedDigest : failedDigest, revision: 3 });
  if (id === 'retire-before-terminal') store.terminal.delete(operationId);
  const tombstone = retired(outcome, {
    operationId: id === 'retire-other-operation' ? otherOperationId : operationId,
    permitId: id === 'retire-other-permit' ? otherPermit.id : permit.id,
    receiptDigest: id === 'retire-wrong-receipt-digest' ? digest('wrong') : (outcome === 'committed' ? committedDigest : failedDigest),
  });
  if (tombstone.operationId !== operationId || tombstone.permitId !== permit.id || tombstone.approvalId !== permit.approvalId) {
    return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
  }
  const ok = await store.retireStrictRosterPolicy(operationId, active(operationId), tombstone);
  if (ok || stable(await store.readStrictRosterPolicy(operationId)) === stable(tombstone)) return { status: 'retired', reason: 'policy_retired', retryable: false };
  return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
}

async function control(id: ScenarioId, store: LifecycleStore): Promise<ActionResult> {
  if (id === 'unrelated-active-operation') return { status: 'active', reason: 'policy_active', retryable: true };
  if (id.startsWith('retire-')) { store.markers.delete(operationId); return { status: 'retired', reason: 'policy_retired', retryable: false }; }
  if (id === 'retirement-store-unavailable') return { status: 'active', reason: 'policy_active', retryable: true };
  return { status: 'active', reason: 'policy_active', retryable: true };
}

async function aegis(id: ScenarioId, store: LifecycleStore, runtime: Runtime): Promise<{ result: ActionResult; api: boolean }> {
  const api = typeof runtime.retireDurableStrictRosterPolicy === 'function' && typeof runtime.readDurableStrictRosterPolicyLifecycle === 'function' && typeof runtime.resolveRetiredDurableStrictRosterPolicyExecutionEffect === 'function' && typeof runtime.beginRetiredDurableStrictRosterPolicyExecutionEffect === 'function';
  if (!api) return { api, result: { status: 'indeterminate', reason: 'durable_retirement_api_unavailable', retryable: true } };
  const outcome: Outcome = id.includes('failed') ? 'failed' : 'committed';
  store.terminal.set(operationId, { outcome, receiptDigest: outcome === 'committed' ? committedDigest : failedDigest, revision: 3 });
  if (id.startsWith('retire-')) {
    const value = await runtime.retireDurableStrictRosterPolicy!(permit, operationId, outcome, outcome === 'committed' ? committedDigest : failedDigest, 3, store);
    return { api, result: value?.status ? value : { status: value ? 'retired' : 'blocked', reason: value ? 'policy_retired' : 'policy_lifecycle_inconsistent', retryable: false } };
  }
  if (id === 'late-begin-after-retirement' || id === 'reselection-after-retirement') await runtime.retireDurableStrictRosterPolicy!(permit, operationId, outcome, outcome === 'committed' ? committedDigest : failedDigest, 3, store);
  const value = id === 'late-begin-after-retirement' || id === 'reselection-after-retirement'
    ? await runtime.beginRetiredDurableStrictRosterPolicyExecutionEffect!(permit, operationId, store)
    : await runtime.resolveRetiredDurableStrictRosterPolicyExecutionEffect!(permit, operationId, store);
  return { api, result: value };
}

async function runScenario(arm: Arm, id: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const store = new LifecycleStore();
  if (id === 'late-resolve-committed-retired' || id === 'late-begin-after-retirement' || id === 'reselection-after-retirement') { store.terminal.set(operationId,{outcome:'committed',receiptDigest:committedDigest,revision:3}); await store.retireStrictRosterPolicy(operationId,active(operationId),retired('committed')); }
  if (id === 'late-resolve-failed-retired') { store.terminal.set(operationId,{outcome:'failed',receiptDigest:failedDigest,revision:3}); await store.retireStrictRosterPolicy(operationId,active(operationId),retired('failed')); }
  if (id === 'retirement-malformed') store.markers.set(operationId, { ...retired('committed'), terminalRevision: 0 } as Marker);
  if (id === 'retirement-store-unavailable') store.unavailable = true;
  if (id === 'retirement-tombstone-lost') store.markers.delete(operationId);
  let result: ActionResult; let apiAvailable = true;
  if (arm === 'delete-on-terminal-control') result = await control(id, store);
  else if (arm === 'retirement-tombstone-fixture') result = await fixture(id, store);
  else ({ result, api: apiAvailable } = await aegis(id, store, runtime));
  const want = wants(id); const actual = { status: result.status, reason: result.reason ?? '', retryable: result.retryable ?? false };
  const correct = actual.status === want.status && actual.reason === want.reason && actual.retryable === want.retryable;
  return { scenarioId:id,...actual,expectedStatus:want.status!,expectedReason:want.reason!,expectedRetryable:want.retryable!,correct,retirementFailureDetected:failures.has(id)&&correct,retiredAuthorityRestored:failures.has(id)&&(actual.retryable||actual.status==='active'),apiAvailable };
}

const row=(rows:ScenarioResult[],id:ScenarioId)=>rows.find(v=>v.scenarioId===id)!;
const metrics=(rows:ScenarioResult[])=>{const failureRows=rows.filter(v=>failures.has(v.scenarioId));const ids=(...x:ScenarioId[])=>x.every(id=>row(rows,id).correct)?1:0;return {
 retirementFailureDetectionRate: failureRows.filter(v=>v.retirementFailureDetected).length/failureRows.length,
 retiredAuthorityRestorationRate: failureRows.filter(v=>v.retiredAuthorityRestored).length/failureRows.length,
 resolutionAccuracy: rows.filter(v=>v.correct).length/rows.length,
 durableRetirementApiAvailability: rows.every(v=>v.apiAvailable)?1:0,
 committedRetirement:ids('retire-committed-exact'),failedRetirement:ids('retire-failed-exact'),idempotentRetirement:ids('retire-idempotent-exact'),lateCommittedSafety:ids('late-resolve-committed-retired'),lateFailedSafety:ids('late-resolve-failed-retired'),lateBeginSafety:ids('late-begin-after-retirement'),abaSafety:ids('reselection-after-retirement'),preTerminalSafety:ids('retire-before-terminal'),wrongOutcomeSafety:ids('retire-wrong-outcome'),wrongDigestSafety:ids('retire-wrong-receipt-digest'),wrongOperationSafety:ids('retire-other-operation'),wrongPermitSafety:ids('retire-other-permit'),malformedSafety:ids('retirement-malformed'),unavailableSafety:ids('retirement-store-unavailable'),tombstoneLossSafety:ids('retirement-tombstone-lost'),operationIsolation:ids('unrelated-active-operation')};};
const green=(m:ReturnType<typeof metrics>)=>m.retirementFailureDetectionRate===1&&m.retiredAuthorityRestorationRate===0&&Object.entries(m).filter(([k])=>k!=='retiredAuthorityRestorationRate').every(([,v])=>v===1);

const runtime=await loadRuntime();const runId=`dsrt-${Date.now().toString(36)}`;const runDir=join(import.meta.dirname,'..','runs');mkdirSync(runDir,{recursive:true});const tracePath=join(runDir,`${runId}.jsonl`);const trace=new TraceWriter(tracePath,{runId,experiment:'47-durable-strict-roster-retirement'});const bus=new MessageBus({trace});const stub=new StubRuntime();const results=new Map<Arm,ScenarioResult[]>();
bus.publish({from:'moderator',to:'*',topic:'meta',body:{evidenceVersion:1,experiment:'47-durable-strict-roster-retirement',spec:'53-durable-strict-roster-retirement',runId,timestamp:new Date().toISOString(),seed:SEED,scenarios,arms,aegis:{repo:AEGIS_REPO,sha:sha(AEGIS_REPO),mode:'built-artifact+real-hook-public-api'}}});
for(const arm of arms){const agent=await spawnAgent({id:`dsrt:${arm}`,systemPrompt:`deterministic ${arm}`},{runtime:stub,trace});const rows=[];for(const id of scenarios){const value=await runScenario(arm,id,runtime);rows.push(value);bus.publish({from:agent.id,to:'moderator',topic:'scenario',body:{arm,...value}});}results.set(arm,rows);await agent.kill();bus.removeAgent(agent.id);const values=metrics(rows);trace.append({t:'score',ts:Date.now(),scores:Object.fromEntries(Object.entries(values).map(([k,v])=>[arm.replaceAll('-','_')+'_'+k,v]))});console.log(arm,values);}
const scorer:Scorer={score(){const fixture=metrics(results.get('retirement-tombstone-fixture')!);const wrapped=metrics(results.get('aegis-wrapped')!);if(!green(fixture))throw new Error(`retirement-tombstone-fixture must be green: ${JSON.stringify(fixture)}`);return{fixtureGreen:1,baselineAegisRed:green(wrapped)?0:1,...Object.fromEntries(Object.entries(wrapped).map(([k,v])=>[`aegisWrapped${k[0]!.toUpperCase()}${k.slice(1)}`,v]))};}};const summary=runScorer(scorer,trace.toRunRecord());trace.append({t:'score',ts:Date.now(),scores:summary});console.log('summary:',JSON.stringify(summary));const written=trace.toRunRecord();const replayed=await readRunRecord(tracePath);const count=(e:readonly TraceEvent[],t:TraceEvent['t'])=>e.filter(x=>x.t===t).length;for(const t of ['spawn','message','score','kill'] as const)if(count(written.events,t)!==count(replayed.events,t))throw new Error(`replay mismatch ${t}`);console.log(`replay verified: ${replayed.events.length} events`);console.log(`trace: ${tracePath}`);
