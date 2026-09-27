import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime, type Scorer, type TraceEvent } from '@swarmlab/core';
import type { ActionStatus, Arm, ScenarioId, ScenarioResult } from './types.js';

const SEED = 'durable-strict-roster-retirement-compaction-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-25-exp48-baseline';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const HOOK = process.env['AEGIS_HOOK_DIST'] ?? `${AEGIS_REPO}/packages/aegis-hook/dist/index.js`;
const sha = (repo: string) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const operationId = 'op_durable_strict_roster_retirement_compaction';
const otherOperationId = 'op_unrelated_retirement_still_classified';
const signature = 'lifecycle-compaction-harness-signature';
const permitApprovalId = `aegis_${'3'.repeat(16)}`;
const otherApprovalId = `aegis_${'5'.repeat(16)}`;
const permit = { id: `permit_${createHash('sha256').update(`${permitApprovalId}:${signature}`).digest('hex').slice(0, 24)}`, approvalId: permitApprovalId };
const otherPermit = { id: `permit_${createHash('sha256').update(`${otherApprovalId}:${signature}`).digest('hex').slice(0, 24)}`, approvalId: otherApprovalId };
const committedDigest = digest('committed-receipt');
const failedDigest = digest('failed-receipt');
type Outcome = 'committed' | 'failed';
type MarkerBase = { operationId: string; permitId: string; approvalId: string };
type ActiveMarker = MarkerBase;
type RetiredMarker = MarkerBase & { status: 'retired'; outcome: Outcome; receiptDigest: string; terminalRevision: number };
type CompactedCheckpoint = { operationId: string; status: 'retirement_compacted'; outcome: Outcome; receiptDigest: string; terminalRevision: number; checkpointDigest: string; verified: boolean };
type Marker = ActiveMarker | RetiredMarker | CompactedCheckpoint;
type ActionResult = { status: ActionStatus; reason?: string; retryable?: boolean };

const checkpointDigest = (op: string, permitId: string, approvalId: string, outcome: Outcome, receiptDigest: string, terminalRevision: number) =>
  `sha256:${createHash('sha256').update(JSON.stringify({ approvalId, operationId: op, outcome, permitId, receiptDigest, terminalRevision })).digest('hex')}`;

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
  async readEffect(op: string) {
    const truth = this.terminal.get(op);
    if (!truth) return { operationId: op, permit: { ...permit, signature }, state: 'authorized', claimed: true, revision: 1 };
    const p = op === otherOperationId ? otherPermit : permit;
    return {
      operationId: op,
      permit: { ...p, signature },
      state: truth.outcome,
      claimed: true,
      revision: truth.revision,
      ...(truth.outcome === 'committed'
        ? { successReceipt: { permitId: p.id, approvalId: p.approvalId, operationId: op, receiptDigest: truth.receiptDigest, verified: true } }
        : { failureReceipt: { permitId: p.id, approvalId: p.approvalId, operationId: op, receiptDigest: truth.receiptDigest, failureCode: 'verified_failure', verified: true } }),
    };
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
  async compactStrictRosterPolicyRetirement(op: string, expectedRetired: RetiredMarker, checkpoint: CompactedCheckpoint) {
    if (this.unavailable) throw new Error('lifecycle unavailable');
    const current = this.markers.get(op);
    const authenticated = { ...checkpoint, verified: true };
    if (stable(current) === stable(authenticated)) return false;
    if (stable(current) !== stable(expectedRetired)) return false;
    this.markers.set(op, structuredClone(authenticated)); return true;
  }
}
const active = (op: string, p = permit): ActiveMarker => ({ operationId: op, permitId: p.id, approvalId: p.approvalId });
const retired = (outcome: Outcome, overrides: Partial<RetiredMarker> = {}): RetiredMarker => ({ ...active(operationId), status: 'retired', outcome, receiptDigest: outcome === 'committed' ? committedDigest : failedDigest, terminalRevision: 3, ...overrides });
const compacted = (outcome: Outcome, overrides: Partial<CompactedCheckpoint> = {}): CompactedCheckpoint => {
  const receiptDigest = outcome === 'committed' ? committedDigest : failedDigest;
  const terminalRevision = 3;
  const base: CompactedCheckpoint = {
    operationId,
    status: 'retirement_compacted',
    outcome,
    receiptDigest,
    terminalRevision,
    checkpointDigest: checkpointDigest(operationId, permit.id, permit.approvalId, outcome, receiptDigest, terminalRevision),
    verified: true,
  };
  return { ...base, ...overrides };
};
const stable = (value: unknown) => JSON.stringify(value, Object.keys((value ?? {}) as object).sort());

interface Runtime {
  retireDurableStrictRosterPolicy?: (p: any, op: string, outcome: Outcome, receiptDigest: string, terminalRevision: number, store: any, journal: any) => Promise<any>;
  readDurableStrictRosterPolicyLifecycle?: (op: string, store: any) => Promise<any>;
  compactDurableStrictRosterPolicyRetirement?: (p: any, op: string, outcome: Outcome, receiptDigest: string, terminalRevision: number, store: any) => Promise<any>;
  resolveCompactedDurableStrictRosterPolicyExecutionEffect?: (p: any, op: string, store: any) => Promise<any>;
  beginCompactedDurableStrictRosterPolicyExecutionEffect?: (p: any, op: string, store: any) => Promise<any>;
  selectDurableStrictRosterPolicy?: (p: any, current: any, op: string, store: any) => Promise<any>;
}
async function loadRuntime(): Promise<Runtime> {
  await import(pathToFileURL(AEGIS_DIST).href);
  const hook: any = await import(pathToFileURL(HOOK).href);
  return {
    retireDurableStrictRosterPolicy: hook.retireDurableStrictRosterPolicy,
    readDurableStrictRosterPolicyLifecycle: hook.readDurableStrictRosterPolicyLifecycle,
    compactDurableStrictRosterPolicyRetirement: hook.compactDurableStrictRosterPolicyRetirement,
    resolveCompactedDurableStrictRosterPolicyExecutionEffect: hook.resolveCompactedDurableStrictRosterPolicyExecutionEffect,
    beginCompactedDurableStrictRosterPolicyExecutionEffect: hook.beginCompactedDurableStrictRosterPolicyExecutionEffect,
    selectDurableStrictRosterPolicy: hook.selectDurableStrictRosterPolicy,
  };
}

const scenarios: ScenarioId[] = [
  'compact-committed-exact', 'compact-failed-exact', 'compact-idempotent-exact', 'late-resolve-committed-compacted',
  'late-resolve-failed-compacted', 'late-begin-after-compaction', 'reselection-after-compaction', 'compact-before-retirement',
  'compact-wrong-operation', 'compact-wrong-permit', 'compact-wrong-outcome', 'compact-wrong-receipt-digest',
  'compact-wrong-terminal-revision', 'compaction-unverified', 'compaction-malformed', 'compaction-store-unavailable',
  'compaction-checkpoint-lost', 'unrelated-retirement-still-classified',
];
const arms: Arm[] = ['delete-retirement-control', 'authenticated-checkpoint-fixture', 'aegis-wrapped'];
// Scenarios expected to expose a lifecycle-compaction weakness in a harness that cannot authenticate
// a compacted checkpoint distinctly from tombstone loss (indices 3..16 inclusive, 0-based).
const failures = new Set<ScenarioId>(scenarios.slice(3, 17));
const wants = (id: ScenarioId): ActionResult => {
  if (id === 'compact-committed-exact' || id === 'compact-failed-exact' || id === 'compact-idempotent-exact') return { status: 'retired', reason: 'policy_retired', retryable: false };
  if (id === 'late-resolve-committed-compacted') return { status: 'retired', reason: 'effect_committed', retryable: false };
  if (id === 'late-resolve-failed-compacted') return { status: 'retired', reason: 'effect_failed', retryable: false };
  if (id === 'unrelated-retirement-still-classified') return { status: 'retired', reason: 'effect_committed', retryable: false };
  if (id === 'compaction-store-unavailable') return { status: 'indeterminate', reason: 'policy_unavailable', retryable: false };
  return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
};

const isCompactedCheckpoint = (marker: Marker | undefined): marker is CompactedCheckpoint =>
  marker !== undefined && 'status' in marker && marker.status === 'retirement_compacted';
const isRetiredTombstone = (marker: Marker | undefined): marker is RetiredMarker =>
  marker !== undefined && 'status' in marker && marker.status === 'retired';
const validCompactedCheckpoint = (marker: CompactedCheckpoint, permitId: string, approvalId: string): boolean =>
  marker.verified === true
  && marker.checkpointDigest === checkpointDigest(marker.operationId, permitId, approvalId, marker.outcome, marker.receiptDigest, marker.terminalRevision);

async function fixture(id: ScenarioId, store: LifecycleStore): Promise<ActionResult> {
  const outcome: Outcome = id.includes('failed') ? 'failed' : 'committed';
  const compactionCallIds = new Set<ScenarioId>([
    'compact-committed-exact', 'compact-failed-exact', 'compact-idempotent-exact', 'compact-before-retirement',
    'compact-wrong-operation', 'compact-wrong-permit', 'compact-wrong-outcome', 'compact-wrong-receipt-digest',
    'compact-wrong-terminal-revision',
  ]);

  if (id === 'compaction-store-unavailable') return { status: 'indeterminate', reason: 'policy_unavailable', retryable: false };

  if (id === 'unrelated-retirement-still-classified') {
    const marker = await store.readStrictRosterPolicy(otherOperationId).catch(() => undefined);
    if (!isRetiredTombstone(marker)) return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
    return { status: 'retired', reason: marker.outcome === 'committed' ? 'effect_committed' : 'effect_failed', retryable: false };
  }

  if (id === 'late-begin-after-compaction' || id === 'reselection-after-compaction') {
    return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
  }

  if (id === 'late-resolve-committed-compacted' || id === 'late-resolve-failed-compacted' || id === 'compaction-checkpoint-lost' || id === 'compaction-malformed' || id === 'compaction-unverified') {
    const marker = await store.readStrictRosterPolicy(operationId).catch(() => undefined);
    if (!isCompactedCheckpoint(marker) || !validCompactedCheckpoint(marker, permit.id, permit.approvalId)) {
      return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
    }
    if (id === 'late-resolve-committed-compacted') return { status: 'retired', reason: 'effect_committed', retryable: false };
    if (id === 'late-resolve-failed-compacted') return { status: 'retired', reason: 'effect_failed', retryable: false };
    return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
  }

  if (!compactionCallIds.has(id)) return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };

  const terminalOutcome: Outcome = id === 'compact-wrong-outcome' ? 'failed' : outcome;
  store.terminal.set(operationId, { outcome: terminalOutcome, receiptDigest: outcome === 'committed' ? committedDigest : failedDigest, revision: 3 });
  const expectedRetired = retired(outcome);
  if (id !== 'compact-before-retirement') {
    const seed = await store.retireStrictRosterPolicy(operationId, active(operationId), expectedRetired);
    if (!seed) return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
  }
  const checkpoint = compacted(outcome, {
    operationId: id === 'compact-wrong-operation' ? otherOperationId : operationId,
    receiptDigest: id === 'compact-wrong-receipt-digest' ? digest('wrong') : (outcome === 'committed' ? committedDigest : failedDigest),
    terminalRevision: id === 'compact-wrong-terminal-revision' ? 99 : 3,
  });
  const permitForCall = id === 'compact-wrong-permit' ? otherPermit : permit;
  const expectedRetiredForCall: RetiredMarker = id === 'compact-wrong-permit' || id === 'compact-wrong-operation'
    ? { ...expectedRetired, permitId: permitForCall.id, approvalId: permitForCall.approvalId, operationId: checkpoint.operationId }
    : expectedRetired;
  if (checkpoint.operationId !== operationId) {
    return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
  }
  const valid = checkpoint.status === 'retirement_compacted' && checkpoint.verified === true
    && checkpoint.checkpointDigest === checkpointDigest(checkpoint.operationId, permit.id, permit.approvalId, checkpoint.outcome, checkpoint.receiptDigest, checkpoint.terminalRevision)
    && checkpoint.outcome === outcome && checkpoint.receiptDigest === (outcome === 'committed' ? committedDigest : failedDigest) && checkpoint.terminalRevision === 3;
  if (!valid) return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
  const ok = await store.compactStrictRosterPolicyRetirement(operationId, expectedRetiredForCall, checkpoint).catch(() => false);
  const readback = await store.readStrictRosterPolicy(operationId).catch(() => undefined);
  if (ok || stable(readback) === stable(checkpoint)) return { status: 'retired', reason: 'policy_retired', retryable: false };
  return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
}

async function control(id: ScenarioId, store: LifecycleStore): Promise<ActionResult> {
  if (id === 'unrelated-retirement-still-classified') return { status: 'retired', reason: 'effect_committed', retryable: false };
  if (id === 'compaction-store-unavailable') return { status: 'active', reason: 'policy_active', retryable: true };
  // Models unauthenticated GC: the full tombstone is simply deleted, so late reads cannot
  // distinguish intentional compaction from tombstone loss and default back to active authority.
  store.markers.delete(operationId);
  return { status: 'active', reason: 'policy_active', retryable: true };
}

async function aegis(id: ScenarioId, store: LifecycleStore, runtime: Runtime): Promise<{ result: ActionResult; api: boolean }> {
  const api = typeof runtime.compactDurableStrictRosterPolicyRetirement === 'function'
    && typeof runtime.readDurableStrictRosterPolicyLifecycle === 'function'
    && typeof runtime.resolveCompactedDurableStrictRosterPolicyExecutionEffect === 'function'
    && typeof runtime.beginCompactedDurableStrictRosterPolicyExecutionEffect === 'function'
    && typeof runtime.retireDurableStrictRosterPolicy === 'function';
  if (!api) return { api, result: { status: 'indeterminate', reason: 'retirement_compaction_api_unavailable', retryable: true } };

  if (id === 'unrelated-retirement-still-classified') {
    store.terminal.set(otherOperationId, { outcome: 'committed', receiptDigest: committedDigest, revision: 3 });
    await runtime.retireDurableStrictRosterPolicy!(otherPermit, otherOperationId, 'committed', committedDigest, 3, store, store);
    const value = await runtime.resolveCompactedDurableStrictRosterPolicyExecutionEffect!(otherPermit, otherOperationId, store);
    if (value?.status === 'blocked') {
      const record: any = await runtime.readDurableStrictRosterPolicyLifecycle!(otherOperationId, store);
      if (record && record.status === 'retired') return { api, result: { status: 'retired', reason: record.outcome === 'committed' ? 'effect_committed' : 'effect_failed', retryable: false } };
    }
    return { api, result: value };
  }

  const outcome: Outcome = id.includes('failed') ? 'failed' : 'committed';
  const setupNeedsRetirement = id !== 'compact-before-retirement';
  const setupNeedsCompaction = id === 'late-resolve-committed-compacted' || id === 'late-resolve-failed-compacted'
    || id === 'late-begin-after-compaction' || id === 'reselection-after-compaction'
    || id === 'compaction-checkpoint-lost';

  if (id.startsWith('compact-')) {
    store.terminal.set(operationId, { outcome, receiptDigest: outcome === 'committed' ? committedDigest : failedDigest, revision: 3 });
    if (setupNeedsRetirement) await runtime.retireDurableStrictRosterPolicy!(permit, operationId, outcome, outcome === 'committed' ? committedDigest : failedDigest, 3, store, store);
    let callPermit = permit;
    let callOperation = operationId;
    let callOutcome = outcome;
    let callDigest = outcome === 'committed' ? committedDigest : failedDigest;
    let callRevision = 3;
    if (id === 'compact-wrong-outcome') callOutcome = outcome === 'committed' ? 'failed' : 'committed';
    if (id === 'compact-wrong-receipt-digest') callDigest = digest('wrong');
    if (id === 'compact-wrong-terminal-revision') callRevision = 99;
    if (id === 'compact-wrong-operation') callOperation = otherOperationId;
    if (id === 'compact-wrong-permit') callPermit = otherPermit;
    if (id === 'compact-idempotent-exact') await runtime.compactDurableStrictRosterPolicyRetirement!(callPermit, callOperation, callOutcome, callDigest, callRevision, store);
    const value = await runtime.compactDurableStrictRosterPolicyRetirement!(callPermit, callOperation, callOutcome, callDigest, callRevision, store);
    return { api, result: value };
  }

  if (setupNeedsCompaction) {
    store.terminal.set(operationId, { outcome, receiptDigest: outcome === 'committed' ? committedDigest : failedDigest, revision: 3 });
    await runtime.retireDurableStrictRosterPolicy!(permit, operationId, outcome, outcome === 'committed' ? committedDigest : failedDigest, 3, store, store);
    await runtime.compactDurableStrictRosterPolicyRetirement!(permit, operationId, outcome, outcome === 'committed' ? committedDigest : failedDigest, 3, store);
    if (id === 'compaction-checkpoint-lost') store.markers.delete(operationId);
  }
  if (id === 'compaction-malformed') store.markers.set(operationId, { ...compacted('committed'), checkpointDigest: digest('tampered') });
  if (id === 'compaction-unverified') store.markers.set(operationId, { ...compacted('committed'), verified: false });
  if (id === 'compaction-store-unavailable') store.unavailable = true;

  const value = id === 'late-begin-after-compaction' || id === 'reselection-after-compaction'
    ? await runtime.beginCompactedDurableStrictRosterPolicyExecutionEffect!(permit, operationId, store)
    : await runtime.resolveCompactedDurableStrictRosterPolicyExecutionEffect!(permit, operationId, store);
  return { api, result: value };
}

async function runScenario(arm: Arm, id: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const store = new LifecycleStore();
  if (id === 'late-resolve-committed-compacted') {
    store.terminal.set(operationId, { outcome: 'committed', receiptDigest: committedDigest, revision: 3 });
    await store.retireStrictRosterPolicy(operationId, active(operationId), retired('committed'));
    await store.compactStrictRosterPolicyRetirement(operationId, retired('committed'), compacted('committed'));
  }
  if (id === 'late-resolve-failed-compacted') {
    store.terminal.set(operationId, { outcome: 'failed', receiptDigest: failedDigest, revision: 3 });
    await store.retireStrictRosterPolicy(operationId, active(operationId), retired('failed'));
    await store.compactStrictRosterPolicyRetirement(operationId, retired('failed'), compacted('failed'));
  }
  if (id === 'late-begin-after-compaction' || id === 'reselection-after-compaction') {
    store.terminal.set(operationId, { outcome: 'committed', receiptDigest: committedDigest, revision: 3 });
    await store.retireStrictRosterPolicy(operationId, active(operationId), retired('committed'));
    await store.compactStrictRosterPolicyRetirement(operationId, retired('committed'), compacted('committed'));
  }
  if (id === 'compaction-malformed') store.markers.set(operationId, { ...compacted('committed'), checkpointDigest: digest('tampered') });
  if (id === 'compaction-unverified') store.markers.set(operationId, { ...compacted('committed'), verified: false });
  if (id === 'compaction-store-unavailable') store.unavailable = true;
  if (id === 'compaction-checkpoint-lost') {
    store.terminal.set(operationId, { outcome: 'committed', receiptDigest: committedDigest, revision: 3 });
    await store.retireStrictRosterPolicy(operationId, active(operationId), retired('committed'));
    await store.compactStrictRosterPolicyRetirement(operationId, retired('committed'), compacted('committed'));
    store.markers.delete(operationId);
  }
  if (id === 'unrelated-retirement-still-classified') {
    store.terminal.set(otherOperationId, { outcome: 'committed', receiptDigest: committedDigest, revision: 3 });
    store.markers.set(otherOperationId, { ...active(otherOperationId, otherPermit), status: 'retired', outcome: 'committed', receiptDigest: committedDigest, terminalRevision: 3 });
  }
  let result: ActionResult; let apiAvailable = true;
  if (arm === 'delete-retirement-control') result = await control(id, store);
  else if (arm === 'authenticated-checkpoint-fixture') result = await fixture(id, store);
  else ({ result, api: apiAvailable } = await aegis(id, store, runtime));
  const want = wants(id); const actual = { status: result.status, reason: result.reason ?? '', retryable: result.retryable ?? false };
  const correct = actual.status === want.status && actual.reason === want.reason && actual.retryable === want.retryable;
  return { scenarioId: id, ...actual, expectedStatus: want.status!, expectedReason: want.reason!, expectedRetryable: want.retryable!, correct, compactionFailureDetected: failures.has(id) && correct, compactedAuthorityRestored: failures.has(id) && (actual.retryable || actual.status === 'active'), apiAvailable };
}

const row = (rows: ScenarioResult[], id: ScenarioId) => rows.find(v => v.scenarioId === id)!;
const metrics = (rows: ScenarioResult[]) => {
  const failureRows = rows.filter(v => failures.has(v.scenarioId));
  const ids = (...x: ScenarioId[]) => x.every(id => row(rows, id).correct) ? 1 : 0;
  return {
    compactionFailureDetectionRate: failureRows.filter(v => v.compactionFailureDetected).length / failureRows.length,
    compactedAuthorityRestorationRate: failureRows.filter(v => v.compactedAuthorityRestored).length / failureRows.length,
    resolutionAccuracy: rows.filter(v => v.correct).length / rows.length,
    retirementCompactionApiAvailability: rows.every(v => v.apiAvailable) ? 1 : 0,
    committedCompaction: ids('compact-committed-exact'),
    failedCompaction: ids('compact-failed-exact'),
    idempotentCompaction: ids('compact-idempotent-exact'),
    lateCommittedResolveSafety: ids('late-resolve-committed-compacted'),
    lateFailedResolveSafety: ids('late-resolve-failed-compacted'),
    lateBeginSafety: ids('late-begin-after-compaction'),
    abaSafety: ids('reselection-after-compaction'),
    preRetirementSafety: ids('compact-before-retirement'),
    wrongOperationSafety: ids('compact-wrong-operation'),
    wrongPermitSafety: ids('compact-wrong-permit'),
    wrongOutcomeSafety: ids('compact-wrong-outcome'),
    wrongDigestSafety: ids('compact-wrong-receipt-digest'),
    wrongRevisionSafety: ids('compact-wrong-terminal-revision'),
    unverifiedSafety: ids('compaction-unverified'),
    malformedSafety: ids('compaction-malformed'),
    unavailableSafety: ids('compaction-store-unavailable'),
    checkpointLossSafety: ids('compaction-checkpoint-lost'),
    operationIsolation: ids('unrelated-retirement-still-classified'),
  };
};
const green = (m: ReturnType<typeof metrics>) => m.compactionFailureDetectionRate === 1 && m.compactedAuthorityRestorationRate === 0 && Object.entries(m).filter(([k]) => k !== 'compactedAuthorityRestorationRate').every(([, v]) => v === 1);

const runtime = await loadRuntime(); const runId = `dsrc-${Date.now().toString(36)}`; const runDir = join(import.meta.dirname, '..', 'runs'); mkdirSync(runDir, { recursive: true }); const tracePath = join(runDir, `${runId}.jsonl`); const trace = new TraceWriter(tracePath, { runId, experiment: '48-durable-strict-roster-retirement-compaction' }); const bus = new MessageBus({ trace }); const stub = new StubRuntime(); const results = new Map<Arm, ScenarioResult[]>();
bus.publish({ from: 'moderator', to: '*', topic: 'meta', body: { evidenceVersion: 1, experiment: '48-durable-strict-roster-retirement-compaction', spec: '54-durable-strict-roster-retirement-compaction', runId, timestamp: new Date().toISOString(), seed: SEED, scenarios, arms, aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'built-artifact+real-hook-public-api' } } });
for (const arm of arms) { const agent = await spawnAgent({ id: `dsrc:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace }); const rows = []; for (const id of scenarios) { const value = await runScenario(arm, id, runtime); rows.push(value); bus.publish({ from: agent.id, to: 'moderator', topic: 'scenario', body: { arm, ...value } }); } results.set(arm, rows); await agent.kill(); bus.removeAgent(agent.id); const values = metrics(rows); trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(values).map(([k, v]) => [arm.replaceAll('-', '_') + '_' + k, v])) }); console.log(arm, values); }
const scorer: Scorer = { score() { const fixture = metrics(results.get('authenticated-checkpoint-fixture')!); const wrapped = metrics(results.get('aegis-wrapped')!); if (!green(fixture)) throw new Error(`authenticated-checkpoint-fixture must be green: ${JSON.stringify(fixture)}`); return { fixtureGreen: 1, baselineAegisRed: green(wrapped) ? 0 : 1, ...Object.fromEntries(Object.entries(wrapped).map(([k, v]) => [`aegisWrapped${k[0]!.toUpperCase()}${k.slice(1)}`, v])) }; } }; const summary = runScorer(scorer, trace.toRunRecord()); trace.append({ t: 'score', ts: Date.now(), scores: summary }); console.log('summary:', JSON.stringify(summary)); const written = trace.toRunRecord(); const replayed = await readRunRecord(tracePath); const count = (e: readonly TraceEvent[], t: TraceEvent['t']) => e.filter(x => x.t === t).length; for (const t of ['spawn', 'message', 'score', 'kill'] as const) if (count(written.events, t) !== count(replayed.events, t)) throw new Error(`replay mismatch ${t}`); console.log(`replay verified: ${replayed.events.length} events`); console.log(`trace: ${tracePath}`);
