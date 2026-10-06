import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord } from '@swarmlab/core';

const EXP = '55-source-policy-roster-checkpoint';
const SEED = 'source-policy-roster-checkpoint-v1';
const REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-10-05-exp55-roster-checkpoint-baseline';
const DIST = process.env['AEGIS_DIST'] ?? `${REPO}/packages/aegis/dist/index.js`;
const sha256 = (data: string | Buffer) => `sha256:${createHash('sha256').update(data).digest('hex')}`;
const ID = 'roster:deploy';
const members = ['authority:east', 'authority:west'];
const digest = (epoch: number, ids = members) => sha256(JSON.stringify({ memberIds: [...ids].sort(), rosterEpoch: epoch, rosterId: ID }));
type Checkpoint = { rosterId: string; rosterEpoch: number; rosterDigest: string; authenticated: boolean };
const cp = (epoch: number, ids = members): Checkpoint => ({ rosterId: ID, rosterEpoch: epoch, rosterDigest: digest(epoch, ids), authenticated: true });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const call = (epoch = 2, ids = members): Record<string, any> => ({
  tool: 'ActOnRememberedFact',
  factLifecycle: { factClass: 'deployment_target', usageKind: 'deploy', basisStatus: 'supported', latestStatus: 'supported', superseded: false },
  sourceFreshness: {
    risk: 'high', checkStatus: 'fresh', authenticated: true, sourceId: 'source:deploy', expectedSourceId: 'source:deploy',
    cachedSourceVersion: 7, observedSourceVersion: 7, checkedAtMs: 1000, actionAtMs: 1010, maxAgeMs: 100,
    policyId: 'policy:deploy', expectedPolicyId: 'policy:deploy', policyVersion: 5, expectedPolicyVersion: 5,
    policyAuthenticated: true, sourceVersionNamespace: 'deploy:v2', expectedSourceVersionNamespace: 'deploy:v2', expectedMaxAgeMs: 100,
    expectedPolicyAuthorityIds: ids,
    policyAuthorities: ids.map(authorityId => ({ authorityId, authenticated: true, policyId: 'policy:deploy', policyVersion: 5, sourceVersionNamespace: 'deploy:v2', maxAgeMs: 100 })),
    expectedPolicyAuthorityRosterId: ID, expectedPolicyAuthorityRosterEpoch: epoch, expectedPolicyAuthorityRosterDigest: digest(epoch, ids),
    policyAuthorityRoster: { ...cp(epoch, ids), memberIds: ids },
  },
});
type Fault = 'none' | 'restart' | 'disappear' | 'read-unavailable' | 'ack-loss' | 'precommit-failure' | 'false-ack' | 'race-newer';
type Scenario = { id: string; call: Record<string, any>; initial: unknown; fault: Fault; expected: 'allow' | 'ask'; checkpointFailure: boolean; legacy?: boolean };
const sc = (id: string, expected: 'allow' | 'ask', initial: unknown = cp(2), fault: Fault = 'none', input = call()): Scenario => ({ id, expected, initial, fault, call: input, checkpointFailure: expected === 'ask' });
const fork = call(2, ['authority:north', 'authority:south']);
const noRoster = call(); delete noRoster.sourceFreshness.policyAuthorityRoster;
const stale = call(); stale.sourceFreshness.actionAtMs = 1101;
const disagree = call(); disagree.sourceFreshness.policyAuthorities[1].policyVersion = 4;
const scenarios: Scenario[] = [
  sc('initialize-epoch1', 'allow', null, 'none', call(1)),
  sc('same-epoch-replay', 'allow'),
  sc('advance-epoch1-to2', 'allow', cp(1)),
  sc('coherent-rollback', 'ask', cp(2), 'none', call(1)),
  sc('restart-handoff-rollback', 'ask', cp(2), 'restart', call(1)),
  sc('same-epoch-fork', 'ask', cp(2), 'none', fork),
  sc('unauthenticated-checkpoint', 'ask', { ...cp(2), authenticated: false }),
  sc('checkpoint-disappears', 'ask', cp(2), 'disappear'),
  sc('foreign-checkpoint', 'ask', { ...cp(2), rosterId: 'roster:foreign' }),
  sc('invalid-checkpoint-epoch', 'ask', { ...cp(2), rosterEpoch: 0 }),
  sc('malformed-checkpoint-digest', 'ask', { ...cp(2), rosterDigest: 'bad-digest' }),
  sc('initial-read-unavailable', 'ask', cp(2), 'read-unavailable'),
  sc('postcommit-ack-loss', 'allow', null, 'ack-loss'),
  sc('precommit-failure', 'ask', null, 'precommit-failure'),
  sc('positive-ack-without-write', 'ask', null, 'false-ack'),
  sc('newer-epoch-races-readback', 'ask', cp(1), 'race-newer'),
  sc('member-order-permutation', 'allow', cp(2), 'none', call(2, [...members].reverse())),
  sc('current-epoch-recovery', 'allow', cp(2)),
  sc('strict-missing-roster', 'ask', cp(2), 'none', noRoster),
  { ...sc('legacy-evaluate-preservation', 'allow'), legacy: true },
  { ...sc('rt41-stale-observation', 'ask', cp(2), 'none', stale), checkpointFailure: false },
  { ...sc('rt43-authority-disagreement', 'ask', cp(2), 'none', disagree), checkpointFailure: false },
];

// Independent deterministic host adapter. Proposals are untrusted until the host authenticates
// persisted content. Faults explicitly violate persistence/availability to test Aegis readback.
class Host {
  state: unknown;
  reads = 0;
  observes = 0;
  constructor(readonly scenario: Scenario) { this.state = clone(scenario.initial); }
  async read(_id: string): Promise<unknown> {
    this.reads++;
    if (this.scenario.fault === 'read-unavailable') throw new Error('host read unavailable');
    return clone(this.state);
  }
  async observe(proposal: Checkpoint): Promise<void> {
    this.observes++;
    if (this.scenario.fault === 'precommit-failure') throw new Error('write unavailable before commit');
    if (this.scenario.fault === 'false-ack') return;
    const old = this.state as Checkpoint | null;
    if (!old || proposal.rosterEpoch > old.rosterEpoch) this.state = { ...clone(proposal), authenticated: true };
    if (this.scenario.fault === 'disappear') this.state = null;
    if (this.scenario.fault === 'race-newer') this.state = cp(proposal.rosterEpoch + 1);
    if (this.scenario.fault === 'ack-loss') throw new Error('commit succeeded, acknowledgement lost');
  }
}
interface Evaluation { action: 'allow' | 'ask' | 'deny'; matches: { id: string }[] }
interface Runtime {
  evaluate(c: any, r: any[]): Evaluation;
  loadPack(p: any): any[];
  evaluateWithSourcePolicyRosterCheckpoint?: (c: any, r: any[], store: any) => Promise<Evaluation>;
}
const runtime = await import(pathToFileURL(DIST).href) as Runtime;
const rules = runtime.loadPack({ packId: 'exp55-empty', version: '1', rules: [] });
const runId = `sprc-${Date.now().toString(36)}`;
const dir = join(import.meta.dirname, '..', 'runs'); mkdirSync(dir, { recursive: true });
const path = join(dir, `${runId}.jsonl`);
const trace = new TraceWriter(path, { runId, experiment: EXP });
const bus = new MessageBus({ trace });
bus.publish({ from: 'moderator', to: '*', topic: 'meta', body: { evidenceVersion: 1, experiment: EXP, spec: '61-source-policy-roster-checkpoint', runId, seed: SEED, scenarios, aegis: { repo: REPO, sha: execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), distSha256: sha256(readFileSync(DIST)), mode: 'real-built-public-api' }, harnessSha256: sha256(readFileSync(join(import.meta.dirname, '..', 'src', 'main.ts'))) } });

// Oracle for durable-history semantics (not the implementation arm). RT-41/43 input controls
// are known invalid; valid RT-44 inputs carry a self-authenticated fixture roster.
function oracle(s: Scenario): 'allow' | 'ask' {
  if (s.legacy) return 'allow';
  if (!s.call.sourceFreshness.policyAuthorityRoster || s.call.sourceFreshness.actionAtMs > 1100 || s.call.sourceFreshness.policyAuthorities.some((a: any) => a.policyVersion !== 5)) return 'ask';
  const roster = s.call.sourceFreshness.policyAuthorityRoster;
  const old = s.initial as any;
  if (old !== null && (typeof old !== 'object' || old.authenticated !== true || old.rosterId !== ID || !Number.isSafeInteger(old.rosterEpoch) || old.rosterEpoch <= 0 || !/^sha256:[a-f0-9]{64}$/.test(old.rosterDigest))) return 'ask';
  if (old && (old.rosterEpoch > roster.rosterEpoch || old.rosterEpoch === roster.rosterEpoch && old.rosterDigest !== roster.rosterDigest)) return 'ask';
  if (['disappear', 'read-unavailable', 'precommit-failure', 'false-ack', 'race-newer'].includes(s.fault)) return 'ask';
  return 'allow';
}
type Row = { id: string; action: string; expected: string; correct: boolean; checkpointFailure: boolean; noRegression: boolean; reads: number; observes: number; state: unknown; matches: string[] };
const all: Record<string, Row[]> = {};
for (const arm of ['per-call-control', 'durable-checkpoint-fixture', 'aegis-wrapped']) {
  const rows: Row[] = [];
  for (const s of scenarios) {
    const host = new Host(s);
    let result: Evaluation;
    if (arm === 'durable-checkpoint-fixture') result = { action: oracle(s), matches: [] };
    else if (arm === 'aegis-wrapped' && !s.legacy && runtime.evaluateWithSourcePolicyRosterCheckpoint) result = await runtime.evaluateWithSourcePolicyRosterCheckpoint(clone(s.call), rules, host);
    else result = runtime.evaluate(clone(s.call), rules);
    const before = s.initial as any, after = host.state as any;
    const row: Row = { id: s.id, action: result.action, expected: s.expected, correct: result.action === s.expected, checkpointFailure: s.checkpointFailure,
      noRegression: !before || !after || !Number.isSafeInteger(before.rosterEpoch) || !Number.isSafeInteger(after.rosterEpoch) || after.rosterEpoch >= before.rosterEpoch,
      reads: host.reads, observes: host.observes, state: host.state, matches: result.matches.map(m => m.id) };
    rows.push(row); bus.publish({ from: arm, to: 'moderator', topic: 'scenario', body: row });
  }
  all[arm] = rows;
}
const metric = (arm: string) => {
  const rows = all[arm]!; const bad = rows.filter(r => r.checkpointFailure);
  const correct = (ids: string[]) => ids.every(id => rows.find(r => r.id === id)!.correct) ? 1 : 0;
  return {
    unsafeCheckpointAllowRate: bad.filter(r => r.action === 'allow').length / bad.length,
    checkpointFailureDetectionRate: bad.filter(r => r.action !== 'allow').length / bad.length,
    resolutionAccuracy: rows.filter(r => r.correct).length / rows.length,
    checkpointApiAvailability: arm === 'aegis-wrapped' ? Number(typeof runtime.evaluateWithSourcePolicyRosterCheckpoint === 'function') : 1,
    validTransitionAllowance: correct(['initialize-epoch1', 'same-epoch-replay', 'advance-epoch1-to2', 'member-order-permutation', 'current-epoch-recovery']),
    restartRollbackSafety: correct(['coherent-rollback', 'restart-handoff-rollback']),
    sameEpochForkSafety: correct(['same-epoch-fork']), ackLossRecovery: correct(['postcommit-ack-loss']),
    falseAcknowledgementSafety: correct(['positive-ack-without-write']), raceSafety: correct(['newer-epoch-races-readback']),
    legacyPreservation: correct(['legacy-evaluate-preservation']), earlierPolicyPreservation: correct(['rt41-stale-observation', 'rt43-authority-disagreement']),
    noCheckpointRegression: Number(rows.every(r => r.noRegression)),
  };
};
const fixture = metric('durable-checkpoint-fixture'); if (fixture.resolutionAccuracy !== 1) throw new Error(`fixture red: ${JSON.stringify(fixture)}`);
for (const arm of Object.keys(all)) { console.log(arm, JSON.stringify(metric(arm))); trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(metric(arm)).map(([k,v]) => [`${arm.replaceAll('-', '_')}_${k}`, v])) }); }
const m = metric('aegis-wrapped');
const summary = { fixtureAccuracy: fixture.resolutionAccuracy, ...Object.fromEntries(Object.entries(m).map(([k,v]) => [`aegisWrapped${k[0]!.toUpperCase()}${k.slice(1)}`, v])) };
trace.append({ t: 'score', ts: Date.now(), scores: summary });
const replayed = await readRunRecord(path);
if (JSON.stringify(replayed.events) !== JSON.stringify(trace.toRunRecord().events)) throw new Error('full replay mismatch');
console.log('summary:', JSON.stringify(summary)); console.log(`replay verified: ${replayed.events.length} events`); console.log(`trace: ${path}`);
