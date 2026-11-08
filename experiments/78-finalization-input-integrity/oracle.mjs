import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
const execute=(s,r)=>s.api==='simple'?r===true:same(r,{status:'execute',retryable:false});
const blocked=(s,r)=>s.api==='simple'?r===false:same(r,{status:'blocked',retryable:false,reason:'invalid_snapshot'});
const replayed=(s,r)=>s.api==='simple'?r===false:same(r,{status:'blocked',retryable:true,reason:'not_taken'});
const empty=s=>s?.ready?.length===0&&s?.prepared?.length===0&&s?.issued?.length===1;
export function assess(s,result){const r=result.response??{},a=r.approval,c=r.control,f=r.fixture;
 const unavailable=s.api==='simple'?r.result===false:same(r.result,{status:'indeterminate',retryable:false,reason:'status_unavailable'});
 const outcome=s.allow?execute(s,r.result):s.kind==='unavailable'?unavailable:blocked(s,r.result);
 const checks={repair:!s.repair||!execute(s,r.result),mutation:!s.mutation||blocked(s,r.result),control:execute(s,c?.result)&&replayed(s,c?.replay)&&empty(c?.state),unchanged:!s.allow||execute(s,r.result),unavailable:s.kind!=='unavailable'||(unavailable&&execute(s,r.recovery)),consumption:a?.requested?.exitCode===2&&a?.requested?.approval?.event==='requested'&&a?.consumed?.exitCode===0&&a?.consumed?.approval?.event==='consumed',lifecycle:outcome&&empty(r.afterReplay)&&(s.kind==='unavailable'?(r.after?.ready?.length===(s.api==='simple'?1:0)&&r.after?.prepared?.length===(s.api==='simple'?0:1)&&r.after?.issued?.length===1):empty(r.after)),replay:replayed(s,r.replay),ownership:r.ownership===true,fixture:f?.first===true&&f?.duplicate===false&&same(f.taken,{id:'fixture'})&&f?.replay===null&&f?.prepare===true&&same(f.claim,{id:'prepared'})&&f?.claimReplay===null&&same(f.state,{ready:[],prepared:[],issued:['fixture']}),infrastructure:result.status==='returned'};
 return {id:s.id,result,checks,correct:Object.values(checks).every(x=>x===true)};
}
export const rescore=rows=>rows.map((r,i)=>assess(scenarios[i],r.result));
export function metrics(rows){const rate=(key,filter=()=>true)=>{const rs=rows.filter((r,i)=>filter(scenarios[i]));return rs.filter(r=>r.checks[key]).length/rs.length;};return {unsafeRepairExecutionRate:1-rate('repair',s=>s.repair),mutationBlockAccuracy:rate('mutation',s=>s.mutation),controlAccuracy:rate('control'),unchangedAccuracy:rate('unchanged',s=>s.allow),unavailableAccuracy:rate('unavailable',s=>s.kind==='unavailable'),consumptionAccuracy:rate('consumption'),lifecycleAccuracy:rate('lifecycle'),replayBlockRate:rate('replay'),ownershipAccuracy:rate('ownership'),fixtureAccuracy:rate('fixture'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=scores=>same(scores,thresholds);
