import type { Provenance, Scenario } from './types.js';
export const SEED = 'approval-provenance-v1';
const grant: Provenance = {
  actorId: 'user:beaux', sessionId: 'session:release-a', workspaceId: 'workspace:aegis',
  taskIntentId: 'intent:publish-2.0.0', authorizationDigest: 'auth:release-role:epoch-7', grantScope: 'exact_session',
};
const same = (patch: Partial<Provenance> = {}): Provenance => ({ ...grant, ...patch });
export const SCENARIOS: readonly Scenario[] = [
  { id: 'same-context-exact-session', kind: 'clean', grant: same(), retry: same(), shouldExecute: true },
  { id: 'same-workspace-declared-portable', kind: 'workspace-portable', grant: same({ grantScope: 'workspace' }), retry: same({ sessionId: 'session:release-b', grantScope: 'workspace' }), shouldExecute: true },
  { id: 'different-actor-same-session', kind: 'actor', grant: same(), retry: same({ actorId: 'agent:other' }), shouldExecute: false },
  { id: 'different-session-exact-session', kind: 'session', grant: same(), retry: same({ sessionId: 'session:other' }), shouldExecute: false },
  { id: 'different-workspace-same-command', kind: 'workspace', grant: same(), retry: same({ workspaceId: 'workspace:other' }), shouldExecute: false },
  { id: 'different-task-intent-same-command', kind: 'intent', grant: same(), retry: same({ taskIntentId: 'intent:publish-evil' }), shouldExecute: false },
  { id: 'authorization-revoked', kind: 'authorization', grant: same(), retry: same({ authorizationDigest: 'auth:release-role:revoked-epoch-8' }), shouldExecute: false },
];
