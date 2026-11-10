import {isDeepStrictEqual as eq} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
const execute={status:'execute',retryable:false};
const denied=r=>r?.status==='blocked'&&r.retryable===false;
export function lifecycleOK(o,fail=false){return !!o&&eq(o.finalized,execute)&&eq(o.beforeStart,{status:'not_executed',retryable:true,reason:'not_started'})&&eq(o.begin,execute)&&denied(o.beginReplay)&&eq(o.terminal,{status:fail?'failed':'executed'})&&eq(o.resolved,{status:fail?'not_executed':'executed',retryable:false,reason:fail?'effect_failed':'effect_committed'})&&denied(o.terminalBegin)&&denied(o.finalizeReplay)&&o.state.effects.some(e=>e.state===(fail?'failed':'committed')&&eq(e[fail?'failureReceipt':'successReceipt'],o.receipt));}
export function assess(s,result){
 const r=result.response,o=r.output,valid=result.status==='returned';
 let scenario=false;
 if(valid&&s.positive){scenario=lifecycleOK(o,s.kind==='strict-failure');
  if(s.kind==='strict-recovered-handle')scenario&&=eq(r.recovery,r.original);
  if(s.kind==='strict-fresh-grant')scenario&&=lifecycleOK(r.second?.output)&&r.second.permit.id!==r.original.id&&r.oldHandle.resolved.status==='indeterminate'&&r.oldHandle.resolved.retryable===false&&denied(r.oldHandle.begin);
 }else if(valid){
  if(s.kind.startsWith('read-'))scenario=o.resolved.status==='indeterminate'&&o.resolved.retryable===false&&denied(o.begin)&&o.state.effects[0]?.state==='authorized';
  else scenario=denied(o.finalized)&&o.finalized.reason==='invalid_snapshot'&&o.resolved.status!=='executed'&&o.resolved.retryable===false&&denied(o.begin)&&o.state.effects[0]?.state==='burned';
 }
 const f=r.fixture;
 const fixture=valid&&f.first===true&&f.duplicate===false&&f.prepared===true&&eq(f.claimed,{id:'fixture',signature:'original'})&&f.claimReplay===null&&f.start===true&&f.startReplay===false&&f.remint===false&&eq(f.state.issued,['fixture'])&&f.state.ready.length===0;
 const controls=valid&&lifecycleOK(r.legacyControl)&&eq(r.simpleControl,{first:true,replay:false});
 const consumption=valid&&r.approvals.length===(['strict-fresh-grant','cross-grant-record'].includes(s.kind)?2:1)&&r.approvals.every(a=>a.requested.approval?.status==='pending'&&a.consumed.approval?.status==='consumed');
 const replay=valid&&(s.positive?denied(o.beginReplay)&&denied(o.terminalBegin)&&denied(o.finalizeReplay):denied(o.begin));
 const checks={scenario,controls,consumption,fixture,replay,infrastructure:valid};
 return {id:s.id,result,checks,correct:Object.values(checks).every(Boolean)};
}
export function rescore(rows){return rows.map((r,i)=>assess(scenarios[i],r.result));}
export function metrics(rows){const frac=(xs,k)=>xs.filter(r=>r.checks[k]).length/xs.length;const strict=rows.filter((_,i)=>scenarios[i].kind.startsWith('strict-')),negative=rows.filter((_,i)=>!scenarios[i].positive);return {strictLifecycleAccuracy:frac(strict,'scenario'),negativeAccuracy:frac(negative,'scenario'),controlAccuracy:frac(rows,'controls'),approvalConsumptionAccuracy:frac(rows,'consumption'),fixtureAccuracy:frac(rows,'fixture'),replaySafety:frac(rows,'replay'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>eq(m,thresholds);
