import type { AuthoritySnapshot, Scenario } from './types.js';
export const SEED = 'approval-execution-checkpoint-v1';
const provenance = (authorizationDigest = 'auth:epoch-7', actorId = 'user:beaux') => ({
  actorId, sessionId: 'session:release-a', workspaceId: 'workspace:aegis',
  taskIntentId: 'intent:publish-2.0.0', authorizationDigest, grantScope: 'exact_session' as const,
});
const snap = (who: 'root' | 'direct' | 'bounded'): AuthoritySnapshot => {
  const ids = who === 'root' ? ['user:beaux'] : who === 'direct'
    ? ['user:beaux', 'agent:child-a'] : ['user:beaux', 'agent:child-a', 'agent:grandchild-a'];
  const auth = [10, 6, 3];
  return {
    provenance: provenance('auth:epoch-7', ids[ids.length - 1]),
    delegation: {
      effectiveConsumerId: ids[ids.length - 1]!,
      declaredScope: who === 'root' ? 'none' : who === 'direct' ? 'direct' : 'bounded',
      maxDepth: ids.length - 1,
      links: ids.map((actorId, i) => ({ actorId, verified: true, authorityLevel: auth[i]! })),
      revoked: false, revocationChecked: true, structurallyValid: true,
    },
  };
};
const clone = (x: AuthoritySnapshot): AuthoritySnapshot => structuredClone(x);
const scenario = (id: string, kind: Scenario['kind'], consumed: AuthoritySnapshot, current: AuthoritySnapshot | undefined, shouldExecute: boolean, checkpointPresent = true, replayAttempt = false): Scenario => ({ id, kind, consumed, ...(current ? { current } : {}), checkpointPresent, shouldExecute, replayAttempt });
const root = snap('root'), direct = snap('direct'), bounded = snap('bounded');
const rotated = clone(direct); rotated.provenance.authorizationDigest = 'auth:epoch-8';
const revokedDirect = clone(direct); revokedDirect.delegation.revoked = true;
const revokedIntermediate = clone(bounded); revokedIntermediate.delegation.links[1]!.revoked = true;
const driftedConsumer = clone(direct); driftedConsumer.provenance.actorId = 'agent:child-b'; driftedConsumer.delegation.effectiveConsumerId = 'agent:child-b'; driftedConsumer.delegation.links[1]!.actorId = 'agent:child-b';
const expanded = clone(direct); expanded.delegation.links[1]!.authorityLevel = 12;
export const SCENARIOS: readonly Scenario[] = [
  scenario('stable-root-authority', 'stable-root', root, clone(root), true),
  scenario('stable-direct-delegation', 'stable-direct', direct, clone(direct), true),
  scenario('stable-bounded-grandchild', 'stable-bounded', bounded, clone(bounded), true),
  scenario('authorization-rotates-after-consumption', 'authorization-rotation', direct, rotated, false),
  scenario('direct-delegation-revoked-after-consumption', 'direct-revocation', direct, revokedDirect, false),
  scenario('intermediate-link-revoked-after-consumption', 'intermediate-revocation', bounded, revokedIntermediate, false),
  scenario('effective-consumer-drifts-after-consumption', 'consumer-drift', direct, driftedConsumer, false),
  scenario('authority-expands-after-consumption', 'authority-expansion', direct, expanded, false),
  scenario('execution-checkpoint-missing', 'missing-checkpoint', direct, undefined, false, false),
  scenario('execution-permit-replayed', 'permit-replay', direct, clone(direct), true, true, true),
];
