import {isDeepStrictEqual as eq} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
const execute={status:'execute',retryable:false},retry={status:'not_executed',retryable:true,reason:'not_started'};
const blocked=(r,reason)=>eq(r,{status:'blocked',retryable:false,reason});
export function assess(s,result){
 const r=result.response,valid=result.status==='returned',effect=r.after?.effects[0];
 const positive=valid&&eq(r.result,s.api==='resolve'?retry:execute)&&effect?.state===(s.api==='resolve'?'authorized':'started');
 const denied=valid&&eq(r.result,{status:s.api==='resolve'?'not_executed':'blocked',retryable:false,reason:'invalid_snapshot'})&&effect?.state===(s.stage==='read'?'burned':'started');
 const replay=valid&&(s.positive?(s.api==='resolve'?eq(r.replay,execute):blocked(r.replay,'effect_started')):blocked(r.replay,s.stage==='read'?'authorization_burned':'effect_started'))&&blocked(r.replayAgain,s.positive||s.stage!=='read'?'effect_started':'authorization_burned');
 const c=r.control,f=r.fixture;
 const controls=valid&&eq(r.finalized,execute)&&r.before.effects[0]?.state==='authorized'&&r.before.effects[0]?.claimed===true&&eq(c.finalized,execute)&&eq(c.resolved,retry)&&eq(c.begin,execute)&&blocked(c.replay,'effect_started')&&c.state.effects[0]?.state==='started';
 const fixture=valid&&f.first===true&&f.duplicate===false&&f.prepared===true&&eq(f.claimed,{id:'fixture',signature:'fixture'})&&f.claimReplay===null&&f.burned===true&&f.startAfterBurn===false&&f.start===true&&f.startReplay===false&&f.state.effects[0]?.state==='burned';
 const consumption=valid&&r.approval.requested.approval?.event==='requested'&&r.approval.requested.exitCode===2&&r.approval.consumed.approval?.event==='consumed'&&r.approval.consumed.exitCode===0;
 const unsafe=valid&&(r.result.status==='execute'||r.result.retryable===true);
 const checks={scenario:s.positive?positive:denied,controls,consumption,fixture,ownership:valid&&r.ownership===true,replay,infrastructure:valid};
 return {id:s.id,result,unsafe,checks,correct:Object.values(checks).every(Boolean)};
}
export const rescore=rows=>rows.map((r,i)=>assess(scenarios[i],r.result));
export function metrics(rows){const selected=f=>rows.filter((_,i)=>f(scenarios[i])),frac=(xs,k)=>xs.filter(r=>r.checks[k]).length/xs.length;const hazards=selected(s=>s.kind.startsWith('repair-')||s.stage!=='read');return {unsafeAuthorityRate:hazards.filter(r=>r.unsafe).length/hazards.length,rejectionAccuracy:frac(selected(s=>!s.positive),'scenario'),positiveAccuracy:frac(selected(s=>s.positive),'scenario'),controlAccuracy:frac(rows,'controls'),approvalConsumptionAccuracy:frac(rows,'consumption'),fixtureAccuracy:frac(rows,'fixture'),ownershipAccuracy:frac(rows,'ownership'),replaySafety:frac(rows,'replay'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>eq(m,thresholds);
