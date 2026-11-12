import {isDeepStrictEqual as eq} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
const execute={status:'execute',retryable:false},retry={status:'not_executed',retryable:true,reason:'not_started'};
const blocked=(r,reason)=>eq(r,{status:'blocked',retryable:false,reason});
export function assess(s,result){
 const r=result.response,valid=result.status==='returned',state=r.after?.effects[0]?.state;
 const expectedState=s.mode==='valid'?(s.api==='resolve'?'authorized':'started'):['burn-true','throw-after'].includes(s.mode)?'burned':s.mode==='concurrent-start'?'started':'authorized';
 const expected=s.mode==='valid'?(s.api==='resolve'?retry:execute):s.uncertain?{status:'indeterminate',retryable:false,reason:s.api==='resolve'?'journal_unavailable':'status_unavailable'}:{status:s.api==='resolve'?'not_executed':'blocked',retryable:false,reason:'invalid_snapshot'};
 const scenario=valid&&eq(r.result,expected);
 const stateCorrect=valid&&state===expectedState&&r.after.effects[0]?.claimed===true&&r.after.ready.length===0&&r.ownership===true&&(s.mode==='concurrent-start'?eq(r.competing,execute):r.competing===null)&&r.operationsAtReturn.filter(o=>o.op==='burn').length===(s.mode==='valid'?0:1);
 const probe=valid&&(expectedState==='authorized'?eq(r.probe,execute):blocked(r.probe,expectedState==='burned'?'authorization_burned':'effect_started'))&&blocked(r.probeAgain,expectedState==='burned'?'authorization_burned':'effect_started')&&r.afterProbe.effects[0]?.state===(expectedState==='burned'?'burned':'started');
 const c=r.control,f=r.fixture;
 const controls=valid&&eq(r.finalized,execute)&&r.before.effects[0]?.state==='authorized'&&r.before.effects[0]?.claimed===true&&eq(c.finalized,execute)&&eq(c.resolved,retry)&&eq(c.begin,execute)&&blocked(c.replay,'effect_started')&&c.state.effects[0]?.state==='started';
 const fixture=valid&&f.first===true&&f.duplicate===false&&f.prepared===true&&eq(f.claimed,{id:'fixture',signature:'fixture'})&&f.claimReplay===null&&f.burned===true&&f.startAfterBurn===false&&f.start===true&&f.startReplay===false&&f.state.effects[0]?.state==='burned';
 const consumption=valid&&r.approval.requested.approval?.event==='requested'&&r.approval.requested.exitCode===2&&r.approval.consumed.approval?.event==='consumed'&&r.approval.consumed.exitCode===0;
 const falseDefinitive=valid&&s.uncertain&&r.result.status!=='indeterminate';
 const checks={scenario,state:stateCorrect,probe,controls,consumption,fixture,infrastructure:valid};
 return {id:s.id,result,falseDefinitive,checks,correct:Object.values(checks).every(Boolean)};
}
export const rescore=rows=>rows.map((r,i)=>assess(scenarios[i],r.result));
export function metrics(rows){const selected=f=>rows.filter((_,i)=>f(scenarios[i])),frac=(xs,k)=>xs.filter(r=>r.checks[k]).length/xs.length;const uncertain=selected(s=>s.uncertain);return {falseDefinitiveRate:uncertain.filter(r=>r.falseDefinitive).length/uncertain.length,uncertaintyAccuracy:frac(uncertain,'scenario'),confirmedBurnAccuracy:frac(selected(s=>s.mode==='burn-true'),'scenario'),validAccuracy:frac(selected(s=>s.mode==='valid'),'scenario'),stateAccuracy:frac(rows,'state'),probeAccuracy:frac(rows,'probe'),controlAccuracy:frac(rows,'controls'),approvalConsumptionAccuracy:frac(rows,'consumption'),fixtureAccuracy:frac(rows,'fixture'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>eq(m,thresholds);
