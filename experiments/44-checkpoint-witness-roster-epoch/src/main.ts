import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  MessageBus,
  TraceWriter,
  readRunRecord,
  runScorer,
  spawnAgent,
  StubRuntime,
  type Scorer,
  type TraceEvent,
} from '@swarmlab/core';
import type { Arm, ExpectedOutcome, ScenarioId, ScenarioResult } from './types.js';

const SEED = 'checkpoint-witness-roster-epoch-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-19-exp44';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const HOOK = process.env['AEGIS_HOOK_DIST'] ?? `${AEGIS_REPO}/packages/aegis-hook/dist/index.js`;
const sha = (repo: string) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

type Permit = { id: string; approvalId: string };
type Receipt = { permitId: string; approvalId: string; operationId: string; receiptDigest: string; verified: boolean };
type Effect = { operationId: string; permit: any; state: string; claimed: boolean; successReceipt?: Receipt; revision?: number };
type Proof = { operationId: string; permitId: string; approvalId: string; outcome: string; receiptDigest: string; revision: number; verified: boolean };
type Checkpoint = { operationId: string; revision: number; verified: boolean };
type AuthorityCheckpoint = { authorityId: string; operationId: string; revision: number; verified: boolean; historyDigest: string };
type WitnessSet = { operationId: string; requiredAuthorityIds: string[]; minimumRequiredAuthorities: number; verified: boolean };
type WitnessRoster = WitnessSet & { rosterEpoch: number; rosterDigest: string };
type ApiResult = { status: import('./types.js').OutcomeStatus; reason?: string; retryable?: boolean };

const operationId = 'op_checkpoint_witness_roster_epoch';
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(',')}}`;
}
const rosterDigest = (authorityIds: string[], minimumRequiredAuthorities: number, rosterEpoch: number) =>
  `sha256:${createHash('sha256').update(stable({
    operationId,
    rosterEpoch,
    minimumRequiredAuthorities,
    requiredAuthorityIds: [...authorityIds].sort(),
  })).digest('hex')}`;
const oldRosterDigest = rosterDigest(['witness-a', 'witness-b'], 2, 1);
const currentRosterDigest = rosterDigest(['witness-a', 'witness-b', 'witness-c'], 3, 2);
const terminalDigest = `sha256:${'e'.repeat(64)}`;
const links = [
  { actorId: 'user:beaux', verified: true, authorityLevel: 10 },
  { actorId: 'agent:child-a', verified: true, authorityLevel: 6 },
];
const call: any = {
  tool: 'Bash',
  command: 'npm publish ./dist/pkg.tgz',
  approvalEnvelope: {
    operation: 'approved_retry',
    riskLevel: 'high',
    freshnessWindowMs: 600000,
    observedAt: '2026-09-20T06:00:00Z',
    artifactDigest: 'sha256:pkg',
    verificationDigest: 'sha256:tests',
    targetDigest: 'registry:prod:v1',
  },
  approvalProvenance: {
    actorId: 'agent:child-a',
    sessionId: 'session:a',
    workspaceId: 'workspace:aegis',
    taskIntentId: 'intent:publish',
    authorizationDigest: 'auth:epoch-14',
    grantScope: 'exact_session',
  },
  approvalDelegation: {
    effectiveConsumerId: 'agent:child-a',
    declaredScope: 'direct',
    maxDepth: 1,
    links,
    revoked: false,
    revocationChecked: true,
    structurallyValid: true,
  },
};
const grant: any = {
  ...call,
  approvalProvenance: { ...call.approvalProvenance, actorId: 'user:beaux' },
  approvalDelegation: { ...call.approvalDelegation, effectiveConsumerId: 'user:beaux', links: [links[0]] },
};

class Store {
  records = new Map<string, any>();
  effects = new Map<string, Effect>();
  highWater: number | undefined = 1;
  proof: Proof | undefined;
  checkpoint: Checkpoint | undefined = { operationId, revision: 1, verified: true };
  authorityCheckpoints: AuthorityCheckpoint[] | undefined = authorities(['witness-a', 'witness-b', 'witness-c'], 1, currentRosterDigest);
  witnessSet: WitnessSet | undefined = visibleSet(['witness-a', 'witness-b', 'witness-c'], 3);
  witnessRoster: WitnessRoster | undefined = currentRoster();
  witnessRosterUnavailable = false;
  revisionUnavailable = false;
  postCasRosterSplit = false;

  async create(record: any) {
    if (this.records.has(record.id)) return false;
    this.records.set(record.id, structuredClone(record));
    return true;
  }
  async take(id: string) {
    const record = this.records.get(id);
    this.records.delete(id);
    return record;
  }
  async prepareEffect(id: string, op: string) {
    const record = this.records.get(id);
    if (!record) return false;
    this.records.delete(id);
    this.effects.set(op, { operationId: op, permit: structuredClone(record), state: 'authorized', claimed: false, revision: 1 });
    return true;
  }
  async claimPreparedEffect(op: string) {
    const effect = this.effects.get(op);
    if (!effect || effect.claimed) return undefined;
    effect.claimed = true;
    return structuredClone(effect.permit);
  }
  async beginEffect(op: string) {
    const effect = this.effects.get(op);
    if (!effect) return false;
    effect.state = 'started';
    effect.revision = 2;
    this.highWater = 2;
    this.checkpoint = { operationId, revision: 2, verified: true };
    if (this.postCasRosterSplit) {
      this.authorityCheckpoints = authorities(['witness-a', 'witness-b'], 2, oldRosterDigest);
      this.witnessSet = visibleSet(['witness-a', 'witness-b'], 2);
      this.witnessRoster = currentRoster();
    }
    return true;
  }
  async commitEffect() { return false; }
  async burnEffect() { return true; }
  async readEffect(op: string) {
    const effect = this.effects.get(op);
    return effect ? structuredClone(effect) : undefined;
  }
  async readEffectRevision() {
    if (this.revisionUnavailable) throw new Error('revision down');
    return this.highWater;
  }
  async readEffectTerminalProof() {
    return this.proof ? structuredClone(this.proof) : undefined;
  }
  async readEffectRevisionCheckpoint() {
    return this.checkpoint === undefined ? undefined : structuredClone(this.checkpoint);
  }
  async readEffectRevisionCheckpoints() {
    return this.authorityCheckpoints === undefined ? undefined : structuredClone(this.authorityCheckpoints);
  }
  async readEffectRevisionWitnessSet() {
    return this.witnessSet === undefined ? undefined : structuredClone(this.witnessSet);
  }
  async readEffectRevisionWitnessRoster() {
    if (this.witnessRosterUnavailable) throw new Error('roster unavailable');
    return this.witnessRoster === undefined ? undefined : structuredClone(this.witnessRoster);
  }
  async completeEffect() { return 'not_started' as const; }
  async failEffect() { return 'not_started' as const; }
}

interface Runtime {
  evaluate(v: any): any;
  decide(e: any, v: any, d: string): any;
  approvePending(id: string, d: string): void;
  approvalId(v: any, e: any): string;
  createExecutionPermitWithStore(v: any, e: any, id: string, s: any): Promise<Permit>;
  finalizeExecutionPermitWithEffectJournal(p: Permit, c: any, o: string, s: any): Promise<any>;
  resolveExecutionEffect(p: Permit, c: any, o: string, s: any): Promise<ApiResult>;
  resolveAnchoredExecutionEffect?: (p: Permit, c: any, o: string, s: any) => Promise<ApiResult>;
  resolveMultiAuthorityAnchoredExecutionEffect?: (p: Permit, c: any, o: string, s: any) => Promise<ApiResult>;
  resolveWitnessSetAnchoredExecutionEffect?: (p: Permit, c: any, o: string, s: any) => Promise<ApiResult>;
  resolveWitnessRosterAnchoredExecutionEffect?: (p: Permit, c: any, o: string, s: any) => Promise<ApiResult>;
  beginExecutionEffect(p: Permit, c: any, o: string, s: any): Promise<ApiResult>;
}

async function loadRuntime(): Promise<Runtime> {
  const aegis: any = await import(pathToFileURL(AEGIS_DIST).href);
  const hook: any = await import(pathToFileURL(HOOK).href);
  const rules = hook.loadAllPacks();
  return {
    evaluate: (v) => aegis.evaluate(v, rules),
    decide: (e, v, d) => hook.decide(e, { call: v, approvalDir: d }),
    approvePending: hook.approvePending,
    approvalId: hook.approvalId,
    createExecutionPermitWithStore: hook.createExecutionPermitWithStore,
    finalizeExecutionPermitWithEffectJournal: hook.finalizeExecutionPermitWithEffectJournal,
    resolveExecutionEffect: hook.resolveExecutionEffect,
    resolveAnchoredExecutionEffect: hook.resolveAnchoredExecutionEffect,
    resolveMultiAuthorityAnchoredExecutionEffect: hook.resolveMultiAuthorityAnchoredExecutionEffect,
    resolveWitnessSetAnchoredExecutionEffect: hook.resolveWitnessSetAnchoredExecutionEffect,
    resolveWitnessRosterAnchoredExecutionEffect: hook.resolveWitnessRosterAnchoredExecutionEffect,
    beginExecutionEffect: hook.beginExecutionEffect,
  };
}

async function setup(runtime: Runtime, dir: string, store: Store) {
  const grantEvaluation = runtime.evaluate(grant);
  const ask = runtime.decide(grantEvaluation, grant, dir);
  runtime.approvePending(ask.approval.id, dir);
  const evaluation = runtime.evaluate(call);
  const consume = runtime.decide(evaluation, call, dir);
  const permit = await runtime.createExecutionPermitWithStore(call, evaluation, runtime.approvalId(call, evaluation), store);
  const current = {
    approvalId: permit.approvalId,
    authorizationDigest: 'auth:epoch-14',
    effectiveConsumerId: 'agent:child-a',
    links,
    revoked: false,
    revocationChecked: true,
    structurallyValid: true,
  };
  await runtime.finalizeExecutionPermitWithEffectJournal(permit, current, operationId, store);
  return { permit, current, ask: ask.exitCode === 2, consume: consume.approval?.event === 'consumed' };
}

const scenarios: ScenarioId[] = [
  'legacy-current-authorized',
  'complete-roster-current-authorized',
  'complete-roster-current-success',
  'complete-roster-compacted-success',
  'old-roster-authorized',
  'old-roster-started',
  'old-roster-terminal',
  'current-roster-hidden-rollback',
  'roster-digest-mismatch',
  'roster-epoch-rollback',
  'roster-truth-unavailable',
  'roster-truth-absent',
  'roster-truth-unverified',
  'roster-truth-duplicate-id',
  'roster-truth-missing-minimum',
  'post-cas-roster-split',
];
const arms: Arm[] = ['host-old-roster-control', 'strict-roster-epoch-fixture', 'aegis-wrapped'];
const splitScenarios = new Set<ScenarioId>([
  'old-roster-authorized',
  'old-roster-started',
  'old-roster-terminal',
  'current-roster-hidden-rollback',
  'roster-digest-mismatch',
  'roster-epoch-rollback',
  'post-cas-roster-split',
]);

function expected(id: ScenarioId): ExpectedOutcome {
  if (id === 'legacy-current-authorized' || id === 'complete-roster-current-authorized') {
    return { status: 'not_executed', reason: 'not_started', retryable: true };
  }
  if (id === 'complete-roster-current-success' || id === 'complete-roster-compacted-success') {
    return { status: 'executed', reason: 'effect_committed', retryable: false };
  }
  if (id === 'post-cas-roster-split') return { status: 'blocked', reason: 'journal_inconsistent', retryable: false };
  if (id === 'roster-truth-unavailable' || id === 'roster-truth-absent') {
    return { status: 'indeterminate', reason: 'journal_unavailable', retryable: false };
  }
  return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
}

function authorities(authorityIds: string[], revision: number, historyDigest: string): AuthorityCheckpoint[] {
  return authorityIds.map((authorityId) => ({ authorityId, operationId, revision, verified: true, historyDigest }));
}

function visibleSet(requiredAuthorityIds: string[], minimumRequiredAuthorities: number): WitnessSet {
  return { operationId, requiredAuthorityIds, minimumRequiredAuthorities, verified: true };
}

function currentRoster(): WitnessRoster {
  return {
    operationId,
    requiredAuthorityIds: ['witness-a', 'witness-b', 'witness-c'],
    minimumRequiredAuthorities: 3,
    rosterEpoch: 2,
    rosterDigest: currentRosterDigest,
    verified: true,
  };
}

function currentReceipt(permit: Permit): Receipt {
  return { permitId: permit.id, approvalId: permit.approvalId, operationId, receiptDigest: terminalDigest, verified: true };
}

function currentProof(permit: Permit): Proof {
  return {
    operationId,
    permitId: permit.id,
    approvalId: permit.approvalId,
    outcome: 'committed',
    receiptDigest: terminalDigest,
    revision: 3,
    verified: true,
  };
}

function configure(store: Store, permit: Permit, id: ScenarioId) {
  const base = store.effects.get(operationId)!;
  store.highWater = 1;
  store.proof = undefined;
  store.checkpoint = { operationId, revision: 1, verified: true };
  store.authorityCheckpoints = authorities(['witness-a', 'witness-b', 'witness-c'], 1, currentRosterDigest);
  store.witnessSet = visibleSet(['witness-a', 'witness-b', 'witness-c'], 3);
  store.witnessRoster = currentRoster();
  store.witnessRosterUnavailable = false;
  store.revisionUnavailable = false;
  store.postCasRosterSplit = false;
  store.effects.set(operationId, { ...base, state: 'authorized', claimed: true, revision: 1 });

  if (id === 'legacy-current-authorized') {
    store.checkpoint = undefined;
    store.authorityCheckpoints = undefined;
    store.witnessSet = undefined;
    store.witnessRoster = undefined;
  } else if (id === 'complete-roster-current-success') {
    store.effects.set(operationId, { ...base, state: 'committed', claimed: true, revision: 3, successReceipt: currentReceipt(permit) });
    store.highWater = 3;
    store.checkpoint = { operationId, revision: 3, verified: true };
    store.authorityCheckpoints = authorities(['witness-a', 'witness-b', 'witness-c'], 3, currentRosterDigest);
  } else if (id === 'complete-roster-compacted-success') {
    store.effects.delete(operationId);
    store.highWater = 3;
    store.proof = currentProof(permit);
    store.checkpoint = { operationId, revision: 3, verified: true };
    store.authorityCheckpoints = authorities(['witness-a', 'witness-b', 'witness-c'], 3, currentRosterDigest);
  } else if (splitScenarios.has(id)) {
    store.authorityCheckpoints = authorities(['witness-a', 'witness-b'], 1, oldRosterDigest);
    store.witnessSet = visibleSet(['witness-a', 'witness-b'], 2);
    if (id === 'old-roster-started') store.effects.set(operationId, { ...base, state: 'started', claimed: true, revision: 1 });
    if (id === 'old-roster-terminal') {
      store.effects.set(operationId, { ...base, state: 'committed', claimed: true, revision: 1, successReceipt: currentReceipt(permit) });
    }
    if (id === 'current-roster-hidden-rollback') {
      store.highWater = 2;
      store.checkpoint = { operationId, revision: 2, verified: true };
      store.authorityCheckpoints = authorities(['witness-a', 'witness-b'], 2, oldRosterDigest);
    }
    if (id === 'roster-digest-mismatch') store.witnessRoster = { ...currentRoster(), rosterDigest: oldRosterDigest };
    if (id === 'roster-epoch-rollback') store.witnessRoster = { ...currentRoster(), rosterEpoch: 1 };
    if (id === 'post-cas-roster-split') {
      store.postCasRosterSplit = true;
      store.authorityCheckpoints = authorities(['witness-a', 'witness-b', 'witness-c'], 1, currentRosterDigest);
      store.witnessSet = visibleSet(['witness-a', 'witness-b', 'witness-c'], 3);
    }
  } else if (id === 'roster-truth-unavailable') store.witnessRosterUnavailable = true;
  else if (id === 'roster-truth-absent') store.witnessRoster = undefined;
  else if (id === 'roster-truth-unverified') store.witnessRoster = { ...currentRoster(), verified: false };
  else if (id === 'roster-truth-duplicate-id') {
    store.witnessRoster = { ...currentRoster(), requiredAuthorityIds: ['witness-a', 'witness-a', 'witness-c'] };
  } else if (id === 'roster-truth-missing-minimum') {
    store.witnessRoster = { ...currentRoster(), minimumRequiredAuthorities: 4 };
  }
}

function classify(effect: Effect | undefined, proof: Proof | undefined): ApiResult {
  if (effect?.state === 'committed') return { status: 'executed', reason: 'effect_committed', retryable: false };
  if (effect?.state === 'started') return { status: 'indeterminate', reason: 'effect_started', retryable: false };
  if (effect?.state === 'authorized') return { status: 'not_executed', reason: 'not_started', retryable: true };
  if (proof?.verified && proof.outcome === 'committed') return { status: 'executed', reason: 'effect_committed', retryable: false };
  return { status: 'indeterminate', reason: 'journal_stale', retryable: false };
}

function validDigest(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function validAuthorityId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{3,80}$/.test(value);
}

async function visibleAuthorityIntegrity(store: Store): Promise<'current' | 'inconsistent' | 'unavailable'> {
  let records: unknown;
  try {
    records = await store.readEffectRevisionCheckpoints();
  } catch {
    return 'unavailable';
  }
  if (records === undefined) return 'unavailable';
  if (!Array.isArray(records) || records.length === 0) return 'inconsistent';
  const seen = new Set<string>();
  const digestByRevision = new Map<number, string>();
  for (const record of records) {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) return 'inconsistent';
    const candidate = record as Partial<AuthorityCheckpoint>;
    const allowedKeys = new Set(['authorityId', 'operationId', 'revision', 'verified', 'historyDigest']);
    if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) return 'inconsistent';
    if (
      !validAuthorityId(candidate.authorityId) ||
      candidate.operationId !== operationId ||
      candidate.verified !== true ||
      !Number.isSafeInteger(candidate.revision) ||
      candidate.revision! <= 0 ||
      !validDigest(candidate.historyDigest)
    ) return 'inconsistent';
    if (seen.has(candidate.authorityId)) return 'inconsistent';
    seen.add(candidate.authorityId);
    const existing = digestByRevision.get(candidate.revision!);
    if (existing !== undefined && existing !== candidate.historyDigest) return 'inconsistent';
    digestByRevision.set(candidate.revision!, candidate.historyDigest);
  }
  return 'current';
}

async function rosterIntegrity(store: Store): Promise<'current' | 'inconsistent' | 'unavailable'> {
  const visibleIntegrity = await visibleAuthorityIntegrity(store);
  if (visibleIntegrity !== 'current') return visibleIntegrity;
  const visible = await store.readEffectRevisionWitnessSet();

  let roster: unknown;
  try {
    roster = await store.readEffectRevisionWitnessRoster();
  } catch {
    return 'unavailable';
  }
  if (roster === undefined) return 'unavailable';
  if (roster === null || typeof roster !== 'object' || Array.isArray(roster)) return 'inconsistent';
  const candidate = roster as Partial<WitnessRoster>;
  const allowedKeys = new Set([
    'operationId',
    'requiredAuthorityIds',
    'minimumRequiredAuthorities',
    'rosterEpoch',
    'rosterDigest',
    'verified',
  ]);
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) return 'inconsistent';
  if (
    candidate.operationId !== operationId ||
    candidate.verified !== true ||
    !Array.isArray(candidate.requiredAuthorityIds) ||
    candidate.requiredAuthorityIds.length === 0 ||
    !Number.isSafeInteger(candidate.minimumRequiredAuthorities) ||
    candidate.minimumRequiredAuthorities! <= 0 ||
    candidate.minimumRequiredAuthorities! > candidate.requiredAuthorityIds.length ||
    !Number.isSafeInteger(candidate.rosterEpoch) ||
    candidate.rosterEpoch !== 2 ||
    candidate.rosterDigest !== currentRosterDigest
  ) return 'inconsistent';

  const required = new Set<string>();
  for (const authorityId of candidate.requiredAuthorityIds) {
    if (!validAuthorityId(authorityId) || required.has(authorityId)) return 'inconsistent';
    required.add(authorityId);
  }
  const visibleAuthorityIds = new Set((store.authorityCheckpoints ?? []).map((record) => record.authorityId));
  if (visibleAuthorityIds.size < candidate.minimumRequiredAuthorities!) return 'inconsistent';
  for (const authorityId of required) {
    if (!visibleAuthorityIds.has(authorityId)) return 'inconsistent';
  }

  if (visible === undefined || visible === null || typeof visible !== 'object' || Array.isArray(visible)) {
    return 'inconsistent';
  }
  const visibleWitnessSet = visible as Partial<WitnessSet>;
  if (
    visibleWitnessSet.operationId !== operationId ||
    visibleWitnessSet.verified !== true ||
    !Array.isArray(visibleWitnessSet.requiredAuthorityIds) ||
    visibleWitnessSet.minimumRequiredAuthorities !== candidate.minimumRequiredAuthorities
  ) return 'inconsistent';
  const visibleRequired = new Set(visibleWitnessSet.requiredAuthorityIds);
  if (visibleRequired.size !== required.size) return 'inconsistent';
  for (const authorityId of required) {
    if (!visibleRequired.has(authorityId)) return 'inconsistent';
  }
  return 'current';
}

async function fixture(store: Store, postCas: boolean): Promise<ApiResult> {
  if (store.witnessSet === undefined && store.authorityCheckpoints === undefined && store.witnessRoster === undefined) {
    return classify(await store.readEffect(operationId), store.proof);
  }
  const integrity = await rosterIntegrity(store);
  if (integrity === 'unavailable') return { status: postCas ? 'blocked' : 'indeterminate', reason: 'journal_unavailable', retryable: false };
  if (integrity === 'inconsistent') return { status: postCas ? 'blocked' : 'indeterminate', reason: 'journal_inconsistent', retryable: false };
  if (postCas) {
    await store.beginEffect(operationId);
    const after = await rosterIntegrity(store);
    if (after === 'unavailable') return { status: 'blocked', reason: 'journal_unavailable', retryable: false };
    if (after === 'inconsistent') return { status: 'blocked', reason: 'journal_inconsistent', retryable: false };
    return { status: 'execute', retryable: false };
  }
  return classify(await store.readEffect(operationId), store.proof);
}

async function control(store: Store, postCas: boolean): Promise<ApiResult> {
  if (postCas) {
    await store.beginEffect(operationId);
    return { status: 'execute', retryable: false };
  }
  return classify(await store.readEffect(operationId), store.proof);
}

function viewForAegis(store: Store, id: ScenarioId) {
  return new Proxy(store, {
    get(target, property) {
      if (property === 'readEffectRevisionCheckpoint' && id === 'legacy-current-authorized') return undefined;
      if (property === 'readEffectRevisionCheckpoints' && id === 'legacy-current-authorized') return undefined;
      if (property === 'readEffectRevisionWitnessSet' && id === 'legacy-current-authorized') return undefined;
      if (property === 'readEffectRevisionWitnessRoster' && id === 'legacy-current-authorized') return undefined;
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function runScenario(arm: Arm, id: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-exp44-'));
  const store = new Store();
  try {
    const { permit, current, ask, consume } = await setup(runtime, dir, store);
    configure(store, permit, id);
    const postCas = id === 'post-cas-roster-split';
    let result: ApiResult;
    let apiAvailable = true;
    if (arm === 'host-old-roster-control') result = await control(store, postCas);
    else if (arm === 'strict-roster-epoch-fixture') result = await fixture(store, postCas);
    else {
      const view = viewForAegis(store, id);
      apiAvailable = id === 'legacy-current-authorized' || typeof runtime.resolveWitnessRosterAnchoredExecutionEffect === 'function';
      result = postCas
        ? await runtime.beginExecutionEffect(permit, current, operationId, view)
        : await (
            runtime.resolveWitnessRosterAnchoredExecutionEffect ??
            runtime.resolveWitnessSetAnchoredExecutionEffect ??
            runtime.resolveMultiAuthorityAnchoredExecutionEffect ??
            runtime.resolveAnchoredExecutionEffect ??
            runtime.resolveExecutionEffect
          )(permit, current, operationId, view);
    }
    const want = expected(id);
    const actual = { status: result.status, reason: result.reason ?? '', retryable: result.retryable ?? false };
    const correct = actual.status === want.status && actual.reason === want.reason && actual.retryable === want.retryable;
    return {
      scenarioId: id,
      ...actual,
      expectedStatus: want.status,
      expectedReason: want.reason,
      expectedRetryable: want.retryable,
      correct,
      rosterSplitDetected: splitScenarios.has(id) && correct,
      rosterSplitRetryAuthority: splitScenarios.has(id) && (actual.retryable || actual.status === 'execute' || actual.status === 'executed'),
      apiAvailable,
      askCovered: ask,
      consumeCovered: consume,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const runtime = await loadRuntime();
const runId = `wre-${Date.now().toString(36)}`;
const runDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runDir, { recursive: true });
const tracePath = join(runDir, `${runId}.jsonl`);
const trace = new TraceWriter(tracePath, { runId, experiment: '44-checkpoint-witness-roster-epoch' });
const bus = new MessageBus({ trace });
const stub = new StubRuntime();
const results = new Map<Arm, ScenarioResult[]>();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    evidenceVersion: 1,
    experiment: '44-checkpoint-witness-roster-epoch',
    spec: '50-checkpoint-witness-roster-epoch',
    runId,
    timestamp: new Date().toISOString(),
    seed: SEED,
    scenarios,
    arms,
    aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'built-artifact+real-hook-public-api' },
  },
});

for (const arm of arms) {
  const agent = await spawnAgent({ id: `wre:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace });
  const rows: ScenarioResult[] = [];
  for (const id of scenarios) {
    const row = await runScenario(arm, id, runtime);
    rows.push(row);
    bus.publish({ from: agent.id, to: 'moderator', topic: 'scenario', body: { arm, ...row } });
  }
  results.set(arm, rows);
  await agent.kill();
  bus.removeAgent(agent.id);
}

const row = (rows: ScenarioResult[], id: ScenarioId) => rows.find((value) => value.scenarioId === id)!;
const metrics = (arm: Arm) => {
  const rows = results.get(arm)!;
  const splitRows = rows.filter((result) => splitScenarios.has(result.scenarioId));
  const ids = (...idsToCheck: ScenarioId[]) => idsToCheck.every((id) => row(rows, id).correct) ? 1 : 0;
  return {
    rosterSplitDetectionRate: splitRows.filter((result) => result.rosterSplitDetected).length / splitRows.length,
    rosterSplitRetryAuthorityRate: splitRows.filter((result) => result.rosterSplitRetryAuthority).length / splitRows.length,
    resolutionAccuracy: rows.filter((result) => result.correct).length / rows.length,
    witnessRosterApiAvailability: rows.every((result) => result.apiAvailable) ? 1 : 0,
    legacyPreservation: ids('legacy-current-authorized'),
    completeCurrentPreservation: ids('complete-roster-current-authorized'),
    terminalPreservation: ids('complete-roster-current-success'),
    compactedTerminalPreservation: ids('complete-roster-compacted-success'),
    unavailableRosterSafety: ids('roster-truth-unavailable'),
    absentRosterSafety: ids('roster-truth-absent'),
    invalidRosterSafety: ids('roster-truth-unverified', 'roster-truth-duplicate-id', 'roster-truth-missing-minimum'),
    postCasRosterSplitSafety: ids('post-cas-roster-split'),
    askCoverage: rows.every((result) => result.askCovered) ? 1 : 0,
    consumeCoverage: rows.every((result) => result.consumeCovered) ? 1 : 0,
  };
};

for (const arm of arms) {
  const values = metrics(arm);
  trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(values).map(([key, value]) => [arm.replaceAll('-', '_') + '_' + key, value])) });
  console.log(arm, values);
}

const green = (metricValues: ReturnType<typeof metrics>) =>
  metricValues.rosterSplitDetectionRate === 1 &&
  metricValues.rosterSplitRetryAuthorityRate === 0 &&
  Object.entries(metricValues).filter(([key]) => key !== 'rosterSplitRetryAuthorityRate').every(([, value]) => value === 1);

const scorer: Scorer = {
  score() {
    const fixtureValues = metrics('strict-roster-epoch-fixture');
    const aegisValues = metrics('aegis-wrapped');
    return {
      fixtureGreen: green(fixtureValues) ? 1 : 0,
      baselineAegisRed: green(aegisValues) ? 0 : 1,
      ...Object.fromEntries(Object.entries(aegisValues).map(([key, value]) => [`aegisWrapped${key[0]!.toUpperCase()}${key.slice(1)}`, value])),
    };
  },
};
const summary = runScorer(scorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

const written = trace.toRunRecord();
const replayed = await readRunRecord(tracePath);
const count = (events: readonly TraceEvent[], type: TraceEvent['t']) => events.filter((event) => event.t === type).length;
for (const type of ['spawn', 'message', 'score', 'kill'] as const) {
  if (count(written.events, type) !== count(replayed.events, type)) throw new Error(`replay mismatch ${type}`);
}
console.log(`replay verified: ${replayed.events.length} events`);
console.log(`trace: ${tracePath}`);
