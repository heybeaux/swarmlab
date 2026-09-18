import { execFileSync } from 'node:child_process';
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

const SEED = 'checkpoint-authority-equivocation-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-09-17-exp42';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const HOOK = process.env['AEGIS_HOOK_DIST'] ?? `${AEGIS_REPO}/packages/aegis-hook/dist/index.js`;
const sha = (repo: string) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

type Permit = { id: string; approvalId: string };
type Receipt = { permitId: string; approvalId: string; operationId: string; receiptDigest: string; verified: boolean };
type Effect = { operationId: string; permit: any; state: string; claimed: boolean; successReceipt?: Receipt; revision?: number };
type Proof = { operationId: string; permitId: string; approvalId: string; outcome: string; receiptDigest: string; revision: number; verified: boolean };
type Checkpoint = { operationId: string; revision: number; verified: boolean };
type AuthorityCheckpoint = { authorityId: string; operationId: string; revision: number; verified: boolean; historyDigest: string };
type ApiResult = { status: import('./types.js').OutcomeStatus; reason?: string; retryable?: boolean };

const operationId = 'op_checkpoint_authority_equivocation';
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
    observedAt: '2026-09-18T06:00:00Z',
    artifactDigest: 'sha256:pkg',
    verificationDigest: 'sha256:tests',
    targetDigest: 'registry:prod:v1',
  },
  approvalProvenance: {
    actorId: 'agent:child-a',
    sessionId: 'session:a',
    workspaceId: 'workspace:aegis',
    taskIntentId: 'intent:publish',
    authorizationDigest: 'auth:epoch-12',
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

const digest = (label: string) => `sha256:${label.padEnd(64, label[0] ?? 'a').slice(0, 64)}`;
const currentDigest = digest('c');
const oldDigest = digest('a');
const forkDigest = digest('b');

class Store {
  records = new Map<string, any>();
  effects = new Map<string, Effect>();
  highWater: number | undefined = 1;
  proof: Proof | undefined;
  checkpoint: Checkpoint | undefined = { operationId, revision: 1, verified: true };
  authorityCheckpoints: AuthorityCheckpoint[] | undefined = [
    { authorityId: 'witness-a', operationId, revision: 1, verified: true, historyDigest: oldDigest },
    { authorityId: 'witness-b', operationId, revision: 1, verified: true, historyDigest: oldDigest },
  ];
  quorumCapable = true;
  quorumUnavailable = false;
  revisionUnavailable = false;
  postCasEquivocation = false;

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
    if (this.postCasEquivocation) {
      this.authorityCheckpoints = [
        { authorityId: 'witness-a', operationId, revision: 2, verified: true, historyDigest: currentDigest },
        { authorityId: 'witness-b', operationId, revision: 2, verified: true, historyDigest: forkDigest },
      ];
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
    if (this.quorumUnavailable) throw new Error('checkpoint quorum down');
    return this.authorityCheckpoints === undefined ? undefined : structuredClone(this.authorityCheckpoints);
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
    authorizationDigest: 'auth:epoch-12',
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
  'single-anchor-current-authorized',
  'multi-consistent-current-authorized',
  'multi-lagging-current-success',
  'multi-consistent-compacted-success',
  'equivocated-authorized-same-revision',
  'equivocated-started-same-revision',
  'equivocated-terminal-same-revision',
  'equivocated-rollback-hidden-by-first',
  'quorum-unavailable',
  'quorum-absent',
  'quorum-unverified',
  'quorum-duplicate-authority',
  'quorum-wrong-operation',
  'quorum-malformed-digest',
  'post-cas-equivocation',
];
const arms: Arm[] = ['host-single-checkpoint-control', 'multi-authority-fixture', 'aegis-wrapped'];
const equivocated = new Set<ScenarioId>([
  'equivocated-authorized-same-revision',
  'equivocated-started-same-revision',
  'equivocated-terminal-same-revision',
  'equivocated-rollback-hidden-by-first',
  'post-cas-equivocation',
]);

function expected(id: ScenarioId): ExpectedOutcome {
  if (id === 'legacy-current-authorized' || id === 'single-anchor-current-authorized' || id === 'multi-consistent-current-authorized') {
    return { status: 'not_executed', reason: 'not_started', retryable: true };
  }
  if (id === 'multi-lagging-current-success' || id === 'multi-consistent-compacted-success') {
    return { status: 'executed', reason: 'effect_committed', retryable: false };
  }
  if (id === 'post-cas-equivocation') return { status: 'blocked', reason: 'journal_inconsistent', retryable: false };
  if (equivocated.has(id)) return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
  if (id === 'quorum-unavailable' || id === 'quorum-absent') {
    return { status: 'indeterminate', reason: 'journal_unavailable', retryable: false };
  }
  return { status: 'indeterminate', reason: 'journal_inconsistent', retryable: false };
}

function currentReceipt(permit: Permit): Receipt {
  return { permitId: permit.id, approvalId: permit.approvalId, operationId, receiptDigest: digest('d'), verified: true };
}

function currentProof(permit: Permit): Proof {
  return {
    operationId,
    permitId: permit.id,
    approvalId: permit.approvalId,
    outcome: 'committed',
    receiptDigest: digest('d'),
    revision: 3,
    verified: true,
  };
}

function configure(store: Store, permit: Permit, id: ScenarioId) {
  const base = store.effects.get(operationId)!;
  store.highWater = 1;
  store.proof = undefined;
  store.checkpoint = { operationId, revision: 1, verified: true };
  store.authorityCheckpoints = [
    { authorityId: 'witness-a', operationId, revision: 1, verified: true, historyDigest: oldDigest },
    { authorityId: 'witness-b', operationId, revision: 1, verified: true, historyDigest: oldDigest },
  ];
  store.quorumCapable = !['legacy-current-authorized', 'single-anchor-current-authorized'].includes(id);
  store.quorumUnavailable = false;
  store.revisionUnavailable = false;
  store.postCasEquivocation = false;
  store.effects.set(operationId, { ...base, state: 'authorized', claimed: true, revision: 1 });

  if (id === 'legacy-current-authorized') {
    store.checkpoint = undefined;
    store.authorityCheckpoints = undefined;
  } else if (id === 'multi-lagging-current-success') {
    store.effects.set(operationId, { ...base, state: 'committed', claimed: true, revision: 3, successReceipt: currentReceipt(permit) });
    store.highWater = 3;
    store.checkpoint = { operationId, revision: 2, verified: true };
    store.authorityCheckpoints = [
      { authorityId: 'witness-a', operationId, revision: 2, verified: true, historyDigest: oldDigest },
      { authorityId: 'witness-b', operationId, revision: 3, verified: true, historyDigest: currentDigest },
    ];
  } else if (id === 'multi-consistent-compacted-success') {
    store.effects.delete(operationId);
    store.highWater = 3;
    store.proof = currentProof(permit);
    store.checkpoint = { operationId, revision: 3, verified: true };
    store.authorityCheckpoints = [
      { authorityId: 'witness-a', operationId, revision: 3, verified: true, historyDigest: currentDigest },
      { authorityId: 'witness-b', operationId, revision: 3, verified: true, historyDigest: currentDigest },
    ];
  } else if (equivocated.has(id)) {
    store.authorityCheckpoints = [
      { authorityId: 'witness-a', operationId, revision: 1, verified: true, historyDigest: oldDigest },
      { authorityId: 'witness-b', operationId, revision: 1, verified: true, historyDigest: forkDigest },
    ];
    if (id === 'equivocated-started-same-revision') store.effects.set(operationId, { ...base, state: 'started', claimed: true, revision: 1 });
    if (id === 'equivocated-terminal-same-revision') {
      store.effects.set(operationId, { ...base, state: 'committed', claimed: true, revision: 1, successReceipt: currentReceipt(permit) });
    }
    if (id === 'post-cas-equivocation') {
      store.postCasEquivocation = true;
      store.authorityCheckpoints = [
        { authorityId: 'witness-a', operationId, revision: 1, verified: true, historyDigest: oldDigest },
        { authorityId: 'witness-b', operationId, revision: 1, verified: true, historyDigest: oldDigest },
      ];
    }
  } else if (id === 'quorum-unavailable') store.quorumUnavailable = true;
  else if (id === 'quorum-absent') store.authorityCheckpoints = undefined;
  else if (id === 'quorum-unverified') store.authorityCheckpoints = [{ authorityId: 'witness-a', operationId, revision: 1, verified: false, historyDigest: oldDigest }];
  else if (id === 'quorum-duplicate-authority') {
    store.authorityCheckpoints = [
      { authorityId: 'witness-a', operationId, revision: 1, verified: true, historyDigest: oldDigest },
      { authorityId: 'witness-a', operationId, revision: 1, verified: true, historyDigest: oldDigest },
    ];
  } else if (id === 'quorum-wrong-operation') {
    store.authorityCheckpoints = [{ authorityId: 'witness-a', operationId: 'op_other', revision: 1, verified: true, historyDigest: oldDigest }];
  } else if (id === 'quorum-malformed-digest') {
    store.authorityCheckpoints = [{ authorityId: 'witness-a', operationId, revision: 1, verified: true, historyDigest: 'digest:not-sha256' }];
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

async function multiAuthorityIntegrity(store: Store): Promise<'current' | 'inconsistent' | 'unavailable'> {
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
      typeof candidate.authorityId !== 'string' || !/^[A-Za-z0-9:_-]{3,80}$/.test(candidate.authorityId) ||
      candidate.operationId !== operationId || candidate.verified !== true ||
      !Number.isSafeInteger(candidate.revision) || candidate.revision! <= 0 ||
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

async function fixture(store: Store, postCas: boolean): Promise<ApiResult> {
  if (!store.quorumCapable) return classify(await store.readEffect(operationId), store.proof);
  const integrity = await multiAuthorityIntegrity(store);
  if (integrity === 'unavailable') return { status: postCas ? 'blocked' : 'indeterminate', reason: 'journal_unavailable', retryable: false };
  if (integrity === 'inconsistent') return { status: postCas ? 'blocked' : 'indeterminate', reason: 'journal_inconsistent', retryable: false };
  if (postCas) {
    await store.beginEffect(operationId);
    const after = await multiAuthorityIntegrity(store);
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
      if (property === 'readEffectRevisionCheckpoints' && !target.quorumCapable) return undefined;
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function runScenario(arm: Arm, id: ScenarioId, runtime: Runtime): Promise<ScenarioResult> {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-exp42-'));
  const store = new Store();
  try {
    const { permit, current, ask, consume } = await setup(runtime, dir, store);
    configure(store, permit, id);
    const postCas = id === 'post-cas-equivocation';
    let result: ApiResult;
    let apiAvailable = true;
    if (arm === 'host-single-checkpoint-control') result = await control(store, postCas);
    else if (arm === 'multi-authority-fixture') result = await fixture(store, postCas);
    else {
      const view = viewForAegis(store, id);
      apiAvailable = id === 'legacy-current-authorized' || typeof (view as any).readEffectRevisionCheckpoints === 'function';
      result = postCas
        ? await runtime.beginExecutionEffect(permit, current, operationId, view)
        : await (runtime.resolveAnchoredExecutionEffect ?? runtime.resolveExecutionEffect)(permit, current, operationId, view);
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
      checkpointEquivocationDetected: equivocated.has(id) && correct,
      equivocationRetryAuthority: equivocated.has(id) && (actual.retryable || actual.status === 'execute'),
      apiAvailable,
      askCovered: ask,
      consumeCovered: consume,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const runtime = await loadRuntime();
const runId = `cae-${Date.now().toString(36)}`;
const runDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runDir, { recursive: true });
const tracePath = join(runDir, `${runId}.jsonl`);
const trace = new TraceWriter(tracePath, { runId, experiment: '42-checkpoint-authority-equivocation' });
const bus = new MessageBus({ trace });
const stub = new StubRuntime();
const results = new Map<Arm, ScenarioResult[]>();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    evidenceVersion: 1,
    experiment: '42-checkpoint-authority-equivocation',
    spec: '48-checkpoint-authority-equivocation',
    runId,
    timestamp: new Date().toISOString(),
    seed: SEED,
    scenarios,
    arms,
    aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'built-artifact+real-hook-public-api' },
  },
});

for (const arm of arms) {
  const agent = await spawnAgent({ id: `cae:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace });
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
  const equivocationRows = rows.filter((result) => equivocated.has(result.scenarioId));
  const ids = (...idsToCheck: ScenarioId[]) => idsToCheck.every((id) => row(rows, id).correct) ? 1 : 0;
  return {
    checkpointEquivocationDetectionRate: equivocationRows.filter((result) => result.checkpointEquivocationDetected).length / equivocationRows.length,
    equivocationRetryAuthorityRate: equivocationRows.filter((result) => result.equivocationRetryAuthority).length / equivocationRows.length,
    resolutionAccuracy: rows.filter((result) => result.correct).length / rows.length,
    multiAuthorityCheckpointApiAvailability: rows.every((result) => result.apiAvailable) ? 1 : 0,
    legacyPreservation: ids('legacy-current-authorized'),
    singleAnchorPreservation: ids('single-anchor-current-authorized'),
    multiConsistentPreservation: ids('multi-consistent-current-authorized'),
    terminalPreservation: ids('multi-lagging-current-success'),
    compactedTerminalPreservation: ids('multi-consistent-compacted-success'),
    unavailableQuorumSafety: ids('quorum-unavailable'),
    absentQuorumSafety: ids('quorum-absent'),
    invalidQuorumSafety: ids('quorum-unverified', 'quorum-duplicate-authority', 'quorum-wrong-operation', 'quorum-malformed-digest'),
    postCasEquivocationSafety: ids('post-cas-equivocation'),
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
  metricValues.checkpointEquivocationDetectionRate === 1 &&
  metricValues.equivocationRetryAuthorityRate === 0 &&
  Object.entries(metricValues).filter(([key]) => key !== 'equivocationRetryAuthorityRate').every(([, value]) => value === 1);

const scorer: Scorer = {
  score() {
    const fixtureValues = metrics('multi-authority-fixture');
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
