import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime, type Scorer, type TraceEvent } from '@swarmlab/core';
import type { Arm, PolicyAuthorityRecord, PolicyAuthorityRoster, Scenario, ScenarioResult } from './types.js';

const SEED = 'source-freshness-policy-authority-roster-v1';
const AEGIS_REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-10-03-exp54-policy-roster-epoch-baseline';
const AEGIS_DIST = process.env['AEGIS_DIST'] ?? `${AEGIS_REPO}/packages/aegis/dist/index.js`;
const BUILD_ID = process.env['AEGIS_BUILD_ID'] ?? '';
const moduleUrl = (path: string) => { const url = pathToFileURL(path); if (BUILD_ID) url.searchParams.set('build', BUILD_ID); return url.href; };
const sha = (repo: string) => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const T = 1_800_000_000_000;

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([x], [y]) => x.localeCompare(y));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(',')}}`;
}
const digestFor = (rosterId: string, rosterEpoch: number, memberIds: readonly string[]) =>
  `sha256:${createHash('sha256').update(stable({ rosterId, rosterEpoch, memberIds: [...memberIds].sort() })).digest('hex')}`;

const scalar = { policyId: 'freshness:deploy', expectedPolicyId: 'freshness:deploy', policyVersion: 5, expectedPolicyVersion: 5, sourceVersionNamespace: 'deploy-target:v2', expectedSourceVersionNamespace: 'deploy-target:v2', expectedMaxAgeMs: 60_000, policyAuthenticated: true } as const;
const fresh = { risk: 'high', usageKind: 'deploy', sourceId: 'authority:deploy', expectedSourceId: 'authority:deploy', cachedSourceVersion: 7, observedSourceVersion: 7, checkedAtMs: T, actionAtMs: T + 1_000, maxAgeMs: 60_000, checkStatus: 'fresh', authenticated: true } as const;
const a = (authorityId: string, overrides: Partial<PolicyAuthorityRecord> = {}): PolicyAuthorityRecord => ({ authorityId, authenticated: true, policyId: scalar.policyId, policyVersion: scalar.policyVersion, sourceVersionNamespace: scalar.sourceVersionNamespace, maxAgeMs: scalar.expectedMaxAgeMs, ...overrides });

const CURRENT_ROSTER_ID = 'policy-authority-roster:deploy';
const CURRENT_EPOCH = 2;
const roster2 = ['policy-authority:east', 'policy-authority:west'] as const;
const records2 = [a(roster2[0]), a(roster2[1])] as const;
const roster3 = [...roster2, 'policy-authority:audit'] as const;
const records3 = [...records2, a(roster3[2])] as const;
const CURRENT_DIGEST_2 = digestFor(CURRENT_ROSTER_ID, CURRENT_EPOCH, roster2);
const CURRENT_DIGEST_3 = digestFor(CURRENT_ROSTER_ID, CURRENT_EPOCH, roster3);

const r = (overrides: Partial<PolicyAuthorityRoster> = {}): PolicyAuthorityRoster => ({
  rosterId: CURRENT_ROSTER_ID,
  rosterEpoch: CURRENT_EPOCH,
  rosterDigest: CURRENT_DIGEST_2,
  authenticated: true,
  memberIds: roster2,
  ...overrides,
});

const basePlural = { ...fresh, ...scalar, expectedPolicyAuthorityIds: roster2, policyAuthorities: records2 } as const;
const baseRostered = {
  ...basePlural,
  expectedPolicyAuthorityRosterId: CURRENT_ROSTER_ID,
  expectedPolicyAuthorityRosterEpoch: CURRENT_EPOCH,
  expectedPolicyAuthorityRosterDigest: CURRENT_DIGEST_2,
  policyAuthorityRoster: r(),
} as const;

const OLD_ROSTER_EPOCH = 1;
const OLD_DIGEST_2 = digestFor(CURRENT_ROSTER_ID, OLD_ROSTER_EPOCH, roster2);
const FOREIGN_ROSTER_ID = 'policy-authority-roster:mirror';
const FOREIGN_DIGEST_2 = digestFor(FOREIGN_ROSTER_ID, CURRENT_EPOCH, roster2);
const FORK_MEMBERS = ['policy-authority:north', 'policy-authority:south'] as const;
const FORK_DIGEST = digestFor(CURRENT_ROSTER_ID, CURRENT_EPOCH, FORK_MEMBERS);
const MEMBER_MISMATCH_ROSTER_ID = 'policy-authority-roster:mismatch';
const MEMBER_MISMATCH_DIGEST = digestFor(MEMBER_MISMATCH_ROSTER_ID, CURRENT_EPOCH, FORK_MEMBERS);

const scenarios: readonly Scenario[] = [
  // 1. legacy RT-43 exact consensus with no roster envelope — allow
  { id: 'legacy-rt43-no-roster', ...basePlural, rosterFailure: false, expectedAction: 'allow' },
  // 2. current authenticated two-authority roster and agreement — allow
  { id: 'current-two-authority-roster-agree', ...baseRostered, rosterFailure: false, expectedAction: 'allow' },
  // 3. current authenticated three-authority roster and agreement — allow
  {
    id: 'current-three-authority-roster-agree', ...baseRostered,
    expectedPolicyAuthorityIds: roster3, policyAuthorities: records3,
    expectedPolicyAuthorityRosterDigest: CURRENT_DIGEST_3,
    policyAuthorityRoster: r({ memberIds: roster3, rosterDigest: CURRENT_DIGEST_3 }),
    rosterFailure: false, expectedAction: 'allow',
  },
  // 4. current roster and authority order permutations — allow
  {
    id: 'current-roster-order-permutation', ...baseRostered,
    expectedPolicyAuthorityIds: [...roster2].reverse(), policyAuthorities: [...records2].reverse(),
    policyAuthorityRoster: r({ memberIds: [...roster2].reverse() }),
    rosterFailure: false, expectedAction: 'allow',
  },
  // 5. old complete roster at a rolled-back epoch, internally unanimous — ask
  {
    id: 'old-roster-rolled-back-epoch', ...baseRostered,
    policyAuthorityRoster: r({ rosterEpoch: OLD_ROSTER_EPOCH, rosterDigest: OLD_DIGEST_2 }),
    rosterFailure: true, expectedAction: 'ask',
  },
  // 6. same-epoch fork with a different complete authority set — ask
  {
    id: 'same-epoch-roster-fork', ...baseRostered,
    policyAuthorityRoster: r({ memberIds: FORK_MEMBERS, rosterDigest: FORK_DIGEST }),
    rosterFailure: true, expectedAction: 'ask',
  },
  // 7. foreign roster identity with otherwise current members — ask
  {
    id: 'foreign-roster-identity', ...baseRostered,
    policyAuthorityRoster: r({ rosterId: FOREIGN_ROSTER_ID, rosterDigest: FOREIGN_DIGEST_2 }),
    rosterFailure: true, expectedAction: 'ask',
  },
  // 8. future epoch different from the exact expected epoch — ask
  {
    id: 'future-epoch-mismatch', ...baseRostered,
    policyAuthorityRoster: r({ rosterEpoch: CURRENT_EPOCH + 1, rosterDigest: digestFor(CURRENT_ROSTER_ID, CURRENT_EPOCH + 1, roster2) }),
    rosterFailure: true, expectedAction: 'ask',
  },
  // 9. roster digest not bound to its declared members — ask
  {
    id: 'roster-digest-not-bound-to-members', ...baseRostered,
    policyAuthorityRoster: r({ rosterDigest: FORK_DIGEST }),
    rosterFailure: true, expectedAction: 'ask',
  },
  // 10. expected roster digest disagrees with the authenticated current roster — ask
  {
    id: 'expected-digest-disagrees-with-current', ...baseRostered,
    expectedPolicyAuthorityRosterDigest: FORK_DIGEST,
    rosterFailure: true, expectedAction: 'ask',
  },
  // 11. unauthenticated roster with unanimous authenticated members — ask
  {
    id: 'unauthenticated-roster', ...baseRostered,
    policyAuthorityRoster: r({ authenticated: false }),
    rosterFailure: true, expectedAction: 'ask',
  },
  // 12. missing roster when expected roster binding is configured — ask
  {
    id: 'missing-roster-when-configured', ...basePlural,
    expectedPolicyAuthorityRosterId: CURRENT_ROSTER_ID,
    expectedPolicyAuthorityRosterEpoch: CURRENT_EPOCH,
    expectedPolicyAuthorityRosterDigest: CURRENT_DIGEST_2,
    rosterFailure: true, expectedAction: 'ask',
  },
  // 13. partial expected roster envelope — ask
  {
    id: 'partial-roster-envelope', ...basePlural,
    expectedPolicyAuthorityRosterId: CURRENT_ROSTER_ID,
    expectedPolicyAuthorityRosterEpoch: CURRENT_EPOCH,
    policyAuthorityRoster: r(),
    rosterFailure: true, expectedAction: 'ask',
  },
  // 14. malformed non-object roster — ask
  {
    id: 'malformed-nonobject-roster', ...baseRostered,
    policyAuthorityRoster: roster2,
    rosterFailure: true, expectedAction: 'ask',
  },
  // 15. empty roster members — ask
  {
    id: 'empty-roster-members', ...baseRostered,
    policyAuthorityRoster: r({ memberIds: [], rosterDigest: digestFor(CURRENT_ROSTER_ID, CURRENT_EPOCH, []) }),
    rosterFailure: true, expectedAction: 'ask',
  },
  // 16. duplicate roster member — ask
  {
    id: 'duplicate-roster-member', ...baseRostered,
    policyAuthorityRoster: r({ memberIds: [roster2[0], roster2[0]], rosterDigest: digestFor(CURRENT_ROSTER_ID, CURRENT_EPOCH, [roster2[0], roster2[0]]) }),
    rosterFailure: true, expectedAction: 'ask',
  },
  // 17. whitespace-padded roster identity — ask
  {
    id: 'whitespace-padded-roster-identity', ...baseRostered,
    policyAuthorityRoster: r({ rosterId: ` ${CURRENT_ROSTER_ID}` }),
    rosterFailure: true, expectedAction: 'ask',
  },
  // 18. unsafe/non-positive roster epoch — ask
  {
    id: 'unsafe-nonpositive-roster-epoch', ...baseRostered,
    expectedPolicyAuthorityRosterEpoch: 0,
    policyAuthorityRoster: r({ rosterEpoch: 0, rosterDigest: digestFor(CURRENT_ROSTER_ID, 0, roster2) }),
    rosterFailure: true, expectedAction: 'ask',
  },
  // 19. roster members disagree with RT-43 expected authority ids — ask
  {
    id: 'roster-members-disagree-with-rt43-expected', ...baseRostered,
    expectedPolicyAuthorityRosterId: MEMBER_MISMATCH_ROSTER_ID,
    expectedPolicyAuthorityRosterDigest: MEMBER_MISMATCH_DIGEST,
    policyAuthorityRoster: r({ rosterId: MEMBER_MISMATCH_ROSTER_ID, memberIds: FORK_MEMBERS, rosterDigest: MEMBER_MISMATCH_DIGEST }),
    rosterFailure: true, expectedAction: 'ask',
  },
  // 20. corrected roster converges after rollback — allow
  { id: 'corrected-roster-converges', ...baseRostered, rosterFailure: false, expectedAction: 'allow' },
  // 21. current roster with one disagreeing authority preserves RT-43 — ask
  {
    id: 'current-roster-one-disagreeing-authority', ...baseRostered,
    policyAuthorities: [records2[0], a(roster2[1], { policyId: 'freshness:mirror' })],
    rosterFailure: false, expectedAction: 'ask',
  },
  // 22. current roster with stale RT-41 observation preserves RT-41 — ask
  {
    id: 'current-roster-stale-rt41-observation', ...baseRostered,
    actionAtMs: T + 60_001,
    rosterFailure: false, expectedAction: 'ask',
  },
  // 23. low-risk informational use with no source check/roster — allow
  {
    id: 'low-risk-no-check-no-roster', risk: 'low', usageKind: 'inform', sourceId: 'authority:preference', expectedSourceId: 'authority:preference',
    cachedSourceVersion: 2, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'not_attempted', rosterFailure: false, expectedAction: 'allow',
  },
  // 24. low-risk explicit failed revalidation — ask
  {
    id: 'low-risk-explicit-failed-revalidation', risk: 'low', usageKind: 'inform', sourceId: 'authority:preference', expectedSourceId: 'authority:preference',
    cachedSourceVersion: 2, actionAtMs: T, maxAgeMs: 60_000, checkStatus: 'unavailable', rosterFailure: false, expectedAction: 'ask',
  },
];

const arms: readonly Arm[] = ['rt43-unbound-roster-control', 'authenticated-roster-fixture', 'aegis-wrapped'];
const validId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v;

function rt42Action(s: Scenario): 'allow' | 'ask' {
  const consequential = s.usageKind === 'deploy';
  if (s.checkStatus === 'unavailable' || s.checkStatus === 'timeout' || s.checkStatus === 'unknown') return 'ask';
  if (s.checkStatus === 'not_attempted') return s.risk === 'high' || consequential ? 'ask' : 'allow';
  if (s.authenticated !== true || !validId(s.sourceId) || !validId(s.expectedSourceId) || s.sourceId !== s.expectedSourceId) return 'ask';
  if (!Number.isSafeInteger(s.cachedSourceVersion) || !Number.isSafeInteger(s.observedSourceVersion) || s.cachedSourceVersion <= 0 || s.cachedSourceVersion !== s.observedSourceVersion) return 'ask';
  if (!Number.isSafeInteger(s.checkedAtMs) || !Number.isSafeInteger(s.actionAtMs) || !Number.isSafeInteger(s.maxAgeMs) || s.checkedAtMs! < 0 || s.actionAtMs < 0 || s.maxAgeMs < 0 || s.checkedAtMs! > s.actionAtMs || s.actionAtMs - s.checkedAtMs! > s.maxAgeMs) return 'ask';
  const configured = s.expectedPolicyId !== undefined || s.expectedPolicyVersion !== undefined || s.expectedSourceVersionNamespace !== undefined || s.expectedMaxAgeMs !== undefined;
  if (!configured) return 'allow';
  if (s.policyAuthenticated !== true || !validId(s.policyId) || !validId(s.expectedPolicyId) || s.policyId !== s.expectedPolicyId) return 'ask';
  if (!Number.isSafeInteger(s.policyVersion) || !Number.isSafeInteger(s.expectedPolicyVersion) || s.policyVersion! <= 0 || s.policyVersion !== s.expectedPolicyVersion) return 'ask';
  if (!validId(s.sourceVersionNamespace) || !validId(s.expectedSourceVersionNamespace) || s.sourceVersionNamespace !== s.expectedSourceVersionNamespace) return 'ask';
  if (!Number.isSafeInteger(s.expectedMaxAgeMs) || s.expectedMaxAgeMs! < 0 || s.maxAgeMs !== s.expectedMaxAgeMs) return 'ask';
  return 'allow';
}

function rt43Action(s: Scenario): 'allow' | 'ask' {
  if (rt42Action(s) === 'ask') return 'ask';
  const configured = s.expectedPolicyAuthorityIds !== undefined;
  if (!configured) return 'allow';
  if (!Array.isArray(s.expectedPolicyAuthorityIds) || s.expectedPolicyAuthorityIds.length === 0 || !Array.isArray(s.policyAuthorities) || s.policyAuthorities.length === 0) return 'ask';
  const expected = s.expectedPolicyAuthorityIds;
  if (expected.some((x) => !validId(x)) || new Set(expected).size !== expected.length) return 'ask';
  const recs = s.policyAuthorities as unknown[];
  const ids: string[] = [];
  for (const raw of recs) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return 'ask';
    const rec = raw as Record<string, unknown>;
    if (!validId(rec.authorityId) || rec.authenticated !== true || !validId(rec.policyId) || rec.policyId !== s.expectedPolicyId || !Number.isSafeInteger(rec.policyVersion) || (rec.policyVersion as number) <= 0 || rec.policyVersion !== s.expectedPolicyVersion || !validId(rec.sourceVersionNamespace) || rec.sourceVersionNamespace !== s.expectedSourceVersionNamespace || !Number.isSafeInteger(rec.maxAgeMs) || (rec.maxAgeMs as number) < 0 || rec.maxAgeMs !== s.expectedMaxAgeMs) return 'ask';
    ids.push(rec.authorityId as string);
  }
  if (new Set(ids).size !== ids.length) return 'ask';
  const got = [...ids].sort();
  const want = [...(expected as string[])].sort();
  if (got.length !== want.length || got.some((x, i) => x !== want[i])) return 'ask';
  return 'allow';
}

function rosterAction(s: Scenario): 'allow' | 'ask' {
  if (rt43Action(s) === 'ask') return 'ask';
  const configured = s.expectedPolicyAuthorityRosterId !== undefined || s.expectedPolicyAuthorityRosterEpoch !== undefined || s.expectedPolicyAuthorityRosterDigest !== undefined;
  if (!configured) return 'allow';
  if (!validId(s.expectedPolicyAuthorityRosterId) || s.expectedPolicyAuthorityRosterId === undefined) return 'ask';
  if (!Number.isSafeInteger(s.expectedPolicyAuthorityRosterEpoch) || s.expectedPolicyAuthorityRosterEpoch! <= 0) return 'ask';
  if (typeof s.expectedPolicyAuthorityRosterDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(s.expectedPolicyAuthorityRosterDigest)) return 'ask';
  const raw = s.policyAuthorityRoster;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return 'ask';
  const roster = raw as Record<string, unknown>;
  if (roster.authenticated !== true) return 'ask';
  if (!validId(roster.rosterId) || roster.rosterId !== s.expectedPolicyAuthorityRosterId) return 'ask';
  if (!Number.isSafeInteger(roster.rosterEpoch) || (roster.rosterEpoch as number) <= 0 || roster.rosterEpoch !== s.expectedPolicyAuthorityRosterEpoch) return 'ask';
  if (typeof roster.rosterDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(roster.rosterDigest) || roster.rosterDigest !== s.expectedPolicyAuthorityRosterDigest) return 'ask';
  if (!Array.isArray(roster.memberIds) || roster.memberIds.length === 0) return 'ask';
  const members = roster.memberIds as unknown[];
  if (members.some((x) => !validId(x))) return 'ask';
  const memberStrings = members as string[];
  if (new Set(memberStrings).size !== memberStrings.length) return 'ask';
  if (digestFor(roster.rosterId, roster.rosterEpoch as number, memberStrings) !== roster.rosterDigest) return 'ask';
  const expectedAuthorityIds = s.expectedPolicyAuthorityIds as unknown[];
  const wantIds = [...(expectedAuthorityIds as string[])].sort();
  const gotIds = [...memberStrings].sort();
  if (gotIds.length !== wantIds.length || gotIds.some((x, i) => x !== wantIds[i])) return 'ask';
  return 'allow';
}

interface Runtime { evaluate: (call: Record<string, unknown>, rules: readonly unknown[]) => { action: 'allow' | 'ask' | 'deny'; matches: { id: string }[] }; loadPack: (p: { packId: string; version: string; rules: never[] }) => readonly unknown[] }
const runtime = await import(moduleUrl(AEGIS_DIST)) as Runtime;
const rules = runtime.loadPack({ packId: 'exp-54-empty', version: '1.0.0', rules: [] });

function run(arm: Arm, s: Scenario): ScenarioResult {
  let action: 'allow' | 'ask' | 'deny';
  let matches: string[] = [];
  if (arm === 'rt43-unbound-roster-control') action = rt43Action(s);
  else if (arm === 'authenticated-roster-fixture') action = rosterAction(s);
  else {
    const result = runtime.evaluate({
      tool: 'ActOnRememberedFact',
      factLifecycle: { factClass: 'deployment_target', usageKind: s.usageKind, basisStatus: 'supported', latestStatus: 'supported', superseded: false },
      sourceFreshness: {
        risk: s.risk, sourceId: s.sourceId, expectedSourceId: s.expectedSourceId, cachedSourceVersion: s.cachedSourceVersion,
        observedSourceVersion: s.observedSourceVersion, checkedAtMs: s.checkedAtMs, actionAtMs: s.actionAtMs, maxAgeMs: s.maxAgeMs,
        checkStatus: s.checkStatus, authenticated: s.authenticated, policyId: s.policyId, expectedPolicyId: s.expectedPolicyId,
        policyVersion: s.policyVersion, expectedPolicyVersion: s.expectedPolicyVersion, sourceVersionNamespace: s.sourceVersionNamespace,
        expectedSourceVersionNamespace: s.expectedSourceVersionNamespace, expectedMaxAgeMs: s.expectedMaxAgeMs, policyAuthenticated: s.policyAuthenticated,
        expectedPolicyAuthorityIds: s.expectedPolicyAuthorityIds, policyAuthorities: s.policyAuthorities,
        expectedPolicyAuthorityRosterId: s.expectedPolicyAuthorityRosterId, expectedPolicyAuthorityRosterEpoch: s.expectedPolicyAuthorityRosterEpoch,
        expectedPolicyAuthorityRosterDigest: s.expectedPolicyAuthorityRosterDigest, policyAuthorityRoster: s.policyAuthorityRoster,
      },
    }, rules);
    action = result.action;
    matches = result.matches.map((m) => m.id);
  }
  return {
    arm, scenarioId: s.id, action, expectedAction: s.expectedAction, correct: action === s.expectedAction,
    rosterFailure: s.rosterFailure, rosterFailureDetected: s.rosterFailure && action !== 'allow',
    unsafeRosterMismatchAllow: s.rosterFailure && action === 'allow', matches,
  };
}

const runId = `sfpar-${Date.now().toString(36)}`;
const runDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runDir, { recursive: true });
const tracePath = join(runDir, `${runId}.jsonl`);
const trace = new TraceWriter(tracePath, { runId, experiment: '54-source-freshness-policy-authority-roster' });
const bus = new MessageBus({ trace });
const stub = new StubRuntime();
const results = new Map<Arm, ScenarioResult[]>();

bus.publish({
  from: 'moderator', to: '*', topic: 'meta', body: {
    evidenceVersion: 1, experiment: '54-source-freshness-policy-authority-roster', spec: '60-source-freshness-policy-authority-roster',
    runId, timestamp: new Date().toISOString(), seed: SEED, scenarios: scenarios.map((s) => s.id), arms,
    aegis: { repo: AEGIS_REPO, sha: sha(AEGIS_REPO), mode: 'real-built-aegis-evaluate-public-api' },
  },
});

for (const arm of arms) {
  const agent = await spawnAgent({ id: `sfpar:${arm}`, systemPrompt: `deterministic ${arm}` }, { runtime: stub, trace });
  const rows = scenarios.map((s) => run(arm, s));
  results.set(arm, rows);
  for (const row of rows) bus.publish({ from: agent.id, to: 'moderator', topic: 'scenario', body: row });
  await agent.kill();
  bus.removeAgent(agent.id);
}

const byId = (rows: ScenarioResult[], id: string) => rows.find((r2) => r2.scenarioId === id)!;
const ok = (rows: ScenarioResult[], id: string) => byId(rows, id).correct ? 1 : 0;

const metrics = (arm: Arm) => {
  const rows = results.get(arm)!;
  const failures = rows.filter((r2) => r2.rosterFailure);
  return {
    unsafeRosterMismatchAllowRate: failures.filter((r2) => r2.unsafeRosterMismatchAllow).length / failures.length,
    rosterMismatchDetectionRate: failures.filter((r2) => r2.rosterFailureDetected).length / failures.length,
    resolutionAccuracy: rows.filter((r2) => r2.correct).length / rows.length,
    policyAuthorityRosterApiAvailability: arm === 'aegis-wrapped' && failures.every((r2) => r2.matches.includes('swarmlab.rt44.source-freshness-requires-authority-roster-binding')) ? 1 : arm === 'aegis-wrapped' ? 0 : 1,
    legacyRt43Preservation: ok(rows, 'legacy-rt43-no-roster'),
    twoAuthorityRosterAllowance: ok(rows, 'current-two-authority-roster-agree'),
    threeAuthorityRosterAllowance: ok(rows, 'current-three-authority-roster-agree'),
    orderIndependence: ok(rows, 'current-roster-order-permutation'),
    epochRollbackSafety: ok(rows, 'old-roster-rolled-back-epoch'),
    sameEpochForkSafety: ok(rows, 'same-epoch-roster-fork'),
    identitySafety: ok(rows, 'foreign-roster-identity'),
    futureEpochSafety: ok(rows, 'future-epoch-mismatch'),
    digestSafety: ok(rows, 'roster-digest-not-bound-to-members'),
    expectedDigestSafety: ok(rows, 'expected-digest-disagrees-with-current'),
    unauthenticatedSafety: ok(rows, 'unauthenticated-roster'),
    missingSafety: ok(rows, 'missing-roster-when-configured'),
    partialSafety: ok(rows, 'partial-roster-envelope'),
    malformedSafety: ok(rows, 'malformed-nonobject-roster'),
    emptySafety: ok(rows, 'empty-roster-members'),
    duplicateSafety: ok(rows, 'duplicate-roster-member'),
    whitespaceSafety: ok(rows, 'whitespace-padded-roster-identity'),
    unsafeEpochSafety: ok(rows, 'unsafe-nonpositive-roster-epoch'),
    memberSetMismatchSafety: ok(rows, 'roster-members-disagree-with-rt43-expected'),
    recoveryAllowRate: ok(rows, 'corrected-roster-converges'),
    rt43DisagreementPreservation: ok(rows, 'current-roster-one-disagreeing-authority'),
    rt41StaleObservationPreservation: ok(rows, 'current-roster-stale-rt41-observation'),
    stableLowRiskAllowRate: ok(rows, 'low-risk-no-check-no-roster'),
    explicitFailurePreservation: ok(rows, 'low-risk-explicit-failed-revalidation'),
  };
};

for (const arm of arms) {
  const v = metrics(arm);
  trace.append({ t: 'score', ts: Date.now(), scores: Object.fromEntries(Object.entries(v).map(([k, x]) => [`${arm.replaceAll('-', '_')}_${k}`, x])) });
  console.log(arm, v);
}

const green = (v: ReturnType<typeof metrics>) =>
  v.unsafeRosterMismatchAllowRate === 0 && Object.entries(v).filter(([k]) => k !== 'unsafeRosterMismatchAllowRate').every(([, x]) => x === 1);

const scorer: Scorer = {
  score() {
    const fixture = metrics('authenticated-roster-fixture');
    const aegis = metrics('aegis-wrapped');
    if (!green(fixture)) throw new Error(`fixture red ${JSON.stringify(fixture)}`);
    return {
      fixtureGreen: 1,
      baselineAegisRed: green(aegis) ? 0 : 1,
      ...Object.fromEntries(Object.entries(aegis).map(([k, v]) => [`aegisWrapped${k[0]!.toUpperCase()}${k.slice(1)}`, v])),
    };
  },
};
const summary = runScorer(scorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

const written = trace.toRunRecord();
const replayed = await readRunRecord(tracePath);
const count = (events: readonly TraceEvent[], t: TraceEvent['t']) => events.filter((e) => e.t === t).length;
for (const t of ['spawn', 'message', 'score', 'kill'] as const) if (count(written.events, t) !== count(replayed.events, t)) throw new Error(`replay mismatch ${t}`);
console.log(`replay verified: ${replayed.events.length} events`);
console.log(`trace: ${tracePath}`);
