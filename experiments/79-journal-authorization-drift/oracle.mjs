import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
const execute=r=>same(r,{status:'execute',retryable:false});
const blocked=(r,reason)=>same(r,{status:'blocked',retryable:false,reason});
const indeterminate=r=>same(r,{status:'indeterminate',retryable:false,reason:'status_unavailable'});
const resolved=(r,burned)=>same(r,{status:'not_executed',retryable:!burned,reason:burned?'authorization_burned':'not_started'});
const state=(v,name,claimed=true)=>v?.ready?.length===0&&v?.issued?.length===1&&v?.effects?.length===1&&v.effects[0].state===name&&v.effects[0].claimed===claimed;
export function assess(s,result){
 const r=result.response??{},a=r.approval,c=r.control,f=r.fixture;
 const invalidation=state(r.after,'burned')&&resolved(r.resolved,true)&&blocked(r.started,'authorization_burned')&&blocked(r.startReplay,'authorization_burned')&&state(r.afterResume,'burned');
 const initial=s.uncertain||s.kind==='claim-unavailable'?indeterminate(r.result):s.invalidate?blocked(r.result,'invalid_snapshot'):execute(r.result);
 const validLifecycle=state(r.beforeResume,'authorized')&&resolved(r.resolved,false)&&execute(r.started)&&blocked(r.startReplay,'effect_started')&&state(r.afterResume,'started');
 const checks={
  safeResume:!s.hazard||(!execute(r.started)&&r.resolved?.retryable===false),
  invalidation:!s.invalidate||invalidation,
  initial,
  control:execute(c?.result)&&resolved(c?.resolved,false)&&execute(c?.started)&&blocked(c?.startReplay,'effect_started')&&blocked(c?.replay,'not_taken')&&state(c?.state,'started'),
  recovery:s.kind!=='claim-unavailable'||(state(r.after,'authorized',false)&&execute(r.recovery)&&validLifecycle),
  uncertainty:!s.uncertain||(indeterminate(r.result)&&state(r.after,'authorized')&&r.resolved===null&&r.started===null),
  consumption:a?.requested?.exitCode===2&&a?.requested?.approval?.event==='requested'&&a?.consumed?.exitCode===0&&a?.consumed?.approval?.event==='consumed',
  replay:blocked(r.replay,'not_taken'),
  ownership:r.ownership===true,
  fixture:f?.first===true&&f?.duplicate===false&&f?.prepared===true&&same(f.claimed,{id:'fixture',signature:'fixture'})&&f?.claimReplay===null&&f?.burned===true&&f?.startAfterBurn===false&&f?.start===true&&f?.startReplay===false&&state(f?.state,'burned'),
  lifecycle:s.invalidate?invalidation:s.uncertain?state(r.after,'authorized'):validLifecycle,
  infrastructure:result.status==='returned',
 };
 return {id:s.id,result,checks,correct:Object.values(checks).every(x=>x===true)};
}
export const rescore=rows=>rows.map((r,i)=>assess(scenarios[i],r.result));
export function metrics(rows){const rate=(key,filter=()=>true)=>{const rs=rows.filter((r,i)=>filter(scenarios[i]));return rs.filter(r=>r.checks[key]).length/rs.length;};return {unsafeResumeRate:1-rate('safeResume',s=>s.hazard),durableInvalidationAccuracy:rate('invalidation',s=>s.invalidate),initialDecisionAccuracy:rate('initial'),controlAccuracy:rate('control'),recoveryAccuracy:rate('recovery',s=>s.kind==='claim-unavailable'),uncertaintyAccuracy:rate('uncertainty',s=>s.uncertain),approvalConsumptionAccuracy:rate('consumption'),replayBlockRate:rate('replay'),ownershipAccuracy:rate('ownership'),fixtureAccuracy:rate('fixture'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=scores=>same(scores,thresholds);
