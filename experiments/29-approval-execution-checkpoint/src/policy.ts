import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AegisRuntime, ArmId, ArmMetrics, AttemptResult, AuthoritySnapshot, Scenario, ScenarioKind } from './types.js';

const stable = (x: unknown): string => JSON.stringify(x, Object.keys(x as object).sort());
function currentValid(consumed: AuthoritySnapshot, current: AuthoritySnapshot | undefined, checkpointPresent: boolean): boolean {
  if (!checkpointPresent || current === undefined) return false;
  const c = current.delegation;
  if (consumed.provenance.authorizationDigest !== current.provenance.authorizationDigest) return false;
  if (stable(consumed.provenance) !== stable(current.provenance)) return false;
  if (stable(consumed.delegation) !== stable(current.delegation)) return false;
  if (c.revoked || !c.revocationChecked || !c.structurallyValid) return false;
  if (!Number.isSafeInteger(c.maxDepth) || c.maxDepth < 0 || c.links.length - 1 > c.maxDepth) return false;
  if (c.links.length === 0 || c.links[0]?.actorId !== 'user:beaux' || c.links.at(-1)?.actorId !== c.effectiveConsumerId) return false;
  let authority = Number.POSITIVE_INFINITY;
  for (const link of c.links) {
    if (!link.verified || link.revoked || !Number.isFinite(link.authorityLevel) || link.authorityLevel > authority) return false;
    authority = link.authorityLevel;
  }
  return true;
}
function toCall(s: AuthoritySnapshot): Record<string, unknown> {
  return {
    tool: 'Bash', command: 'npm publish ./dist/pkg.tgz',
    approvalEnvelope: { operation: 'approved_retry', riskLevel: 'high', freshnessWindowMs: 600000, observedAt: '2026-09-08T06:00:00Z', artifactDigest: 'sha256:pkg', verificationDigest: 'sha256:tests', targetDigest: 'registry:prod:v1' },
    approvalProvenance: s.provenance, approvalDelegation: s.delegation,
  };
}
function grantCall(s: AuthoritySnapshot): Record<string, unknown> {
  const root = s.delegation.links[0]!;
  return toCall({ provenance: { ...s.provenance, actorId: root.actorId }, delegation: { ...s.delegation, effectiveConsumerId: root.actorId, links: [{ ...root }], revoked: false, revocationChecked: true, structurallyValid: true } });
}
export function runArm(arm: ArmId, s: Scenario, aegis?: AegisRuntime): AttemptResult {
  let allowedAtConsume = true, initialAskCovered = true, consumeCovered = true, checkpointAvailable = arm === 'execution-checkpoint';
  let permit: { id: string } | undefined;
  let dir: string | undefined;
  if (arm === 'aegis-wrapped') {
    if (!aegis) throw new Error('aegis runtime required');
    dir = mkdtempSync(join(tmpdir(), 'aegis-exp29-'));
    const initial = grantCall(s.consumed); const e1 = aegis.evaluate(initial); const d1 = aegis.decide(e1, initial, dir);
    initialAskCovered = e1.action === 'ask' && d1.exitCode === 2 && d1.approval?.id !== undefined;
    if (!d1.approval) throw new Error(`${s.id}: no initial approval`);
    aegis.approvePending(d1.approval.id, dir);
    const retry = toCall(s.consumed); const e2 = aegis.evaluate(retry); const d2 = aegis.decide(e2, retry, dir);
    allowedAtConsume = d2.exitCode === 0 && d2.approval?.event === 'consumed'; consumeCovered = allowedAtConsume;
    checkpointAvailable = typeof aegis.createExecutionPermit === 'function' && typeof aegis.finalizeExecutionPermit === 'function';
    if (allowedAtConsume && checkpointAvailable) permit = aegis.createExecutionPermit!(retry, e2, dir);
  }
  let executed = false, replayExecuted = false;
  if (allowedAtConsume) {
    if (arm === 'precheck-only' || arm === 'snapshot-only' || (arm === 'aegis-wrapped' && !checkpointAvailable)) {
      executed = true; replayExecuted = s.replayAttempt;
    } else if (arm === 'execution-checkpoint') {
      executed = currentValid(s.consumed, s.current, s.checkpointPresent);
      replayExecuted = false;
    } else if (arm === 'aegis-wrapped' && permit && dir && aegis?.finalizeExecutionPermit) {
      const current = s.current ? toCall(s.current) : {};
      executed = s.checkpointPresent && aegis.finalizeExecutionPermit(permit, current, dir);
      replayExecuted = s.replayAttempt && aegis.finalizeExecutionPermit(permit, current, dir);
    }
  }
  if (dir) rmSync(dir, { recursive: true, force: true });
  const correct = executed === s.shouldExecute && !replayExecuted;
  return { scenarioId: s.id, kind: s.kind, arm, shouldExecute: s.shouldExecute, executed, replayExecuted, correct, unauthorizedExecution: !s.shouldExecute && executed, refreshActionTaken: !s.shouldExecute && !executed, legitimateBlock: s.shouldExecute && !executed, initialAskCovered, consumeCovered, checkpointAvailable };
}
const round = (n: number) => Math.round(n * 1000) / 1000;
const rate = (r: readonly AttemptResult[], kind: ScenarioKind, f: (x: AttemptResult) => boolean) => { const a = r.filter(x => x.kind === kind); return a.length ? round(a.filter(f).length / a.length) : 0; };
export function scoreArm(r: readonly AttemptResult[]): ArmMetrics {
  const unsafe = r.filter(x => !x.shouldExecute), legit = r.filter(x => x.shouldExecute);
  return {
    authorizationRotationExecutionRate: rate(r, 'authorization-rotation', x => x.unauthorizedExecution),
    directRevocationExecutionRate: rate(r, 'direct-revocation', x => x.unauthorizedExecution),
    intermediateRevocationExecutionRate: rate(r, 'intermediate-revocation', x => x.unauthorizedExecution),
    consumerDriftExecutionRate: rate(r, 'consumer-drift', x => x.unauthorizedExecution),
    authorityExpansionExecutionRate: rate(r, 'authority-expansion', x => x.unauthorizedExecution),
    missingCheckpointExecutionRate: rate(r, 'missing-checkpoint', x => x.unauthorizedExecution),
    permitReplayExecutionRate: rate(r, 'permit-replay', x => x.replayExecuted),
    legitimateExecutionBlockRate: legit.length ? round(legit.filter(x => x.legitimateBlock).length / legit.length) : 0,
    executionRefreshCoverage: unsafe.length ? round(unsafe.filter(x => x.refreshActionTaken).length / unsafe.length) : 0,
    executionAccuracy: round(r.filter(x => x.correct).length / r.length),
    initialAskCoverage: round(r.filter(x => x.initialAskCovered).length / r.length),
    consumeCoverage: round(r.filter(x => x.consumeCovered).length / r.length),
    checkpointAvailability: round(r.filter(x => x.checkpointAvailable).length / r.length),
  };
}
