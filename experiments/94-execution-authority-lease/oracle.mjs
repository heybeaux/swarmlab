import {isDeepStrictEqual as same} from 'node:util';
import {thresholds} from './scenarios.mjs';
export const executes=r=>r===true||(r?.status==='execute'&&r?.retryable===false);
export function assess(s,row){
 const r=row.response??{},ok=row.status==='returned';
 const expected=s.allow?(s.api==='simple'?true:{status:'execute',retryable:false}):s.api==='simple'?false:s.kind==='store-unavailable'?{status:'indeterminate',retryable:false,reason:'status_unavailable'}:{status:'blocked',retryable:false,reason:'invalid_snapshot'};
 const f=r.fixture;
 const fixture=!!f&&same(f,{first:true,duplicate:false,taken:{id:'fixture'},replay:null,remint:false,state:{ready:[],prepared:[],issued:['fixture']}});
 const canRemain=['deadline-nan','deadline-fraction','clock-invalid-entry'].includes(s.kind);
 const lifecycle=ok&&(canRemain||(r.afterReplay?.ready?.length===0&&r.afterReplay?.prepared?.length===0))&&(s.kind!=='store-unavailable'||(r.after.ready.length===(s.api==='simple'?1:0)&&r.after.prepared.length===(s.api==='simple'?0:1)));
 const checks={outcome:ok&&same(r.result,expected)&&lifecycle,control:ok&&executes(r.control?.result)&&!executes(r.control?.replay)&&r.control.after.ready.length===0&&r.control.after.prepared.length===0,replay:ok&&!executes(r.replay),ownership:ok&&r.ownership===true,approval:ok&&r.evaluation?.action==='ask'&&r.approval?.requested?.exitCode===2&&r.approval?.requested?.approval?.event==='requested'&&r.approval?.consumed?.exitCode===0&&r.approval?.consumed?.approval?.event==='consumed',fixture:ok&&fixture,recovery:ok&&(s.kind!=='store-unavailable'||!executes(r.recovery))};
 return {...row,checks,correct:Object.values(checks).every(Boolean)};
}
export function metrics(rows){
 const mean=fn=>rows.filter(fn).length/rows.length;
 const hazards=rows.filter(r=>!['fresh','boundary','legacy','store-unavailable'].some(k=>r.id.endsWith(`-${k}`)));
 return {unsafeExecutionRate:hazards.filter(r=>executes(r.response?.result)).length/hazards.length,scenarioAccuracy:mean(r=>r.correct),pairedControlAccuracy:mean(r=>r.checks.control),replaySafety:mean(r=>r.checks.replay),ownershipAccuracy:mean(r=>r.checks.ownership),approvalCoverage:mean(r=>r.checks.approval),fixtureAccuracy:mean(r=>r.checks.fixture),recoverySafety:mean(r=>r.checks.recovery),infrastructureFailures:rows.filter(r=>r.status!=='returned').length};
}
export const passing=scores=>Object.entries(thresholds).every(([k,v])=>scores[k]===v);
