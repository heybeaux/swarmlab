import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
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
import type { ActionStatus, Arm, ExpectedOutcome, ScenarioId, ScenarioResult } from './types.js';

const SEED = 'compact-retirement-checkpoint-equivocation-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-28-exp49';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const HOOK = process.env['AEGIS_HOOK_DIST'] ?? `${AEGIS_REPO}/packages/aegis-hook/dist/index.js`;
const AEGIS_BUILD_ID = process.env['AEGIS_BUILD_ID'] ?? '';
const moduleUrl = (value: string) => { const url = pathToFileURL(value); if (AEGIS_BUILD_ID) url.searchParams.set('build', AEGIS_BUILD_ID); return url.href; };
const sha = (repo: string) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

// ---------------------------------------------------------------------------
// Machine-owned identity and deterministic ground truth.
// ---------------------------------------------------------------------------
const operationId = 'op_compact_retirement_checkpoint_equivocation';
const otherOperationId = 'op_unrelated_full_retirement_still_classified';
const signature = 'compact-retirement-checkpoint-equivocation-harness-signature';
const permitApprovalId = `aegis_${'3'.repeat(16)}`;
const otherApprovalId = `aegis_${'5'.repeat(16)}`;
const permit = { id: `permit_${createHash('sha256').update(`${permitApprovalId}:${signature}`).digest('hex').slice(0, 24)}`, approvalId: permitApprovalId };
const otherPermit = { id: `permit_${createHash('sha256').update(`${otherApprovalId}:${signature}`).digest('hex').slice(0, 24)}`, approvalId: otherApprovalId };
const committedDigest = digest('committed-receipt');
const failedDigest = digest('failed-receipt');
const terminalRevision = 3;

type Outcome = 'committed' | 'failed';
type Permit = { id: string; approvalId: string };
type ApiResult = { status: ActionStatus; reason?: string; retryable?: boolean };

// The local compact record physically replaces the full tombstone: no permit/approval
// fields remain, only the self-binding checkpoint proof.
type CompactRecord = {
  operationId: string;
  status: 'retirement_compacted';
  outcome: Outcome;
  receiptDigest: string;
  terminalRevision: number;
  checkpointDigest: string;
  verified: boolean;
};
// A full (uncompacted) retirement tombstone, used only for the isolation scenario.
type FullRetirement = {
  operationId: string;
  status: 'retired';
  permitId: string;
  approvalId: string;
  outcome: Outcome;
  receiptDigest: string;
  terminalRevision: number;
};
// An independently authenticated lifecycle-checkpoint authority visible to the host.
type AuthorityCheckpoint = {
  authorityId: string;
  operationId: string;
  outcome: Outcome;
  receiptDigest: string;
  terminalRevision: number;
  checkpointDigest: string;
  verified: boolean;
};

const checkpointDigest = (op: string, permitId: string, approvalId: string, outcome: Outcome, receiptDigest: string, revision: number) =>
  `sha256:${createHash('sha256').update(JSON.stringify({ approvalId, operationId: op, outcome, permitId, receiptDigest, terminalRevision: revision })).digest('hex')}`;


const compactRecord = (outcome: Outcome, overrides: Partial<CompactRecord> = {}): CompactRecord => {
  const receiptDigest = outcome === 'committed' ? committedDigest : failedDigest;
  return {
    operationId,
    status: 'retirement_compacted',
    outcome,
    receiptDigest,
    terminalRevision,
    checkpointDigest: checkpointDigest(operationId, permit.id, permit.approvalId, outcome, receiptDigest, terminalRevision),
    verified: true,
    ...overrides,
  };
};

const authority = (id: string, outcome: Outcome, overrides: Partial<AuthorityCheckpoint> = {}): AuthorityCheckpoint => {
  const receiptDigest = outcome === 'committed' ? committedDigest : failedDigest;
  return {
    authorityId: id,
    operationId,
    outcome,
    receiptDigest,
    terminalRevision,
    checkpointDigest: checkpointDigest(operationId, permit.id, permit.approvalId, outcome, receiptDigest, terminalRevision),
    verified: true,
    ...overrides,
  };
};

const stable = (value: unknown) => JSON.stringify(value, Object.keys((value ?? {}) as object).sort());

// ---------------------------------------------------------------------------
// Host store: owns the local compact record and the independent authority set.
// Aegis owns only the plural evidence contract and resolver over this store.
// ---------------------------------------------------------------------------
class LifecycleStore {
  record: CompactRecord | FullRetirement | undefined;
  authorities: AuthorityCheckpoint[] | undefined;
  authoritiesUnavailable = false;
  otherRecord: FullRetirement | undefined;

  async readStrictRosterPolicy(op: string): Promise<CompactRecord | FullRetirement | undefined> {
    if (op === otherOperationId) return this.otherRecord === undefined ? undefined : structuredClone(this.otherRecord);
    return this.record === undefined ? undefined : structuredClone(this.record);
  }
  async readCompactRetirementCheckpointAuthorities(op: string): Promise<AuthorityCheckpoint[] | undefined> {
    if (op !== operationId) return undefined;
    if (this.authoritiesUnavailable) throw new Error('lifecycle checkpoint authorities unavailable');
    return this.authorities === undefined ? undefined : structuredClone(this.authorities);
  }
  async bindStrictRosterPolicy(_op: string, _record: unknown): Promise<boolean> { return false; }
  async retireStrictRosterPolicy(_op: string, _active: unknown, _retired: unknown): Promise<boolean> { return false; }
  async compactStrictRosterPolicyRetirement(_op: string, _retired: unknown, _checkpoint: unknown): Promise<boolean> { return false; }
}

// ---------------------------------------------------------------------------
// Frozen scenario set (order is frozen by Spec 55, section "frozen scenarios").
// ---------------------------------------------------------------------------
const scenarios: ScenarioId[] = [
  'single-checkpoint-committed-exact',
  'plural-committed-agreement',
  'plural-failed-agreement',
  'authority-order-independence',
  'outcome-equivocation',
  'receipt-digest-equivocation',
  'terminal-revision-equivocation',
  'checkpoint-digest-equivocation',
  'local-versus-authority-conflict',
  'restored-old-local-hidden-by-authority',
  'authority-source-unavailable',
  'authority-set-absent',
  'authority-set-empty',
  'authority-unverified',
  'authority-duplicate-identity',
  'authority-wrong-operation',
  'authority-malformed-checkpoint',
  'compact-begin-blocked-under-plural-proof',
  'unrelated-full-retirement-still-classified',
];
const arms: Arm[] = ['single-checkpoint-control', 'multi-authority-fixture', 'aegis-wrapped'];

// Equivocation/conflict/rollback scenarios: the local compact record looks self-consistent
// and terminal, but an independent authority exposes a conflicting truth. A single-authority
// resolver reports false terminal certainty here; a plural resolver must detect it.
const equivocation = new Set<ScenarioId>([
  'outcome-equivocation',
  'receipt-digest-equivocation',
  'terminal-revision-equivocation',
  'checkpoint-digest-equivocation',
  'local-versus-authority-conflict',
  'restored-old-local-hidden-by-authority',
]);

function expected(id: ScenarioId): ExpectedOutcome {
  switch (id) {
    case 'single-checkpoint-committed-exact':
    case 'plural-committed-agreement':
      return { status: 'retired', reason: 'effect_committed', retryable: false };
    case 'plural-failed-agreement':
      return { status: 'retired', reason: 'effect_failed', retryable: false };
    case 'authority-order-independence':
      return { status: 'retired', reason: 'effect_committed', retryable: false };
    case 'unrelated-full-retirement-still-classified':
      return { status: 'retired', reason: 'effect_committed', retryable: false };
    case 'authority-source-unavailable':
      return { status: 'indeterminate', reason: 'policy_unavailable', retryable: false };
    case 'authority-set-absent':
      return { status: 'indeterminate', reason: 'policy_unavailable', retryable: false };
    default:
      // empty/invalid authority sets and all equivocation/conflict/begin scenarios fail closed.
      return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
  }
}

// ---------------------------------------------------------------------------
// Deterministic per-scenario store configuration.
// ---------------------------------------------------------------------------
function configure(store: LifecycleStore, id: ScenarioId): void {
  const localOutcome: Outcome = id === 'plural-failed-agreement' ? 'failed' : 'committed';
  store.record = compactRecord(localOutcome);
  store.authorities = [authority('authority-a', localOutcome), authority('authority-b', localOutcome)];
  store.authoritiesUnavailable = false;
  store.otherRecord = undefined;

  switch (id) {
    case 'single-checkpoint-committed-exact':
      // Exactly one authority present, agreeing with the local record.
      store.authorities = [authority('authority-a', 'committed')];
      break;
    case 'plural-committed-agreement':
    case 'plural-failed-agreement':
      break;
    case 'authority-order-independence':
      // Same authorities, deliberately reversed order; result must not depend on order.
      store.authorities = [authority('authority-b', 'committed'), authority('authority-a', 'committed')];
      break;
    case 'outcome-equivocation':
      store.authorities = [authority('authority-a', 'committed'), authority('authority-b', 'failed')];
      break;
    case 'receipt-digest-equivocation':
      store.authorities = [
        authority('authority-a', 'committed'),
        authority('authority-b', 'committed', {
          receiptDigest: digest('forked-receipt'),
          checkpointDigest: checkpointDigest(operationId, permit.id, permit.approvalId, 'committed', digest('forked-receipt'), terminalRevision),
        }),
      ];
      break;
    case 'terminal-revision-equivocation':
      store.authorities = [
        authority('authority-a', 'committed'),
        authority('authority-b', 'committed', {
          terminalRevision: terminalRevision + 1,
          checkpointDigest: checkpointDigest(operationId, permit.id, permit.approvalId, 'committed', committedDigest, terminalRevision + 1),
        }),
      ];
      break;
    case 'checkpoint-digest-equivocation':
      // Same outcome/receipt/revision, but a divergent (forked) history checkpoint digest.
      store.authorities = [
        authority('authority-a', 'committed'),
        authority('authority-b', 'committed', { checkpointDigest: digest('forked-history') }),
      ];
      break;
    case 'local-versus-authority-conflict':
      // Local compact record says committed; every authority says failed.
      store.record = compactRecord('committed');
      store.authorities = [authority('authority-a', 'failed'), authority('authority-b', 'failed')];
      break;
    case 'restored-old-local-hidden-by-authority':
      // A stale local compact checkpoint (old revision) is restored while independent
      // authorities retain the newer terminal revision.
      store.record = compactRecord('committed', {
        terminalRevision: terminalRevision - 1,
        checkpointDigest: checkpointDigest(operationId, permit.id, permit.approvalId, 'committed', committedDigest, terminalRevision - 1),
      });
      store.authorities = [authority('authority-a', 'committed'), authority('authority-b', 'committed')];
      break;
    case 'authority-source-unavailable':
      store.authoritiesUnavailable = true;
      break;
    case 'authority-set-absent':
      store.authorities = undefined;
      break;
    case 'authority-set-empty':
      store.authorities = [];
      break;
    case 'authority-unverified':
      store.authorities = [authority('authority-a', 'committed'), authority('authority-b', 'committed', { verified: false })];
      break;
    case 'authority-duplicate-identity':
      store.authorities = [authority('authority-a', 'committed'), authority('authority-a', 'committed')];
      break;
    case 'authority-wrong-operation':
      store.authorities = [
        authority('authority-a', 'committed'),
        authority('authority-b', 'committed', { operationId: 'op_other' }),
      ];
      break;
    case 'authority-malformed-checkpoint':
      store.authorities = [
        authority('authority-a', 'committed'),
        authority('authority-b', 'committed', { checkpointDigest: 'digest:not-sha256' }),
      ];
      break;
    case 'compact-begin-blocked-under-plural-proof':
      // Consistent plural terminal proof; a begin attempt must remain blocked.
      store.authorities = [authority('authority-a', 'committed'), authority('authority-b', 'committed')];
      break;
    case 'unrelated-full-retirement-still-classified':
      // A different operation with an ordinary full tombstone must still classify normally.
      store.record = undefined;
      store.authorities = undefined;
      store.otherRecord = {
        operationId: otherOperationId,
        status: 'retired',
        permitId: otherPermit.id,
        approvalId: otherPermit.approvalId,
        outcome: 'committed',
        receiptDigest: committedDigest,
        terminalRevision,
      };
      break;
  }
}

// ---------------------------------------------------------------------------
// Shared validation of the plural authority evidence contract.
// ---------------------------------------------------------------------------
const isCompactRecord = (record: CompactRecord | FullRetirement | undefined): record is CompactRecord =>
  record !== undefined && record.status === 'retirement_compacted';
const isFullRetirement = (record: CompactRecord | FullRetirement | undefined): record is FullRetirement =>
  record !== undefined && record.status === 'retired';

const validDigest = (value: unknown): value is string => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);

const validCompactRecord = (record: CompactRecord): boolean =>
  record.verified === true
  && record.operationId === operationId
  && Number.isSafeInteger(record.terminalRevision) && record.terminalRevision > 0
  && validDigest(record.receiptDigest)
  && record.checkpointDigest === checkpointDigest(record.operationId, permit.id, permit.approvalId, record.outcome, record.receiptDigest, record.terminalRevision);

type Integrity = 'consistent' | 'inconsistent' | 'unavailable';

// Validate every visible authority and require exact agreement with the local compact record.
async function pluralIntegrity(store: LifecycleStore): Promise<Integrity> {
  const record = await store.readStrictRosterPolicy(operationId).catch(() => undefined);
  if (!isCompactRecord(record) || !validCompactRecord(record)) return 'inconsistent';

  let authorities: AuthorityCheckpoint[] | undefined;
  try {
    authorities = await store.readCompactRetirementCheckpointAuthorities(operationId);
  } catch {
    return 'unavailable';
  }
  if (authorities === undefined) return 'unavailable';
  if (!Array.isArray(authorities) || authorities.length === 0) return 'inconsistent';

  const seen = new Set<string>();
  const allowedKeys = new Set(['authorityId', 'operationId', 'outcome', 'receiptDigest', 'terminalRevision', 'checkpointDigest', 'verified']);
  for (const candidate of authorities) {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return 'inconsistent';
    if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) return 'inconsistent';
    if (
      typeof candidate.authorityId !== 'string' || !/^[A-Za-z0-9:_-]{3,80}$/.test(candidate.authorityId) ||
      candidate.operationId !== operationId || candidate.verified !== true ||
      (candidate.outcome !== 'committed' && candidate.outcome !== 'failed') ||
      !Number.isSafeInteger(candidate.terminalRevision) || candidate.terminalRevision <= 0 ||
      !validDigest(candidate.receiptDigest) || !validDigest(candidate.checkpointDigest)
    ) return 'inconsistent';
    // Authority checkpoint must be self-consistent (digest binds its own fields).
    if (candidate.checkpointDigest !== checkpointDigest(candidate.operationId, permit.id, permit.approvalId, candidate.outcome, candidate.receiptDigest, candidate.terminalRevision)) return 'inconsistent';
    if (seen.has(candidate.authorityId)) return 'inconsistent';
    seen.add(candidate.authorityId);
    // Every authority must agree with the local compact record exactly.
    if (
      candidate.outcome !== record.outcome ||
      candidate.receiptDigest !== record.receiptDigest ||
      candidate.terminalRevision !== record.terminalRevision ||
      candidate.checkpointDigest !== record.checkpointDigest
    ) return 'inconsistent';
  }
  return 'consistent';
}

function classifyTerminal(record: CompactRecord): ApiResult {
  return { status: 'retired', reason: record.outcome === 'committed' ? 'effect_committed' : 'effect_failed', retryable: false };
}

// ---------------------------------------------------------------------------
// Arm: single-checkpoint-control — trusts the locally selected compact record and
// models the current single-authority failure (false terminal certainty).
// ---------------------------------------------------------------------------
async function control(id: ScenarioId, store: LifecycleStore): Promise<ApiResult> {
  if (id === 'unrelated-full-retirement-still-classified') {
    const record = await store.readStrictRosterPolicy(otherOperationId).catch(() => undefined);
    if (!isFullRetirement(record)) return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
    return { status: 'retired', reason: record.outcome === 'committed' ? 'effect_committed' : 'effect_failed', retryable: false };
  }
  const record = await store.readStrictRosterPolicy(operationId).catch(() => undefined);
  if (!isCompactRecord(record) || !validCompactRecord(record)) {
    return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
  }
  // Reads only the one local lifecycle record: never consults independent authorities,
  // so equivocation, conflict, and hidden rollback are all reported as terminal certainty.
  return classifyTerminal(record);
}

// ---------------------------------------------------------------------------
// Arm: multi-authority-fixture — deterministic plural validation and exact agreement.
// ---------------------------------------------------------------------------
async function fixture(id: ScenarioId, store: LifecycleStore): Promise<ApiResult> {
  if (id === 'unrelated-full-retirement-still-classified') {
    const record = await store.readStrictRosterPolicy(otherOperationId).catch(() => undefined);
    if (!isFullRetirement(record)) return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
    return { status: 'retired', reason: record.outcome === 'committed' ? 'effect_committed' : 'effect_failed', retryable: false };
  }
  const integrity = await pluralIntegrity(store);
  if (integrity === 'unavailable') return { status: 'indeterminate', reason: 'policy_unavailable', retryable: false };
  if (integrity === 'inconsistent') return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
  // begin under consistent plural terminal proof must stay blocked; resolve reports terminal.
  if (id === 'compact-begin-blocked-under-plural-proof') return { status: 'blocked', reason: 'policy_lifecycle_inconsistent', retryable: false };
  const record = await store.readStrictRosterPolicy(operationId) as CompactRecord;
  return classifyTerminal(record);
}

// ---------------------------------------------------------------------------
// Arm: aegis-wrapped — invokes the built real hook public API only. Missing plural
// API is measured red; single-record resolvers must not be treated as the plural check.
// ---------------------------------------------------------------------------
interface Runtime {
  readDurableStrictRosterPolicyLifecycle?: (op: string, store: any) => Promise<any>;
  resolveCompactedDurableStrictRosterPolicyExecutionEffect?: (p: Permit, op: string, store: any) => Promise<ApiResult>;
  beginCompactedDurableStrictRosterPolicyExecutionEffect?: (p: Permit, op: string, store: any) => Promise<ApiResult>;
  resolveMultiAuthorityCompactedDurableStrictRosterPolicyExecutionEffect?: (p: Permit, op: string, store: any) => Promise<ApiResult>;
  beginMultiAuthorityCompactedDurableStrictRosterPolicyExecutionEffect?: (p: Permit, op: string, store: any) => Promise<ApiResult>;
}

async function loadRuntime(): Promise<Runtime> {
  await import(moduleUrl(AEGIS_DIST));
  const hook: any = await import(moduleUrl(HOOK));
  return {
    readDurableStrictRosterPolicyLifecycle: hook.readDurableStrictRosterPolicyLifecycle,
    resolveCompactedDurableStrictRosterPolicyExecutionEffect: hook.resolveCompactedDurableStrictRosterPolicyExecutionEffect,
    beginCompactedDurableStrictRosterPolicyExecutionEffect: hook.beginCompactedDurableStrictRosterPolicyExecutionEffect,
    resolveMultiAuthorityCompactedDurableStrictRosterPolicyExecutionEffect: hook.resolveMultiAuthorityCompactedDurableStrictRosterPolicyExecutionEffect,
    beginMultiAuthorityCompactedDurableStrictRosterPolicyExecutionEffect: hook.beginMultiAuthorityCompactedDurableStrictRosterPolicyExecutionEffect,
  };
}

async function aegis(id: ScenarioId, store: LifecycleStore, runtime: Runtime): Promise<{ result: ApiResult; api: boolean }> {
  // The plural check exists only if the dedicated multi-authority resolver is present.
  // An ordinary single-record resolver cannot bypass the check and does not count as the API.
  const pluralResolver = runtime.resolveMultiAuthorityCompactedDurableStrictRosterPolicyExecutionEffect;
  const beginResolver = runtime.beginMultiAuthorityCompactedDurableStrictRosterPolicyExecutionEffect;
  const api = typeof pluralResolver === 'function' && typeof beginResolver === 'function';

  if (id === 'unrelated-full-retirement-still-classified') {
    // Operation isolation may be answered by any resolver present; missing all resolvers is red.
    const resolver = pluralResolver ?? runtime.resolveCompactedDurableStrictRosterPolicyExecutionEffect;
    if (typeof resolver !== 'function') {
      return { api, result: { status: 'indeterminate', reason: 'compact_retirement_checkpoint_api_unavailable', retryable: true } };
    }
    return { api, result: await resolver(otherPermit, otherOperationId, store) };
  }

  if (!api) {
    // Honestly measure the current-harness shortfall: with no plural evidence contract, the
    // ordinary single-record resolver (if any) reads one lifecycle record and reports false
    // terminal certainty on equivocation; absence of any resolver is also red.
    const resolver = runtime.resolveCompactedDurableStrictRosterPolicyExecutionEffect;
    if (typeof resolver === 'function') {
      const result = id === 'compact-begin-blocked-under-plural-proof'
        ? (await runtime.beginCompactedDurableStrictRosterPolicyExecutionEffect!(permit, operationId, store))
        : await resolver(permit, operationId, store);
      return { api, result };
    }
    return { api, result: { status: 'indeterminate', reason: 'compact_retirement_checkpoint_api_unavailable', retryable: true } };
  }

  const result = id === 'compact-begin-blocked-under-plural-proof'
    ? await beginResolver!(permit, operationId, store)
    : await pluralResolver!(permit, operationId, store);
  return { api, result };
}

async function runScenario(arm: Arm, id: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const store = new LifecycleStore();
  configure(store, id);
  let result: ApiResult;
  let apiAvailable = true;
  if (arm === 'single-checkpoint-control') result = await control(id, store);
  else if (arm === 'multi-authority-fixture') result = await fixture(id, store);
  else ({ result, api: apiAvailable } = await aegis(id, store, runtime));

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
    equivocationDetected: equivocation.has(id) && correct,
    // False terminal certainty: an equivocation/conflict/rollback scenario that was reported
    // as a terminal outcome instead of being blocked.
    falseTerminalCertainty: equivocation.has(id) && actual.status === 'retired',
    apiAvailable,
  };
}

// ---------------------------------------------------------------------------
// Trace + scoring.
// ---------------------------------------------------------------------------
const runtime = await loadRuntime();
const runId = `crce-${Date.now().toString(36)}`;
const runDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runDir, { recursive: true });
const tracePath = join(runDir, `${runId}.jsonl`);
const trace = new TraceWriter(tracePath, { runId, experiment: '49-compact-retirement-checkpoint-equivocation' });
const bus = new MessageBus({ trace });
const stub = new StubRuntime();
const results = new Map<Arm, ScenarioResult[]>();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    evidenceVersion: 1,
    experiment: '49-compact-retirement-checkpoint-equivocation',
    spec: '55-compact-retirement-checkpoint-equivocation',
    runId,
    timestamp: new Date().toISOString(),
    seed: SEED,
    scenarios,
    arms,
    aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), buildId: AEGIS_BUILD_ID || undefined, mode: 'built-artifact+real-hook-public-api' },
  },
});

for (const arm of arms) {
  const agent = await spawnAgent({ id: `crce:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace });
  const rows: ScenarioResult[] = [];
  for (const id of scenarios) {
    const value = await runScenario(arm, id, runtime);
    rows.push(value);
    bus.publish({ from: agent.id, to: 'moderator', topic: 'scenario', body: { arm, ...value } });
  }
  results.set(arm, rows);
  await agent.kill();
  bus.removeAgent(agent.id);
}

const row = (rows: ScenarioResult[], id: ScenarioId) => rows.find((value) => value.scenarioId === id)!;
const metrics = (arm: Arm) => {
  const rows = results.get(arm)!;
  const equivocationRows = rows.filter((value) => equivocation.has(value.scenarioId));
  const ids = (...idsToCheck: ScenarioId[]) => idsToCheck.every((id) => row(rows, id).correct) ? 1 : 0;
  return {
    lifecycleCheckpointEquivocationDetectionRate: equivocationRows.filter((value) => value.equivocationDetected).length / equivocationRows.length,
    equivocationFalseTerminalCertaintyRate: equivocationRows.filter((value) => value.falseTerminalCertainty).length / equivocationRows.length,
    resolutionAccuracy: rows.filter((value) => value.correct).length / rows.length,
    multiAuthorityLifecycleCheckpointApiAvailability: rows.every((value) => value.apiAvailable) ? 1 : 0,
    singleCommittedPreservation: ids('single-checkpoint-committed-exact'),
    pluralCommittedPreservation: ids('plural-committed-agreement'),
    failedPreservation: ids('plural-failed-agreement'),
    orderIndependence: ids('authority-order-independence'),
    outcomeConflictSafety: ids('outcome-equivocation'),
    receiptDigestConflictSafety: ids('receipt-digest-equivocation'),
    terminalRevisionConflictSafety: ids('terminal-revision-equivocation'),
    checkpointDigestConflictSafety: ids('checkpoint-digest-equivocation'),
    localRollbackConflictSafety: ids('local-versus-authority-conflict', 'restored-old-local-hidden-by-authority'),
    unavailableSafety: ids('authority-source-unavailable'),
    absentSafety: ids('authority-set-absent'),
    emptySafety: ids('authority-set-empty'),
    unverifiedSafety: ids('authority-unverified'),
    duplicateSafety: ids('authority-duplicate-identity'),
    wrongOperationSafety: ids('authority-wrong-operation'),
    malformedSafety: ids('authority-malformed-checkpoint'),
    beginSafety: ids('compact-begin-blocked-under-plural-proof'),
    operationIsolation: ids('unrelated-full-retirement-still-classified'),
  };
};

for (const arm of arms) {
  const values = metrics(arm);
  trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(values).map(([key, value]) => [arm.replaceAll('-', '_') + '_' + key, value])) });
  console.log(arm, values);
}

const green = (metricValues: ReturnType<typeof metrics>) =>
  metricValues.lifecycleCheckpointEquivocationDetectionRate === 1 &&
  metricValues.equivocationFalseTerminalCertaintyRate === 0 &&
  Object.entries(metricValues).filter(([key]) => key !== 'equivocationFalseTerminalCertaintyRate').every(([, value]) => value === 1);

const scorer: Scorer = {
  score() {
    const fixtureValues = metrics('multi-authority-fixture');
    const aegisValues = metrics('aegis-wrapped');
    if (!green(fixtureValues)) throw new Error(`multi-authority-fixture must be green: ${JSON.stringify(fixtureValues)}`);
    return {
      fixtureGreen: 1,
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
