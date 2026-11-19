import {isDeepStrictEqual as eq} from 'node:util';
import {createHash} from 'node:crypto';
import {scenarios,thresholds} from './scenarios.mjs';
const blocked={status:'blocked',retryable:false,reason:'policy_lifecycle_inconsistent'},unavailable={status:'indeterminate',retryable:false,reason:'policy_unavailable'};
const terminal=o=>({status:'retired',retryable:false,reason:`effect_${o}`});
function expectedProof(s,p){const operationId='op_late_resolution',receiptDigest=`sha256:${'a'.repeat(64)}`,terminalRevision=3,outcome=s.outcome;
 if(s.route==='retired')return {operationId,permitId:p.id,approvalId:p.approvalId,status:'retired',outcome,receiptDigest,terminalRevision};
 const checkpointDigest=`sha256:${createHash('sha256').update(JSON.stringify({approvalId:p.approvalId,operationId,outcome,permitId:p.id,receiptDigest,terminalRevision})).digest('hex')}`;
 return {operationId,status:'retirement_compacted',outcome,receiptDigest,terminalRevision,checkpointDigest,verified:true};}
const approval=a=>a?.requested?.exitCode===2&&a.requested.approval?.event==='requested'&&a.consumed?.exitCode===0&&a.consumed.approval?.event==='consumed'&&a.requested.approval.id===a.consumed.approval.id;
export function assess(s,result){
 const keys=['honest','rejection','positive','conflict','outage','begin','isolation','recovery','ownership','consumption','fixture','infrastructure'];
 if(result.status!=='returned')return {id:s.id,result,checks:Object.fromEntries(keys.map(k=>[k,false])),correct:false};
 const r=result.response,p=r.a.permit,q=r.b.permit,foreign=s.mode.startsWith('foreign'),record=expectedProof(s,foreign?q:p),{status,...fields}=record;
 const auth=s.route==='retired'?[]:['authority-A','authority-B'].map(authorityId=>({authorityId,...fields}));
 const f=r.fixture,obs=r.observed,all=[obs,r.begin,r.recovery,r.control];
 const fixture=f.first===true&&f.duplicate===false&&f.prepared===true&&eq(f.claimed,{id:'fixture',signature:'fixture'})&&f.claimReplay===null&&f.samePrepare===true&&f.foreignPrepare===false&&eq(f.beforeForeign,f.afterForeign)&&f.burned===true&&f.startAfterBurn===false&&f.start===true&&f.startReplay===false&&r.detachedRead===true&&p.id!==q.id&&p.approvalId!==q.approvalId&&r.a.record.id===p.id&&r.b.record.id===q.id&&eq(r.record,record)&&eq(r.authorities,auth)&&all.every(x=>x.calls[0]?.phase==='read');
 const checks={honest:obs.result.status!=='retired'||(!foreign&&eq(obs.result,terminal(s.outcome))),rejection:s.arm!=='hazard'||eq(obs.result,blocked),positive:s.arm!=='positive'||eq(obs.result,terminal(s.outcome)),conflict:s.arm!=='conflict'||eq(obs.result,blocked),outage:s.arm!=='outage'||eq(obs.result,unavailable),begin:eq(r.begin.result,s.arm==='outage'?unavailable:blocked),isolation:all.every(x=>eq(x.before,x.after))&&eq(obs.after,record),recovery:eq(r.recovery.result,foreign?blocked:terminal(s.outcome))&&eq(r.control.result,terminal(s.outcome)),ownership:all.every(x=>x.callerMutable===true&&x.callerUnchanged===true),consumption:approval(r.a.approval)&&approval(r.b.approval),fixture,infrastructure:true};
 return {id:s.id,result,checks,correct:Object.values(checks).every(Boolean)};
}
export const rescore=rows=>rows.map((r,i)=>assess(scenarios[i],r.result));
export function metrics(rows){const frac=(xs,k)=>xs.filter(r=>r.checks[k]).length/xs.length,arm=a=>rows.filter((_,i)=>scenarios[i].arm===a);return {falseTerminalRate:1-frac(rows,'honest'),hazardRejectionAccuracy:frac(arm('hazard'),'rejection'),positiveAccuracy:frac(arm('positive'),'positive'),conflictAccuracy:frac(arm('conflict'),'conflict'),outageAccuracy:frac(arm('outage'),'outage'),beginSafetyAccuracy:frac(rows,'begin'),storageIsolationAccuracy:frac(rows,'isolation'),recoveryAccuracy:frac(rows,'recovery'),callerOwnershipAccuracy:frac(rows,'ownership'),approvalConsumptionAccuracy:frac(rows,'consumption'),fixtureAccuracy:frac(rows,'fixture'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>eq(m,thresholds);
