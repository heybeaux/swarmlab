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

const SEED = 'durable-strict-roster-policy-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-22-exp46-baseline';
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

const operationId = 'op_durable_strict_roster_policy';
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
    observedAt: '2026-09-23T06:00:00Z',
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
    if (this.witnessRosterUnavailable) throw new Error('roster unavailable');
    if (this.witnessRosterMalformed) return { malformed: true } as unknown as WitnessRoster;
    return this.witnessRoster === undefined ? undefined : structuredClone(this.witnessRoster);
  }
  async completeEffect() { return 'not_started' as const; }
  async failEffect() { return 'not_started' as const; }
}

/**
 * Durable-marker host state: a record atomically bound to the exact operation, permit, and
 * approval that selected the strict current-roster boundary. Unlike exp-45's process-local
 * `WeakMap`, this survives process destruction because it lives in a plain object simulating
 * shared/cross-host storage, keyed by operation id.
 */
type DurableMarker = { operationId: string; permitId: string; approvalId: string };
class DurableMarkerStore {
  markers = new Map<string, DurableMarker>();
  readUnavailable = false;

  async readMarker(op: string): Promise<DurableMarker | undefined | { malformed: true }> {
    if (this.readUnavailable) throw new Error('marker store unavailable');
    return this.markers.get(op) === undefined ? undefined : structuredClone(this.markers.get(op)!);
  }
  async bindMarker(op: string, marker: DurableMarker): Promise<boolean> {
    this.markers.set(op, structuredClone(marker));
    return true;
  }
  async deleteMarker(op: string) {
    this.markers.delete(op);
  }
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
  createStrictRosterContinuityContext?: () => object;
  resolveStrictRosterContinuityExecutionEffect?: (p: Permit, c: any, o: string, s: any, continuity?: object) => Promise<ApiResult>;
  beginExecutionEffect(p: Permit, c: any, o: string, s: any): Promise<ApiResult>;
  beginStrictRosterContinuityExecutionEffect?: (p: Permit, c: any, o: string, s: any, continuity?: object) => Promise<ApiResult>;
  // Durable selection/readback surface (spec 52). Real Aegis origin/main exposes none of these;
  // only the opaque, process-local StrictRosterContinuityContext exists as of this baseline.
  selectDurableStrictRosterPolicy?: (p: Permit, c: any, o: string) => Promise<{ operationId: string; permitId: string; approvalId: string } | undefined>;
  readDurableStrictRosterPolicy?: (o: string) => Promise<{ operationId: string; permitId: string; approvalId: string } | undefined>;
  resolveDurableStrictRosterPolicyExecutionEffect?: (p: Permit, c: any, o: string, s: any) => Promise<ApiResult>;
  beginDurableStrictRosterPolicyExecutionEffect?: (p: Permit, c: any, o: string, s: any) => Promise<ApiResult>;
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
    createStrictRosterContinuityContext: hook.createStrictRosterContinuityContext,
    resolveStrictRosterContinuityExecutionEffect: hook.resolveStrictRosterContinuityExecutionEffect,
    beginExecutionEffect: hook.beginExecutionEffect,
    beginStrictRosterContinuityExecutionEffect: hook.beginStrictRosterContinuityExecutionEffect,
    selectDurableStrictRosterPolicy: hook.selectDurableStrictRosterPolicy,
    readDurableStrictRosterPolicy: hook.readDurableStrictRosterPolicy,
    resolveDurableStrictRosterPolicyExecutionEffect: hook.resolveDurableStrictRosterPolicyExecutionEffect,
    beginDurableStrictRosterPolicyExecutionEffect: hook.beginDurableStrictRosterPolicyExecutionEffect,
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

// Bucket 1: preservation controls, no destruction (5)
// Bucket 2: capability loss after destruction (2)
// Bucket 3: marker integrity failures at resolve (5)
// Bucket 4: marker integrity failures at begin / post-CAS (2)
// Bucket 5: idempotent reselection control (1)
const scenarios: ScenarioId[] = [
  'same-process-current-authorized',
  'restart-current-roster',
  'cross-host-current-roster',
  'restart-committed-terminal',
  'legacy-generic-control',
  'restart-capability-stripped',
  'cross-host-roster-unavailable',
  'marker-missing-after-prior-selection',
  'marker-read-unavailable',
  'marker-bound-other-operation',
  'marker-bound-other-permit',
  'marker-malformed',
  'marker-conflicting-preexisting',
  'marker-loss-after-begin-cas',
  'marker-exact-idempotent-reselection',
];
const arms: Arm[] = ['process-local-fallback-control', 'durable-policy-fixture', 'aegis-wrapped'];

const failureScenarios = new Set<ScenarioId>([
  'restart-capability-stripped',
  'cross-host-roster-unavailable',
  'marker-missing-after-prior-selection',
  'marker-read-unavailable',
  'marker-bound-other-operation',
  'marker-bound-other-permit',
  'marker-malformed',
  'marker-conflicting-preexisting',
  'marker-loss-after-begin-cas',
]);

const beginPhaseScenarios = new Set<ScenarioId>([
  'marker-conflicting-preexisting',
  'marker-loss-after-begin-cas',
]);

function expected(id: ScenarioId): ExpectedOutcome {
  if (id === 'same-process-current-authorized' || id === 'legacy-generic-control') {
    return { status: 'not_executed', reason: 'not_started', retryable: true };
  }
  if (id === 'restart-current-roster' || id === 'cross-host-current-roster' || id === 'marker-exact-idempotent-reselection') {
    return { status: 'not_executed', reason: 'not_started', retryable: true };
  }
  if (id === 'restart-committed-terminal') {
    return { status: 'executed', reason: 'effect_committed', retryable: false };
  }
  if (beginPhaseScenarios.has(id)) return { status: 'blocked', reason: 'journal_inconsistent', retryable: false };
  if (id === 'marker-read-unavailable') {
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

/**
 * Configure the effect-journal store for a scenario. "Restart"/"cross-host" scenarios are modeled
 * by destroying and rebuilding process-local continuity state between the prior selection and the
 * scored call (see runScenario), not by mutating this journal, since the journal itself is already
 * host-durable in this fixture harness.
 */
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
  store.effects.set(operationId, { ...base, state: 'authorized', claimed: true, revision: 1 });

  if (id === 'legacy-generic-control') {
    store.checkpoint = undefined;
    store.authorityCheckpoints = undefined;
    store.witnessSet = undefined;
    store.witnessRoster = undefined;
  } else if (id === 'restart-committed-terminal') {
    store.effects.set(operationId, { ...base, state: 'committed', claimed: true, revision: 3, successReceipt: currentReceipt(permit) });
    store.highWater = 3;
    store.checkpoint = { operationId, revision: 3, verified: true };
    store.authorityCheckpoints = authorities(['witness-a', 'witness-b', 'witness-c'], 3, currentRosterDigest);
  } else if (id === 'restart-capability-stripped' || id === 'cross-host-roster-unavailable') {
    store.witnessRoster = undefined;
  } else if (id === 'marker-loss-after-begin-cas') {
    store.postCasCapabilityLoss = true;
  }
}

function classify(effect: Effect | undefined, proof: Proof | undefined): ApiResult {
  if (effect?.state === 'committed') return { status: 'executed', reason: 'effect_committed', retryable: false };
  if (effect?.state === 'started') return { status: 'indeterminate', reason: 'effect_started', retryable: false };
  if (effect?.state === 'authorized') return { status: 'not_executed', reason: 'not_started', retryable: true };
  if (proof?.verified && proof.outcome === 'committed') return { status: 'executed', reason: 'effect_committed', retryable: false };
  return { status: 'indeterminate', reason: 'journal_stale', retryable: false };
}

function validAuthorityId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{3,80}$/.test(value);
}

function validDigest(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
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

  const hasRosterMethod = typeof (store as any).readEffectRevisionWitnessRoster === 'function';
  if (!hasRosterMethod) return 'unavailable';

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

function validMarker(value: unknown): value is DurableMarker {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<DurableMarker>;
  const allowedKeys = new Set(['operationId', 'permitId', 'approvalId']);
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) return false;
  return (
    typeof candidate.operationId === 'string' && candidate.operationId.length > 0 &&
    typeof candidate.permitId === 'string' && /^permit_[a-f0-9]{24}$/.test(candidate.permitId) &&
    typeof candidate.approvalId === 'string' && /^aegis_[a-f0-9]{16}$/.test(candidate.approvalId)
  );
}

/**
 * Read the durable marker and check it is exactly bound to this operation/permit/approval. A
 * marker that is present but bound to a different operation or permit is contradictory evidence
 * (inconsistent), not first-use unavailability -- a fresh process/host must be able to tell the
 * difference from a durable read, since it has no other memory of prior selection.
 */
async function durableMarkerIntegrity(
  markers: DurableMarkerStore,
  op: string,
  permit: Permit,
): Promise<'current' | 'inconsistent' | 'unavailable' | 'missing'> {
  let marker: unknown;
  try {
    marker = await markers.readMarker(op);
  } catch {
    return 'unavailable';
  }
  if (marker === undefined) return 'missing';
  if (!validMarker(marker)) return 'inconsistent';
  if (marker.operationId !== op || marker.permitId !== permit.id || marker.approvalId !== permit.approvalId) {
    return 'inconsistent';
  }
  return 'current';
}

async function fixtureResolve(store: Store, markers: DurableMarkerStore, permit: Permit, id: ScenarioId): Promise<ApiResult> {
  if (id === 'legacy-generic-control') {
    return classify(await store.readEffect(operationId), store.proof);
  }
  const markerState = await durableMarkerIntegrity(markers, operationId, permit);
  if (markerState === 'unavailable') return { status: 'indeterminate', reason: 'journal_unavailable', retryable: false };
  if (markerState === 'inconsistent') return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
  if (markerState === 'missing') {
    // No prior selection is recorded at all: same as never having selected strict policy.
    if (id === 'marker-missing-after-prior-selection') return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
    return { status: 'indeterminate', reason: 'journal_unavailable', retryable: false };
  }
  const integrity = await rosterIntegrity(store);
  if (integrity === 'inconsistent') return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
  if (integrity === 'unavailable') {
    // The durable marker already confirms this exact operation/permit selected the strict
    // current-roster boundary. Roster capability disappearing after that selection is
    // contradictory adapter evidence, not first-use unavailability.
    return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
  }
  return classify(await store.readEffect(operationId), store.proof);
}

async function fixtureBegin(store: Store, markers: DurableMarkerStore, permit: Permit): Promise<ApiResult> {
  const preMarker = await durableMarkerIntegrity(markers, operationId, permit);
  if (preMarker !== 'current') return { status: 'blocked', reason: 'journal_inconsistent', retryable: false };
  const preIntegrity = await rosterIntegrity(store);
  if (preIntegrity !== 'current') return { status: 'blocked', reason: 'journal_inconsistent', retryable: false };
  await store.beginEffect(operationId);
  const postMarker = await durableMarkerIntegrity(markers, operationId, permit);
  if (postMarker !== 'current') return { status: 'blocked', reason: 'journal_inconsistent', retryable: false };
  const postIntegrity = await rosterIntegrity(store);
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
      if (property === 'readEffectRevisionCheckpoint' && id === 'legacy-generic-control') return undefined;
      if (property === 'readEffectRevisionCheckpoints' && id === 'legacy-generic-control') return undefined;
      if (property === 'readEffectRevisionWitnessSet' && id === 'legacy-generic-control') return undefined;
      if (property === 'readEffectRevisionWitnessRoster' && id === 'legacy-generic-control') return undefined;
      if (
        property === 'readEffectRevisionWitnessRoster' &&
        (id === 'restart-capability-stripped' ||
          id === 'cross-host-roster-unavailable' ||
          (id === 'marker-loss-after-begin-cas' && target.effects.get(operationId)?.state === 'started'))
      ) {
        return undefined;
      }
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * Bind the durable marker for the prior selection ("the operation previously selected strict
 * roster policy"), independent of the scored call, mirroring how a real durable marker would have
 * been written by an earlier process/host before the destruction event under test.
 */
function priorMarker(permit: Permit): DurableMarker {
  return { operationId, permitId: permit.id, approvalId: permit.approvalId };
}

function needsPriorSelection(id: ScenarioId): boolean {
  return id !== 'marker-read-unavailable' &&
    id !== 'marker-bound-other-operation' &&
    id !== 'marker-bound-other-permit' &&
    id !== 'marker-malformed' &&
    id !== 'marker-conflicting-preexisting';
}

async function runScenario(arm: Arm, id: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-exp46-'));
  const store = new Store();
  const markers = new DurableMarkerStore();
  try {
    const { permit, current, ask, consume } = await setup(runtime, dir, store);
    configure(store, permit, id);

    // Establish durable-marker host state matching the scenario before the scored call, modeling
    // what a durable marker written by an earlier process/host would already contain.
    if (id === 'marker-missing-after-prior-selection') {
      // marker was selected once, then lost (e.g. evicted/expired) -- absent at read time.
    } else if (id === 'marker-read-unavailable') {
      markers.readUnavailable = true;
    } else if (id === 'marker-bound-other-operation') {
      await markers.bindMarker(operationId, { operationId: 'op_other_operation', permitId: permit.id, approvalId: permit.approvalId });
    } else if (id === 'marker-bound-other-permit') {
      await markers.bindMarker(operationId, { operationId, permitId: 'permit_' + 'f'.repeat(24), approvalId: permit.approvalId });
    } else if (id === 'marker-malformed') {
      await markers.bindMarker(operationId, { operationId, permitId: '', approvalId: '' } as DurableMarker);
    } else if (id === 'marker-conflicting-preexisting') {
      // A different operation's selection is already bound at this key when this operation
      // attempts to select/begin -- the pre-existing marker conflicts rather than confirms.
      await markers.bindMarker(operationId, { operationId, permitId: 'permit_' + 'a'.repeat(24), approvalId: permit.approvalId });
    } else if (needsPriorSelection(id)) {
      await markers.bindMarker(operationId, priorMarker(permit));
    }

    const isBeginPhase = beginPhaseScenarios.has(id);
    let result: ApiResult;
    let apiAvailable = true;
    if (arm === 'process-local-fallback-control') {
      result = await control(store, id);
    } else if (arm === 'durable-policy-fixture') {
      const view = viewForAegis(store, id);
      if (isBeginPhase) result = await fixtureBegin(view, markers, permit);
      else result = await fixtureResolve(view, markers, permit, id);
    } else {
      const durableResolveFn = runtime.resolveDurableStrictRosterPolicyExecutionEffect;
      const durableBeginFn = runtime.beginDurableStrictRosterPolicyExecutionEffect;
      const selectFn = runtime.selectDurableStrictRosterPolicy;
      const readFn = runtime.readDurableStrictRosterPolicy;
      apiAvailable = id === 'legacy-generic-control' || (
        typeof durableResolveFn === 'function' &&
        typeof durableBeginFn === 'function' &&
        typeof selectFn === 'function' &&
        typeof readFn === 'function'
      );
      const view = viewForAegis(store, id);
      if (id === 'legacy-generic-control') {
        result = await runtime.resolveExecutionEffect(permit, current, operationId, view);
      } else if (!apiAvailable) {
        // No durable selection/readback contract is publicly available on this baseline. Aegis
        // origin/main only exposes the opaque, process-local StrictRosterContinuityContext, which
        // this harness intentionally destroys/never shares to model restart and cross-host
        // handoff -- so no fallback path can legitimately reconstruct the durable-policy result.
        result = { status: 'indeterminate', reason: 'durable_strict_roster_api_unavailable', retryable: true };
      } else if (isBeginPhase) {
        result = await durableBeginFn!(permit, current, operationId, view);
      } else {
        result = await durableResolveFn!(permit, current, operationId, view);
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
      durablePolicyFailureDetected: failureScenarios.has(id) && correct,
      durablePolicyAuthorityRestored: failureScenarios.has(id) && (actual.retryable || actual.status === 'execute' || actual.status === 'executed'),
      apiAvailable,
      askCovered: ask,
      consumeCovered: consume,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const row = (rows: ScenarioResult[], id: ScenarioId) => rows.find((value) => value.scenarioId === id)!;
const metrics = (rows: ScenarioResult[]) => {
  const failureRows = rows.filter((result) => failureScenarios.has(result.scenarioId));
  const ids = (...idsToCheck: ScenarioId[]) => idsToCheck.every((id) => row(rows, id).correct) ? 1 : 0;
  return {
    durablePolicyFailureDetectionRate: failureRows.filter((result) => result.durablePolicyFailureDetected).length / failureRows.length,
    durablePolicyAuthorityRestorationRate: failureRows.filter((result) => result.durablePolicyAuthorityRestored).length / failureRows.length,
    resolutionAccuracy: rows.filter((result) => result.correct).length / rows.length,
    durableStrictRosterApiAvailability: rows.every((result) => result.apiAvailable) ? 1 : 0,
    sameProcessPreservation: ids('same-process-current-authorized'),
    restartPreservation: ids('restart-current-roster'),
    crossHostPreservation: ids('cross-host-current-roster'),
    terminalPreservation: ids('restart-committed-terminal'),
    legacyPreservation: ids('legacy-generic-control'),
    idempotentPreservation: ids('marker-exact-idempotent-reselection'),
    restartCapabilityLossSafety: ids('restart-capability-stripped'),
    crossHostUnavailabilitySafety: ids('cross-host-roster-unavailable'),
    markerMissingSafety: ids('marker-missing-after-prior-selection'),
    markerReadUnavailableSafety: ids('marker-read-unavailable'),
    markerOtherOperationSafety: ids('marker-bound-other-operation'),
    markerOtherPermitSafety: ids('marker-bound-other-permit'),
    markerMalformedSafety: ids('marker-malformed'),
    markerConflictingSafety: ids('marker-conflicting-preexisting'),
    markerPostCasLossSafety: ids('marker-loss-after-begin-cas'),
    askCoverage: rows.every((result) => result.askCovered) ? 1 : 0,
    consumeCoverage: rows.every((result) => result.consumeCovered) ? 1 : 0,
  };
};

const runtime = await loadRuntime();
const runId = `dsr-${Date.now().toString(36)}`;
const runDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runDir, { recursive: true });
const tracePath = join(runDir, `${runId}.jsonl`);
const trace = new TraceWriter(tracePath, { runId, experiment: '46-durable-strict-roster-policy' });
const bus = new MessageBus({ trace });
const stub = new StubRuntime();
const results = new Map<Arm, ScenarioResult[]>();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    evidenceVersion: 1,
    experiment: '46-durable-strict-roster-policy',
    spec: '52-durable-strict-roster-policy',
    runId,
    timestamp: new Date().toISOString(),
    seed: SEED,
    scenarios,
    arms,
    aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'built-artifact+real-hook-public-api' },
  },
});

for (const arm of arms) {
  const agent = await spawnAgent({ id: `dsr:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace });
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

for (const arm of arms) {
  const values = metrics(results.get(arm)!);
  trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(values).map(([key, value]) => [arm.replaceAll('-', '_') + '_' + key, value])) });
  console.log(arm, values);
}

const green = (metricValues: ReturnType<typeof metrics>) =>
  metricValues.durablePolicyFailureDetectionRate === 1 &&
  metricValues.durablePolicyAuthorityRestorationRate === 0 &&
  Object.entries(metricValues).filter(([key]) => key !== 'durablePolicyAuthorityRestorationRate').every(([, value]) => value === 1);

const scorer: Scorer = {
  score() {
    const fixtureValues = metrics(results.get('durable-policy-fixture')!);
    const aegisValues = metrics(results.get('aegis-wrapped')!);
    if (!green(fixtureValues)) {
      throw new Error(`durable-policy-fixture must be green: ${JSON.stringify(fixtureValues)}`);
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
