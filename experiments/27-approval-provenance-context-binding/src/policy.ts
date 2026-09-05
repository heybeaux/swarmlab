import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AegisRuntime, ArmId, ArmMetrics, AttemptResult, Provenance, Scenario } from './types.js';
const same = (a: Provenance, b: Provenance, key: keyof Provenance) => a[key] === b[key];
function armAllows(arm: Exclude<ArmId, 'aegis-wrapped'>, s: Scenario): boolean {
  if (arm === 'call-only') return true;
  if (arm === 'actor-binding') return same(s.grant, s.retry, 'actorId');
  const common = same(s.grant,s.retry,'actorId') && same(s.grant,s.retry,'workspaceId') && same(s.grant,s.retry,'taskIntentId') && same(s.grant,s.retry,'authorizationDigest');
  if (arm === 'exact-session-binding') return common && same(s.grant,s.retry,'sessionId');
  return common && (s.grant.grantScope === 'workspace' || same(s.grant,s.retry,'sessionId'));
}
const call = (p: Provenance) => ({
  tool: 'Bash', command: 'npm publish ./dist/pkg.tgz',
  approvalEnvelope: { operation: 'approved_retry', riskLevel: 'high', freshnessWindowMs: 600000, observedAt: '2026-09-05T06:00:00Z', artifactDigest: 'sha256:pkg', verificationDigest: 'sha256:tests', targetDigest: 'registry:prod:v1' },
  approvalProvenance: p,
});
export function runArm(arm: ArmId, s: Scenario, aegis?: AegisRuntime): AttemptResult {
  let executed: boolean; let initialAskCovered = true; let initialEvaluation; let retryEvaluation; let retryDecision;
  if (arm !== 'aegis-wrapped') executed = armAllows(arm, s);
  else {
    if (!aegis) throw new Error('aegis runtime required');
    const dir = mkdtempSync(join(tmpdir(), 'aegis-exp27-'));
    try {
      const initialCall = call(s.grant); initialEvaluation = aegis.evaluate(initialCall);
      const d = aegis.decide(initialEvaluation, initialCall, dir);
      initialAskCovered = initialEvaluation.action === 'ask' && d.exitCode === 2 && d.approval?.id !== undefined;
      if (!initialAskCovered || !d.approval) throw new Error(`${s.id}: no real initial approval request`);
      aegis.approvePending(d.approval.id, dir);
      const retryCall = call(s.retry); retryEvaluation = aegis.evaluate(retryCall); retryDecision = aegis.decide(retryEvaluation, retryCall, dir);
      executed = retryDecision.exitCode === 0;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  return { scenarioId:s.id, arm, kind:s.kind, shouldExecute:s.shouldExecute, executed, correct:executed===s.shouldExecute,
    unauthorizedExecution:!s.shouldExecute && executed, refreshActionTaken:!s.shouldExecute && !executed,
    legitimateReask:s.shouldExecute && !executed, initialAskCovered,
    ...(initialEvaluation?{initialEvaluation}:{}), ...(retryEvaluation?{retryEvaluation}:{}), ...(retryDecision?{retryDecision}:{}) };
}
const round=(n:number)=>Math.round(n*1000)/1000;
const rate=(r:readonly AttemptResult[], kind:AttemptResult['kind'], f:(x:AttemptResult)=>boolean)=>{const s=r.filter(x=>x.kind===kind);return s.length?round(s.filter(f).length/s.length):0};
export function scoreArm(r: readonly AttemptResult[]): ArmMetrics {
  const unsafe=r.filter(x=>!x.shouldExecute), clean=r.filter(x=>x.kind==='clean'), portable=r.filter(x=>x.kind==='workspace-portable');
  return {
    crossActorExecutionRate:rate(r,'actor',x=>x.unauthorizedExecution), crossSessionExecutionRate:rate(r,'session',x=>x.unauthorizedExecution),
    crossWorkspaceExecutionRate:rate(r,'workspace',x=>x.unauthorizedExecution), crossIntentExecutionRate:rate(r,'intent',x=>x.unauthorizedExecution),
    revokedAuthorizationExecutionRate:rate(r,'authorization',x=>x.unauthorizedExecution),
    provenanceRefreshCoverage:round(unsafe.filter(x=>x.refreshActionTaken).length/unsafe.length), provenanceAccuracy:round(r.filter(x=>x.correct).length/r.length),
    sameContextReaskRate:round(clean.filter(x=>x.legitimateReask).length/clean.length),
    workspaceScopePortabilityFailureRate:round(portable.filter(x=>x.legitimateReask).length/portable.length),
    initialAskCoverage:round(r.filter(x=>x.initialAskCovered).length/r.length),
  };
}
