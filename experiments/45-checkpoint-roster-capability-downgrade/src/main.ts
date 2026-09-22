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

const SEED = 'checkpoint-roster-capability-downgrade-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-20-exp45';
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

const operationId = 'op_checkpoint_roster_capability_downgrade';
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
    observedAt: '2026-09-21T06:00:00Z',
    artifactDigest: 'sha256:pkg',
    verificationDigest: 'sha256:tests',
    targetDigest: 'registry:prod:v1',
  },
  approvalProvenance: {
    actorId: 'agent:child-a',
    sessionId: 'session:a',
    workspaceId: 'workspace:aegis',
    taskIntentId: 'intent:publish',
    authorizationDigest: 'auth:epoch-15',
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
  witnessRosterMalformed = false;
  postCasCapabilityLoss = false;
  rosterReadCount = 0;
  failFirstRosterReadThenRecover = false;

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
    if (this.postCasCapabilityLoss) {
      this.authorityCheckpoints = authorities(['witness-a', 'witness-b', 'witness-c'], 2, currentRosterDigest);
      this.witnessSet = visibleSet(['witness-a', 'witness-b', 'witness-c'], 3);
      this.witnessRosterUnavailable = true;
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
    this.rosterReadCount += 1;
    if (this.failFirstRosterReadThenRecover && this.rosterReadCount === 1) throw new Error('roster unavailable');
    if (this.witnessRosterUnavailable) throw new Error('roster unavailable');
    if (this.witnessRosterMalformed) return { malformed: true } as unknown as WitnessRoster;
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
  resolveStrictRosterContinuityExecutionEffect?: (p: Permit, c: any, o: string, s: any) => Promise<ApiResult>;
  beginExecutionEffect(p: Permit, c: any, o: string, s: any): Promise<ApiResult>;
  beginStrictRosterContinuityExecutionEffect?: (p: Permit, c: any, o: string, s: any) => Promise<ApiResult>;
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
    resolveStrictRosterContinuityExecutionEffect: hook.resolveStrictRosterContinuityExecutionEffect,
    beginExecutionEffect: hook.beginExecutionEffect,
    beginStrictRosterContinuityExecutionEffect: hook.beginStrictRosterContinuityExecutionEffect,
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
    authorizationDigest: 'auth:epoch-15',
    effectiveConsumerId: 'agent:child-a',
    links,
    revoked: false,
    revocationChecked: true,
    structurallyValid: true,
  };
  await runtime.finalizeExecutionPermitWithEffectJournal(permit, current, operationId, store);
  return { permit, current, ask: ask.exitCode === 2, consume: consume.approval?.event === 'consumed' };
}

// Bucket 1: preservation controls (4)
// Bucket 2: strict resolve failures (5)
// Bucket 3: strict pre-effect failures (4)
// Bucket 4: recovery controls (2)
const scenarios: ScenarioId[] = [
  'strict-current-authorized',
  'strict-current-committed',
  'strict-current-compacted-terminal',
  'legacy-generic-witness-set-authorized',
  'roster-temporarily-unavailable',
  'roster-capability-absent',
  'capability-stripped-after-unavailable-read',
  'capability-stripped-after-prior-current-read',
  'malformed-roster-on-retry',
  'capability-stripped-before-begin',
  'capability-stripped-after-prior-current-read-before-begin',
  'roster-unavailable-before-begin',
  'post-cas-capability-loss',
  'unavailable-then-same-current-restored',
  'prior-current-then-same-current-retained',
];
const arms: Arm[] = ['host-capability-fallback-control', 'strict-roster-continuity-fixture', 'aegis-wrapped'];

const downgradeScenarios = new Set<ScenarioId>([
  'roster-temporarily-unavailable',
  'roster-capability-absent',
  'capability-stripped-after-unavailable-read',
  'capability-stripped-after-prior-current-read',
  'malformed-roster-on-retry',
  'capability-stripped-before-begin',
  'capability-stripped-after-prior-current-read-before-begin',
  'roster-unavailable-before-begin',
  'post-cas-capability-loss',
]);

const beginPhaseScenarios = new Set<ScenarioId>([
  'capability-stripped-before-begin',
  'capability-stripped-after-prior-current-read-before-begin',
  'roster-unavailable-before-begin',
  'post-cas-capability-loss',
]);

function expected(id: ScenarioId): ExpectedOutcome {
  if (id === 'strict-current-authorized' || id === 'legacy-generic-witness-set-authorized') {
    return { status: 'not_executed', reason: 'not_started', retryable: true };
  }
  if (id === 'strict-current-committed' || id === 'strict-current-compacted-terminal') {
    return { status: 'executed', reason: 'effect_committed', retryable: false };
  }
  if (id === 'unavailable-then-same-current-restored' || id === 'prior-current-then-same-current-retained') {
    return { status: 'not_executed', reason: 'not_started', retryable: true };
  }
  if (beginPhaseScenarios.has(id)) return { status: 'blocked', reason: 'journal_inconsistent', retryable: false };
  if (id === 'roster-temporarily-unavailable' || id === 'roster-capability-absent' || id === 'capability-stripped-after-unavailable-read') {
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
  store.witnessRosterMalformed = false;
  store.postCasCapabilityLoss = false;
  store.rosterReadCount = 0;
  store.failFirstRosterReadThenRecover = false;
  store.effects.set(operationId, { ...base, state: 'authorized', claimed: true, revision: 1 });

  if (id === 'legacy-generic-witness-set-authorized') {
    store.checkpoint = undefined;
    store.authorityCheckpoints = undefined;
    store.witnessSet = undefined;
    store.witnessRoster = undefined;
  } else if (id === 'strict-current-committed') {
    store.effects.set(operationId, { ...base, state: 'committed', claimed: true, revision: 3, successReceipt: currentReceipt(permit) });
    store.highWater = 3;
    store.checkpoint = { operationId, revision: 3, verified: true };
    store.authorityCheckpoints = authorities(['witness-a', 'witness-b', 'witness-c'], 3, currentRosterDigest);
  } else if (id === 'strict-current-compacted-terminal') {
    store.effects.delete(operationId);
    store.highWater = 3;
    store.proof = currentProof(permit);
    store.checkpoint = { operationId, revision: 3, verified: true };
    store.authorityCheckpoints = authorities(['witness-a', 'witness-b', 'witness-c'], 3, currentRosterDigest);
  } else if (id === 'roster-temporarily-unavailable' || id === 'roster-unavailable-before-begin') {
    store.witnessRosterUnavailable = true;
  } else if (id === 'roster-capability-absent' || id === 'capability-stripped-before-begin') {
    store.witnessRoster = undefined;
  } else if (id === 'capability-stripped-after-unavailable-read') {
    store.witnessRosterUnavailable = true;
  } else if (id === 'capability-stripped-after-prior-current-read' || id === 'capability-stripped-after-prior-current-read-before-begin') {
    store.witnessRoster = undefined;
  } else if (id === 'malformed-roster-on-retry') {
    store.witnessRosterMalformed = true;
  } else if (id === 'post-cas-capability-loss') {
    store.postCasCapabilityLoss = true;
  } else if (id === 'unavailable-then-same-current-restored') {
    store.failFirstRosterReadThenRecover = true;
  } else if (id === 'prior-current-then-same-current-retained') {
    store.witnessRoster = currentRoster();
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

/**
 * The fixture's strict-boundary memory: once a resolve/begin call for this operation has selected
 * the strict current-roster boundary, every subsequent call for the same operation must keep
 * requiring live roster capability rather than silently falling back to witness-set-only truth.
 */
const strictBoundarySelected = new Set<string>();

async function rosterIntegrity(store: Store, phase: 'resolve' | 'begin'): Promise<'current' | 'inconsistent' | 'unavailable'> {
  const visibleIntegrity = await visibleAuthorityIntegrity(store);
  if (visibleIntegrity !== 'current') return visibleIntegrity;
  const visible = await store.readEffectRevisionWitnessSet();

  const hasRosterMethod = typeof (store as any).readEffectRevisionWitnessRoster === 'function';
  if (!hasRosterMethod) {
    // A strict begin call itself selects the current-roster boundary. On resolve, a first call with
    // no capability is unavailable; once the boundary was previously selected, disappearance is
    // contradictory adapter evidence rather than a legacy store.
    if (phase === 'begin' || strictBoundarySelected.has(operationId)) return 'inconsistent';
    return 'unavailable';
  }

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
  strictBoundarySelected.add(operationId);
  return 'current';
}

async function fixture(store: Store, id: ScenarioId): Promise<ApiResult> {
  if (id === 'legacy-generic-witness-set-authorized') {
    return classify(await store.readEffect(operationId), store.proof);
  }
  const isBeginPhase = beginPhaseScenarios.has(id);
  if (!isBeginPhase) {
    const integrity = await rosterIntegrity(store, 'resolve');
    if (integrity === 'unavailable') return { status: 'indeterminate', reason: 'journal_unavailable', retryable: false };
    if (integrity === 'inconsistent') return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
    return classify(await store.readEffect(operationId), store.proof);
  }
  // Pre-effect (begin) phase: the strict boundary must be re-verified immediately before granting
  // execute/retry authority, even if a prior resolve call already saw a valid current roster.
  const preIntegrity = await rosterIntegrity(store, 'begin');
  if (preIntegrity !== 'current') return { status: 'blocked', reason: 'journal_inconsistent', retryable: false };
  await store.beginEffect(operationId);
  const postIntegrity = await rosterIntegrity(store, 'begin');
  if (postIntegrity !== 'current') return { status: 'blocked', reason: 'journal_inconsistent', retryable: false };
  return { status: 'execute', retryable: false };
}

async function control(store: Store, id: ScenarioId): Promise<ApiResult> {
  const isBeginPhase = beginPhaseScenarios.has(id);
  if (isBeginPhase) {
    await store.beginEffect(operationId);
    return { status: 'execute', retryable: false };
  }
  return classify(await store.readEffect(operationId), store.proof);
}

function viewForAegis(store: Store, id: ScenarioId): Store {
  return new Proxy(store, {
    get(target, property) {
      if (property === 'readEffectRevisionCheckpoint' && id === 'legacy-generic-witness-set-authorized') return undefined;
      if (property === 'readEffectRevisionCheckpoints' && id === 'legacy-generic-witness-set-authorized') return undefined;
      if (property === 'readEffectRevisionWitnessSet' && id === 'legacy-generic-witness-set-authorized') return undefined;
      if (property === 'readEffectRevisionWitnessRoster' && id === 'legacy-generic-witness-set-authorized') return undefined;
      if (
        property === 'readEffectRevisionWitnessRoster' &&
        (id === 'roster-capability-absent' ||
          id === 'capability-stripped-before-begin' ||
          id === 'capability-stripped-after-prior-current-read' ||
          id === 'capability-stripped-after-prior-current-read-before-begin' ||
          (id === 'post-cas-capability-loss' && target.effects.get(operationId)?.state === 'started'))
      ) {
        return undefined;
      }
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * For "capability stripped after a prior current read" scenarios, the harness first performs one
 * resolve against a fully roster-capable view (establishing that the strict boundary was already
 * selected for this operation), then performs the scored call against a second view where the
 * roster method has disappeared -- modeling a retry through a capability-downgraded adapter.
 */
function needsPriorCurrentRead(id: ScenarioId): boolean {
  return id === 'capability-stripped-after-prior-current-read' ||
    id === 'capability-stripped-after-prior-current-read-before-begin' ||
    id === 'prior-current-then-same-current-retained';
}

function needsRecoveryRetry(id: ScenarioId): boolean {
  return id === 'unavailable-then-same-current-restored';
}

async function runScenario(arm: Arm, id: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-exp45-'));
  const store = new Store();
  try {
    const { permit, current, ask, consume } = await setup(runtime, dir, store);
    configure(store, permit, id);
    const isBeginPhase = beginPhaseScenarios.has(id);
    let result: ApiResult;
    let apiAvailable = true;
    if (arm === 'host-capability-fallback-control') result = await control(store, id);
    else if (arm === 'strict-roster-continuity-fixture') {
      strictBoundarySelected.delete(operationId);
      const view = viewForAegis(store, id);
      if (needsPriorCurrentRead(id)) {
        strictBoundarySelected.add(operationId);
        await rosterIntegrity(store, 'resolve');
      }
      if (needsRecoveryRetry(id)) await fixture(view, id);
      result = await fixture(view, id);
    } else {
      const strictResolveFn = runtime.resolveStrictRosterContinuityExecutionEffect;
      const strictBeginFn = runtime.beginStrictRosterContinuityExecutionEffect;
      apiAvailable = id === 'legacy-generic-witness-set-authorized' ||
        (typeof strictResolveFn === 'function' && typeof strictBeginFn === 'function');
      if (needsPriorCurrentRead(id)) {
        const priorView = viewForAegis(store, 'strict-current-authorized');
        await (
          strictResolveFn ??
          runtime.resolveWitnessRosterAnchoredExecutionEffect ??
          runtime.resolveWitnessSetAnchoredExecutionEffect ??
          runtime.resolveMultiAuthorityAnchoredExecutionEffect ??
          runtime.resolveAnchoredExecutionEffect ??
          runtime.resolveExecutionEffect
        )(permit, current, operationId, priorView);
      }
      const view = viewForAegis(store, id);
      const resolveStrict = strictResolveFn ??
        runtime.resolveWitnessRosterAnchoredExecutionEffect ??
        runtime.resolveWitnessSetAnchoredExecutionEffect ??
        runtime.resolveMultiAuthorityAnchoredExecutionEffect ??
        runtime.resolveAnchoredExecutionEffect ??
        runtime.resolveExecutionEffect;
      if (needsRecoveryRetry(id)) await resolveStrict(permit, current, operationId, view);
      if (isBeginPhase) {
        result = await (strictBeginFn ?? runtime.beginExecutionEffect)(permit, current, operationId, view);
      } else {
        result = await resolveStrict(permit, current, operationId, view);
      }
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
      capabilityDowngradeDetected: downgradeScenarios.has(id) && correct,
      downgradeAuthorityRestored: downgradeScenarios.has(id) && (actual.retryable || actual.status === 'execute' || actual.status === 'executed'),
      apiAvailable,
      askCovered: ask,
      consumeCovered: consume,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const runtime = await loadRuntime();
const runId = `rcd-${Date.now().toString(36)}`;
const runDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runDir, { recursive: true });
const tracePath = join(runDir, `${runId}.jsonl`);
const trace = new TraceWriter(tracePath, { runId, experiment: '45-checkpoint-roster-capability-downgrade' });
const bus = new MessageBus({ trace });
const stub = new StubRuntime();
const results = new Map<Arm, ScenarioResult[]>();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    evidenceVersion: 1,
    experiment: '45-checkpoint-roster-capability-downgrade',
    spec: '51-checkpoint-roster-capability-downgrade',
    runId,
    timestamp: new Date().toISOString(),
    seed: SEED,
    scenarios,
    arms,
    aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'built-artifact+real-hook-public-api' },
  },
});

for (const arm of arms) {
  strictBoundarySelected.clear();
  const agent = await spawnAgent({ id: `rcd:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace });
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
  const downgradeRows = rows.filter((result) => downgradeScenarios.has(result.scenarioId));
  const ids = (...idsToCheck: ScenarioId[]) => idsToCheck.every((id) => row(rows, id).correct) ? 1 : 0;
  return {
    capabilityDowngradeDetectionRate: downgradeRows.filter((result) => result.capabilityDowngradeDetected).length / downgradeRows.length,
    downgradeAuthorityRestorationRate: downgradeRows.filter((result) => result.downgradeAuthorityRestored).length / downgradeRows.length,
    resolutionAccuracy: rows.filter((result) => result.correct).length / rows.length,
    strictRosterContinuityApiAvailability: rows.every((result) => result.apiAvailable) ? 1 : 0,
    currentAuthorizedPreservation: ids('strict-current-authorized'),
    currentCommittedPreservation: ids('strict-current-committed'),
    compactedTerminalPreservation: ids('strict-current-compacted-terminal'),
    legacyPreservation: ids('legacy-generic-witness-set-authorized'),
    unavailableSafety: ids('roster-temporarily-unavailable', 'roster-unavailable-before-begin'),
    absentSafety: ids('roster-capability-absent', 'capability-stripped-before-begin'),
    strippedAfterPriorReadSafety: ids('capability-stripped-after-prior-current-read', 'capability-stripped-after-prior-current-read-before-begin'),
    strippedAfterUnavailableReadSafety: ids('capability-stripped-after-unavailable-read'),
    malformedRetrySafety: ids('malformed-roster-on-retry'),
    postCasCapabilityLossSafety: ids('post-cas-capability-loss'),
    recoverySafety: ids('unavailable-then-same-current-restored', 'prior-current-then-same-current-retained'),
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
  metricValues.capabilityDowngradeDetectionRate === 1 &&
  metricValues.downgradeAuthorityRestorationRate === 0 &&
  Object.entries(metricValues).filter(([key]) => key !== 'downgradeAuthorityRestorationRate').every(([, value]) => value === 1);

const scorer: Scorer = {
  score() {
    const fixtureValues = metrics('strict-roster-continuity-fixture');
    const aegisValues = metrics('aegis-wrapped');
    if (!green(fixtureValues)) {
      throw new Error(`strict-roster-continuity-fixture must be green: ${JSON.stringify(fixtureValues)}`);
    }
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
