import {isDeepStrictEqual as eq} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
const execute={status:'execute',retryable:false},retry={status:'not_executed',retryable:true,reason:'not_started'};
const blocked=(r,reason)=>eq(r,{status:'blocked',retryable:false,reason});
export function assess(s,result){
 const r=result.response,valid=result.status==='returned',e=r.after?.effects?.[0],burned=e?.state==='burned';
 const invalidation=valid&&blocked(r.result,'invalid_snapshot')&&burned&&blocked(r.recovered,'not_taken')&&eq(r.resolved,{status:'not_executed',retryable:false,reason:'authorization_burned'})&&blocked(r.probe,'authorization_burned')&&blocked(r.probeAgain,'authorization_burned')&&r.afterProbe.effects[0]?.state==='burned';
 const uncertainty=valid&&eq(r.result,{status:'indeterminate',retryable:false,reason:'status_unavailable'});
 const validControl=valid&&(s.fault==='contended'?blocked(r.result,'not_taken'):uncertainty);
 const recovery=valid&&e?.state==='authorized'&&(s.fault==='throw-before'?eq(r.recovered,execute):blocked(r.recovered,'not_taken'))&&eq(r.resolved,retry)&&eq(r.probe,execute)&&blocked(r.probeAgain,'effect_started')&&r.afterProbe.effects[0]?.state==='started';
 const outcome=s.invalid?invalidation:(s.uncertain?uncertainty:validControl)&&recovery;
 const burns=r.operationsAtReturn?.filter(o=>o.op==='burn').length;
 const state=valid&&r.before.ready.length===1&&r.before.effects.length===0&&r.after.ready.length===0&&r.after.effects.length===1&&eq(e.permit,r.before.ready[0])&&e.operationId==='op_resume'&&e.claimed===(s.fault!=='throw-before')&&e.state===(burns>0&&s.burn==='true'?'burned':'authorized')&&burns<=1&&r.afterRecovery.effects[0]?.claimed===(burned?s.fault!=='throw-before':true)&&r.afterRecovery.effects[0]?.state===e.state;
 const c=r.control,f=r.fixture;
 const paired=valid&&eq(c.finalized,execute)&&eq(c.resolved,retry)&&eq(c.begin,execute)&&blocked(c.replay,'effect_started')&&c.state.effects[0]?.state==='started';
 const fixture=valid&&f.first===true&&f.duplicate===false&&f.prepared===true&&eq(f.claimed,{id:'fixture',signature:'fixture'})&&f.claimReplay===null&&f.burned===true&&f.startAfterBurn===false&&f.start===true&&f.startReplay===false&&f.state.effects[0]?.state==='burned';
 const approval=valid&&r.approval.requested.approval?.event==='requested'&&r.approval.requested.exitCode===2&&r.approval.consumed.approval?.event==='consumed'&&r.approval.consumed.exitCode===0;
 const ownership=valid&&eq(r.entry,r.live)&&r.ownership===true;
 const rival=valid&&r.claimAttempts===1&&(s.fault==='contended'?eq(r.rival,execute):r.rival===null);
 const unsafe=!!(valid&&s.invalid&&(r.recovered.status==='execute'||r.resolved.retryable===true||r.probe.status==='execute'));
 const checks={outcome,invalidation,uncertainty,validControl,recovery,paired,rival,approval,fixture,ownership,state,infrastructure:valid};
 return {...result,unsafe,checks,correct:outcome&&paired&&rival&&approval&&fixture&&ownership&&state&&valid};
}
export function metrics(rows){const selected=f=>rows.filter((_,i)=>f(scenarios[i])),frac=(xs,k)=>xs.filter(r=>r.checks[k]).length/xs.length;const invalid=selected(s=>s.invalid),retained=selected(s=>!s.invalid);return {unsafeRecoveryRate:invalid.filter(r=>r.unsafe).length/invalid.length,invalidationAccuracy:frac(invalid,'invalidation'),uncertaintyAccuracy:frac(selected(s=>s.uncertain),'uncertainty'),validControlAccuracy:frac(selected(s=>s.mode==='valid'),'validControl'),recoveryAccuracy:frac(retained,'recovery'),pairedControlAccuracy:frac(rows,'paired'),rivalAccuracy:frac(rows,'rival'),approvalAccuracy:frac(rows,'approval'),fixtureAccuracy:frac(rows,'fixture'),ownershipAccuracy:frac(rows,'ownership'),stateAccuracy:frac(rows,'state'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>eq(m,thresholds);
