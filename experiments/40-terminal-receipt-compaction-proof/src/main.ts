import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime,
  type Scorer, type TraceEvent,
} from '@swarmlab/core';
import type { Arm, ExpectedResult, ScenarioId, ScenarioResult } from './types.js';

const SEED = 'terminal-receipt-compaction-proof-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-15-exp40-baseline';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const HOOK = process.env['AEGIS_HOOK_DIST'] ?? `${AEGIS_REPO}/packages/aegis-hook/dist/index.js`;
const sha = (repo: string) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

type Permit = { id: string; approvalId: string };
type Receipt = { permitId: string; approvalId: string; operationId: string; receiptDigest: string; verified: boolean; failureCode?: string };
type Effect = { operationId: string; permit: any; state: string; claimed: boolean; successReceipt?: Receipt; failureReceipt?: Receipt; revision?: number };
type Proof = { operationId: string; permitId: string; approvalId: string; outcome: string; receiptDigest: string; failureCode?: string; revision: number; verified: boolean };
type ApiResult = { status: string; reason?: string; retryable?: boolean };

const links = [
  { actorId: 'user:beaux', verified: true, authorityLevel: 10 },
  { actorId: 'agent:child-a', verified: true, authorityLevel: 6 },
];
const call: any = {
  tool: 'Bash', command: 'npm publish ./dist/pkg.tgz',
  approvalEnvelope: { operation: 'approved_retry', riskLevel: 'high', freshnessWindowMs: 600000, observedAt: '2026-09-16T06:00:00Z', artifactDigest: 'sha256:pkg', verificationDigest: 'sha256:tests', targetDigest: 'registry:prod:v1' },
  approvalProvenance: { actorId: 'agent:child-a', sessionId: 'session:a', workspaceId: 'workspace:aegis', taskIntentId: 'intent:publish', authorizationDigest: 'auth:epoch-10', grantScope: 'exact_session' },
  approvalDelegation: { effectiveConsumerId: 'agent:child-a', declaredScope: 'direct', maxDepth: 1, links, revoked: false, revocationChecked: true, structurallyValid: true },
};
const grant: any = {
  ...call,
  approvalProvenance: { ...call.approvalProvenance, actorId: 'user:beaux' },
  approvalDelegation: { ...call.approvalDelegation, effectiveConsumerId: 'user:beaux', links: [links[0]] },
};
const operationId = 'op_terminal_compaction_proof';

class Store {
  records = new Map<string, any>();
  effects = new Map<string, Effect>();
  proof: Proof | Record<string, unknown> | undefined;
  highWater: number | undefined = 1;
  proofUnavailable = false;

  async create(record: any) { if (this.records.has(record.id)) return false; this.records.set(record.id, structuredClone(record)); return true; }
  async take(id: string) { const record = this.records.get(id); this.records.delete(id); return record; }
  async prepareEffect(id: string, op: string) { const record = this.records.get(id); if (!record) return false; this.records.delete(id); this.effects.set(op, { operationId: op, permit: structuredClone(record), state: 'authorized', claimed: false, revision: 1 }); return true; }
  async claimPreparedEffect(op: string) { const effect = this.effects.get(op); if (!effect || effect.claimed) return undefined; effect.claimed = true; return structuredClone(effect.permit); }
  async beginEffect(op: string) { const effect = this.effects.get(op); if (!effect) return false; effect.state = 'started'; effect.revision = 2; this.highWater = 2; return true; }
  async commitEffect() { return false; }
  async burnEffect() { return true; }
  async readEffect(op: string) { const effect = this.effects.get(op); return effect ? structuredClone(effect) : undefined; }
  async readEffectRevision() { return this.highWater; }
  async readEffectTerminalProof() { if (this.proofUnavailable) throw new Error('proof store down'); return this.proof === undefined ? undefined : structuredClone(this.proof); }
  async completeEffect() { return 'not_started' as const; }
  async failEffect() { return 'not_started' as const; }
}

interface Runtime {
  evaluate(value: any): any;
  decide(evaluation: any, value: any, dir: string): any;
  approvePending(id: string, dir: string): void;
  approvalId(value: any, evaluation: any): string;
  createExecutionPermitWithStore(value: any, evaluation: any, id: string, store: any): Promise<Permit>;
  finalizeExecutionPermitWithEffectJournal(permit: Permit, current: any, op: string, store: any): Promise<any>;
  resolveExecutionEffect(permit: Permit, current: any, op: string, store: any): Promise<ApiResult>;
  resolveCompactedExecutionEffect?: (permit: Permit, current: any, op: string, store: any) => Promise<ApiResult>;
}

async function loadRuntime(): Promise<Runtime> {
  const aegis: any = await import(pathToFileURL(AEGIS_DIST).href);
  const hook: any = await import(pathToFileURL(HOOK).href);
  const rules = hook.loadAllPacks();
  return {
    evaluate: value => aegis.evaluate(value, rules),
    decide: (evaluation, value, dir) => hook.decide(evaluation, { call: value, approvalDir: dir }),
    approvePending: hook.approvePending,
    approvalId: hook.approvalId,
    createExecutionPermitWithStore: hook.createExecutionPermitWithStore,
    finalizeExecutionPermitWithEffectJournal: hook.finalizeExecutionPermitWithEffectJournal,
    resolveExecutionEffect: hook.resolveExecutionEffect,
    resolveCompactedExecutionEffect: hook.resolveCompactedExecutionEffect,
  };
}

async function setup(runtime: Runtime, dir: string, store: Store) {
  const grantEval = runtime.evaluate(grant);
  const ask = runtime.decide(grantEval, grant, dir);
  runtime.approvePending(ask.approval.id, dir);
  const evaluation = runtime.evaluate(call);
  const consume = runtime.decide(evaluation, call, dir);
  const permit = await runtime.createExecutionPermitWithStore(call, evaluation, runtime.approvalId(call, evaluation), store);
  const current = { approvalId: permit.approvalId, authorizationDigest: 'auth:epoch-10', effectiveConsumerId: 'agent:child-a', links, revoked: false, revocationChecked: true, structurallyValid: true };
  await runtime.finalizeExecutionPermitWithEffectJournal(permit, current, operationId, store);
  return { permit, current, ask: ask.exitCode === 2, consume: consume.approval?.event === 'consumed' };
}

const scenarios: ScenarioId[] = [
  'unpruned-success', 'unpruned-failure', 'pruned-success-valid-proof', 'pruned-failure-valid-proof',
  'pruned-proof-missing', 'pruned-proof-unverified', 'pruned-proof-malformed',
  'pruned-proof-wrong-operation', 'pruned-proof-wrong-permit', 'pruned-proof-wrong-approval',
  'pruned-proof-wrong-outcome', 'pruned-proof-wrong-receipt-digest',
  'pruned-proof-stale-revision', 'pruned-proof-future-revision', 'pruned-proof-read-unavailable',
  'stale-authorized-plus-valid-terminal-proof', 'pruned-nonterminal-high-water',
];
const arms: Arm[] = ['record-only-control', 'compaction-proof-fixture', 'aegis-wrapped'];

function expected(scenario: ScenarioId): ExpectedResult {
  if (scenario === 'unpruned-success' || scenario === 'pruned-success-valid-proof' || scenario === 'stale-authorized-plus-valid-terminal-proof') return { status: 'executed', reason: 'effect_committed', retryable: false };
  if (scenario === 'unpruned-failure' || scenario === 'pruned-failure-valid-proof') return { status: 'not_executed', reason: 'effect_failed', retryable: false };
  if (scenario === 'pruned-proof-missing' || scenario === 'pruned-proof-stale-revision' || scenario === 'pruned-nonterminal-high-water') return { status: 'indeterminate', reason: 'journal_stale', retryable: false };
  if (scenario === 'pruned-proof-read-unavailable') return { status: 'indeterminate', reason: 'journal_unavailable', retryable: false };
  return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
}

function configure(store: Store, permit: Permit, scenario: ScenarioId) {
  const base = store.effects.get(operationId)!;
  const success: Receipt = { permitId: permit.id, approvalId: permit.approvalId, operationId, receiptDigest: `sha256:${'a'.repeat(64)}`, verified: true };
  const failure: Receipt = { permitId: permit.id, approvalId: permit.approvalId, operationId, receiptDigest: `sha256:${'b'.repeat(64)}`, verified: true, failureCode: 'external_rejected' };
  const successProof: Proof = { operationId, permitId: permit.id, approvalId: permit.approvalId, outcome: 'committed', receiptDigest: success.receiptDigest, revision: 3, verified: true };
  const failureProof: Proof = { operationId, permitId: permit.id, approvalId: permit.approvalId, outcome: 'failed', receiptDigest: failure.receiptDigest, failureCode: 'external_rejected', revision: 3, verified: true };

  store.highWater = 3;
  store.effects.delete(operationId);
  store.proof = undefined;
  if (scenario === 'unpruned-success') store.effects.set(operationId, { ...base, state: 'committed', claimed: true, successReceipt: success, revision: 3 });
  else if (scenario === 'unpruned-failure') store.effects.set(operationId, { ...base, state: 'failed', claimed: true, failureReceipt: failure, revision: 3 });
  else if (scenario === 'pruned-success-valid-proof') store.proof = successProof;
  else if (scenario === 'pruned-failure-valid-proof') store.proof = failureProof;
  else if (scenario === 'pruned-proof-unverified') store.proof = { ...successProof, verified: false };
  else if (scenario === 'pruned-proof-malformed') store.proof = { ...successProof, revision: '3' };
  else if (scenario === 'pruned-proof-wrong-operation') store.proof = { ...successProof, operationId: 'op_other' };
  else if (scenario === 'pruned-proof-wrong-permit') store.proof = { ...successProof, permitId: `permit_${'f'.repeat(24)}` };
  else if (scenario === 'pruned-proof-wrong-approval') store.proof = { ...successProof, approvalId: `aegis_${'f'.repeat(16)}` };
  else if (scenario === 'pruned-proof-wrong-outcome') store.proof = { ...successProof, failureCode: 'external_rejected' };
  else if (scenario === 'pruned-proof-wrong-receipt-digest') store.proof = { ...successProof, receiptDigest: 'sha256:not-a-digest' };
  else if (scenario === 'pruned-proof-stale-revision') store.proof = { ...successProof, revision: 2 };
  else if (scenario === 'pruned-proof-future-revision') store.proof = { ...successProof, revision: 4 };
  else if (scenario === 'pruned-proof-read-unavailable') store.proofUnavailable = true;
  else if (scenario === 'stale-authorized-plus-valid-terminal-proof') { store.effects.set(operationId, { ...base, state: 'authorized', claimed: true, revision: 1 }); store.proof = successProof; }
  else if (scenario === 'pruned-nonterminal-high-water') store.highWater = 2;
}

function validDigest(value: unknown): value is string { return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value); }
function fixtureResolve(effect: Effect | undefined, highWater: number | undefined, proof: unknown, proofUnavailable: boolean, permit: Permit): ApiResult {
  if (effect !== undefined && effect.revision === highWater) {
    if (effect.state === 'committed' && effect.successReceipt) return { status: 'executed', reason: 'effect_committed', retryable: false };
    if (effect.state === 'failed' && effect.failureReceipt) return { status: 'not_executed', reason: 'effect_failed', retryable: false };
  }
  if (proofUnavailable) return { status: 'indeterminate', reason: 'journal_unavailable', retryable: false };
  if (proof === undefined) return { status: 'indeterminate', reason: 'journal_stale', retryable: false };
  if (proof === null || typeof proof !== 'object') return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
  const p = proof as Partial<Proof>;
  if (!Number.isSafeInteger(highWater) || highWater! <= 0 || !Number.isSafeInteger(p.revision) || p.revision! <= 0) return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
  if (p.revision! < highWater!) return { status: 'indeterminate', reason: 'journal_stale', retryable: false };
  if (p.revision! > highWater!) return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
  const committed = p.outcome === 'committed' && p.failureCode === undefined;
  const failed = p.outcome === 'failed' && typeof p.failureCode === 'string' && /^[a-z0-9_]{1,64}$/.test(p.failureCode);
  if (p.verified !== true || p.operationId !== operationId || p.permitId !== permit.id || p.approvalId !== permit.approvalId || !validDigest(p.receiptDigest) || (!committed && !failed)) return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
  return committed ? { status: 'executed', reason: 'effect_committed', retryable: false } : { status: 'not_executed', reason: 'effect_failed', retryable: false };
}

function recordOnlyResolve(effect: Effect | undefined, highWater: number | undefined, permit: Permit): ApiResult {
  return fixtureResolve(effect, highWater, undefined, false, permit);
}

async function runScenario(arm: Arm, scenario: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-exp40-'));
  const store = new Store();
  try {
    const { permit, current, ask, consume } = await setup(runtime, dir, store);
    configure(store, permit, scenario);
    let result: ApiResult;
    let apiAvailable = true;
    if (arm === 'record-only-control') result = recordOnlyResolve(store.effects.get(operationId), store.highWater, permit);
    else if (arm === 'compaction-proof-fixture') result = fixtureResolve(store.effects.get(operationId), store.highWater, store.proof, store.proofUnavailable, permit);
    else {
      apiAvailable = typeof runtime.resolveCompactedExecutionEffect === 'function';
      const resolver = runtime.resolveCompactedExecutionEffect ?? runtime.resolveExecutionEffect;
      result = await resolver(permit, current, operationId, store);
    }
    const want = expected(scenario);
    const actual = { status: result.status, reason: result.reason ?? '', retryable: result.retryable ?? false };
    const correct = actual.status === want.status && actual.reason === want.reason && actual.retryable === want.retryable;
    const invalidProof = scenario.startsWith('pruned-proof-') && !['pruned-proof-missing', 'pruned-proof-stale-revision', 'pruned-proof-read-unavailable'].includes(scenario);
    const validProof = ['pruned-success-valid-proof', 'pruned-failure-valid-proof', 'stale-authorized-plus-valid-terminal-proof'].includes(scenario);
    return {
      scenarioId: scenario, ...actual,
      expectedStatus: want.status, expectedReason: want.reason, expectedRetryable: want.retryable,
      correct,
      acceptedInvalidProof: invalidProof && (actual.status === 'executed' || actual.status === 'not_executed'),
      staleRetryAuthority: ['stale-authorized-plus-valid-terminal-proof', 'pruned-nonterminal-high-water'].includes(scenario) && actual.retryable,
      recoveredTerminalProof: validProof && correct,
      apiAvailable, askCovered: ask, consumeCovered: consume,
    };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const runtime = await loadRuntime();
const runId = `tcp-${Date.now().toString(36)}`;
const runDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runDir, { recursive: true });
const tracePath = join(runDir, `${runId}.jsonl`);
const trace = new TraceWriter(tracePath, { runId, experiment: '40-terminal-receipt-compaction-proof' });
const bus = new MessageBus({ trace });
const stub = new StubRuntime();
const results = new Map<Arm, ScenarioResult[]>();
bus.publish({ from: 'moderator', to: '*', topic: 'meta', body: { evidenceVersion: 1, experiment: '40-terminal-receipt-compaction-proof', spec: '46-terminal-receipt-compaction-proof', runId, timestamp: new Date().toISOString(), seed: SEED, scenarios, arms, aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'built-artifact+real-hook-public-api' } } });
for (const arm of arms) {
  const agent = await spawnAgent({ id: `tcp:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace });
  const rows: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    const row = await runScenario(arm, scenario, runtime); rows.push(row);
    bus.publish({ from: agent.id, to: 'moderator', topic: 'scenario', body: { arm, ...row } });
  }
  results.set(arm, rows); await agent.kill(); bus.removeAgent(agent.id);
}
const metrics = (arm: Arm) => {
  const rows = results.get(arm)!;
  const row = (id: ScenarioId) => rows.find(value => value.scenarioId === id)!;
  const invalid = rows.filter(value => value.scenarioId.startsWith('pruned-proof-') && !['pruned-proof-missing', 'pruned-proof-stale-revision', 'pruned-proof-read-unavailable'].includes(value.scenarioId));
  const valid = rows.filter(value => ['pruned-success-valid-proof', 'pruned-failure-valid-proof', 'stale-authorized-plus-valid-terminal-proof'].includes(value.scenarioId));
  return {
    terminalProofRecoveryRate: valid.filter(value => value.recoveredTerminalProof).length / valid.length,
    falseTerminalProofAcceptanceRate: invalid.filter(value => value.acceptedInvalidProof).length / invalid.length,
    staleRetryAuthorityRate: rows.filter(value => value.staleRetryAuthority).length / 2,
    resolutionAccuracy: rows.filter(value => value.correct).length / rows.length,
    compactionProofApiAvailability: rows.every(value => value.apiAvailable) ? 1 : 0,
    unprunedSuccessPreservation: row('unpruned-success').correct ? 1 : 0,
    unprunedFailurePreservation: row('unpruned-failure').correct ? 1 : 0,
    validCompactedSuccessPreservation: row('pruned-success-valid-proof').correct ? 1 : 0,
    validCompactedFailurePreservation: row('pruned-failure-valid-proof').correct ? 1 : 0,
    missingProofFailClosedSafety: row('pruned-proof-missing').correct ? 1 : 0,
    invalidProofFailClosedSafety: invalid.every(value => value.correct) ? 1 : 0,
    revisionSafety: row('pruned-proof-stale-revision').correct && row('pruned-proof-future-revision').correct ? 1 : 0,
    unavailableProofSafety: row('pruned-proof-read-unavailable').correct ? 1 : 0,
    terminalProofOverrideSafety: row('stale-authorized-plus-valid-terminal-proof').correct ? 1 : 0,
    nonterminalProofSafety: row('pruned-nonterminal-high-water').correct ? 1 : 0,
    askCoverage: rows.every(value => value.askCovered) ? 1 : 0,
    consumeCoverage: rows.every(value => value.consumeCovered) ? 1 : 0,
  };
};
for (const arm of arms) {
  const values = metrics(arm);
  trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(values).map(([key, value]) => [`${arm.replaceAll('-', '_')}_${key}`, value])) });
  console.log(arm, values);
}
const green = (values: ReturnType<typeof metrics>) => values.terminalProofRecoveryRate === 1 && values.falseTerminalProofAcceptanceRate === 0 && values.staleRetryAuthorityRate === 0 && values.resolutionAccuracy === 1 && Object.entries(values).filter(([key]) => !['falseTerminalProofAcceptanceRate', 'staleRetryAuthorityRate'].includes(key)).every(([, value]) => value === 1);
const scorer: Scorer = { score() { const fixture = metrics('compaction-proof-fixture'); const aegis = metrics('aegis-wrapped'); return { fixtureGreen: green(fixture) ? 1 : 0, baselineAegisRed: green(aegis) ? 0 : 1, ...Object.fromEntries(Object.entries(aegis).map(([key, value]) => [`aegisWrapped${key[0]!.toUpperCase()}${key.slice(1)}`, value])) }; } };
const summary = runScorer(scorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));
const written = trace.toRunRecord(); const replayed = await readRunRecord(tracePath);
const count = (events: readonly TraceEvent[], type: TraceEvent['t']) => events.filter(event => event.t === type).length;
for (const type of ['spawn', 'message', 'score', 'kill'] as const) if (count(written.events, type) !== count(replayed.events, type)) throw new Error(`replay mismatch ${type}`);
console.log(`replay verified: ${replayed.events.length} events`);
console.log(`trace: ${tracePath}`);
