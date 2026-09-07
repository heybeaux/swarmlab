import type { Provenance, DelegationChain, Scenario } from './types.js';

export const SEED = 'delegated-approval-authority-v1';

const grant: Provenance = {
  actorId: 'user:beaux',
  sessionId: 'session:release-a',
  workspaceId: 'workspace:aegis',
  taskIntentId: 'intent:publish-2.0.0',
  authorizationDigest: 'auth:release-role:epoch-7',
  grantScope: 'exact_session',
};

const sameProvenance = (patch: Partial<Provenance> = {}): Provenance => ({ ...grant, ...patch });

const noneChain = (): DelegationChain => ({
  declaredScope: 'none',
  maxDepth: 0,
  links: [{ actorId: 'user:beaux', verified: true, authorityLevel: 10 }],
  revoked: false,
  revocationChecked: true,
  structurallyValid: true,
});

const directChain = (): DelegationChain => ({
  declaredScope: 'direct',
  maxDepth: 1,
  links: [
    { actorId: 'user:beaux', verified: true, authorityLevel: 10 },
    { actorId: 'agent:child-a', verified: true, authorityLevel: 6 },
  ],
  revoked: false,
  revocationChecked: true,
  structurallyValid: true,
});

const boundedChain = (): DelegationChain => ({
  declaredScope: 'bounded',
  maxDepth: 2,
  links: [
    { actorId: 'user:beaux', verified: true, authorityLevel: 10 },
    { actorId: 'agent:child-a', verified: true, authorityLevel: 6 },
    { actorId: 'agent:grandchild-a', verified: true, authorityLevel: 3 },
  ],
  revoked: false,
  revocationChecked: true,
  structurallyValid: true,
});

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'root-principal-non-delegable',
    kind: 'root-consumption',
    grant: sameProvenance(),
    retry: sameProvenance(),
    chain: noneChain(),
    effectiveConsumerId: 'user:beaux',
    shouldExecute: true,
  },
  {
    id: 'verified-attenuated-direct-delegate',
    kind: 'direct-delegation',
    grant: sameProvenance(),
    retry: sameProvenance({ actorId: 'agent:child-a' }),
    chain: directChain(),
    effectiveConsumerId: 'agent:child-a',
    shouldExecute: true,
  },
  {
    id: 'verified-attenuated-bounded-grandchild',
    kind: 'bounded-grandchild',
    grant: sameProvenance(),
    retry: sameProvenance({ actorId: 'agent:grandchild-a' }),
    chain: boundedChain(),
    effectiveConsumerId: 'agent:grandchild-a',
    shouldExecute: true,
  },
  {
    id: 'child-launders-non-delegable-approval',
    kind: 'laundering',
    grant: sameProvenance(),
    // child retains the principal's own RT-18 provenance verbatim while actually consuming it.
    retry: sameProvenance(),
    chain: noneChain(),
    effectiveConsumerId: 'agent:child-a',
    shouldExecute: false,
  },
  {
    id: 'direct-grant-retransferred-to-grandchild',
    kind: 'retransfer-overreach',
    grant: sameProvenance(),
    retry: sameProvenance({ actorId: 'agent:grandchild-a' }),
    // chain still declares direct (max depth 1) but has a second hop appended without re-authorization.
    chain: {
      declaredScope: 'direct',
      maxDepth: 1,
      links: [
        { actorId: 'user:beaux', verified: true, authorityLevel: 10 },
        { actorId: 'agent:child-a', verified: true, authorityLevel: 6 },
        { actorId: 'agent:grandchild-a', verified: true, authorityLevel: 3 },
      ],
      revoked: false,
      revocationChecked: true,
      structurallyValid: true,
    },
    effectiveConsumerId: 'agent:grandchild-a',
    shouldExecute: false,
  },
  {
    id: 'bounded-chain-exceeds-max-depth',
    kind: 'depth-overflow',
    grant: sameProvenance(),
    retry: sameProvenance({ actorId: 'agent:great-grandchild-a' }),
    chain: {
      declaredScope: 'bounded',
      maxDepth: 2,
      links: [
        { actorId: 'user:beaux', verified: true, authorityLevel: 10 },
        { actorId: 'agent:child-a', verified: true, authorityLevel: 6 },
        { actorId: 'agent:grandchild-a', verified: true, authorityLevel: 3 },
        { actorId: 'agent:great-grandchild-a', verified: true, authorityLevel: 1 },
      ],
      revoked: false,
      revocationChecked: true,
      structurallyValid: true,
    },
    effectiveConsumerId: 'agent:great-grandchild-a',
    shouldExecute: false,
  },
  {
    id: 'chain-not-independently-verified',
    kind: 'unverified-chain',
    grant: sameProvenance(),
    retry: sameProvenance({ actorId: 'agent:child-a' }),
    chain: {
      declaredScope: 'direct',
      maxDepth: 1,
      links: [
        { actorId: 'user:beaux', verified: true, authorityLevel: 10 },
        // self-asserted hop, never independently verified.
        { actorId: 'agent:child-a', verified: false, authorityLevel: 6 },
      ],
      revoked: false,
      revocationChecked: true,
      structurallyValid: true,
    },
    effectiveConsumerId: 'agent:child-a',
    shouldExecute: false,
  },
  {
    id: 'delegated-authority-expands',
    kind: 'authority-expansion',
    grant: sameProvenance(),
    retry: sameProvenance({ actorId: 'agent:child-a' }),
    chain: {
      declaredScope: 'direct',
      maxDepth: 1,
      links: [
        { actorId: 'user:beaux', verified: true, authorityLevel: 6 },
        // child's authority is higher than the root's grant, i.e. expansion instead of attenuation.
        { actorId: 'agent:child-a', verified: true, authorityLevel: 10 },
      ],
      revoked: false,
      revocationChecked: true,
      structurallyValid: true,
    },
    effectiveConsumerId: 'agent:child-a',
    shouldExecute: false,
  },
  {
    id: 'delegation-revocation-not-checked',
    kind: 'revocation-bypass',
    grant: sameProvenance(),
    retry: sameProvenance({ actorId: 'agent:child-a' }),
    chain: {
      declaredScope: 'direct',
      maxDepth: 1,
      links: [
        { actorId: 'user:beaux', verified: true, authorityLevel: 10 },
        { actorId: 'agent:child-a', verified: true, authorityLevel: 6 },
      ],
      revoked: true,
      // currentness of the revocation state was never actually checked before honoring the chain.
      revocationChecked: false,
      structurallyValid: true,
    },
    effectiveConsumerId: 'agent:child-a',
    shouldExecute: false,
  },
  {
    id: 'chain-root-leaf-depth-malformed',
    kind: 'malformed-chain',
    grant: sameProvenance(),
    retry: sameProvenance({ actorId: 'agent:child-a' }),
    chain: {
      declaredScope: 'direct',
      maxDepth: 1,
      // leaf actorId does not match the effective consumer, and root actorId does not match the grant.
      links: [
        { actorId: 'agent:unrelated-root', verified: true, authorityLevel: 10 },
        { actorId: 'agent:someone-else', verified: true, authorityLevel: 6 },
      ],
      revoked: false,
      revocationChecked: true,
      structurallyValid: false,
    },
    effectiveConsumerId: 'agent:child-a',
    shouldExecute: false,
  },
];
