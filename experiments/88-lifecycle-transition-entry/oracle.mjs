import {isDeepStrictEqual as eq} from 'node:util';
import {createHash} from 'node:crypto';
import {scenarios,thresholds} from './scenarios.mjs';
const success={status:'retired',retryable:false,reason:'policy_retired'},blocked={status:'blocked',retryable:false,reason:'policy_lifecycle_inconsistent'};
const digest=v=>`sha256:${createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const op='op_lifecycle',rd=`sha256:${'a'.repeat(64)}`;
const marker=p=>({operationId:op,permitId:p.id,approvalId:p.approvalId});
const retirement=(p,o)=>({...marker(p),status:'retired',outcome:o,receiptDigest:rd,terminalRevision:3});
const checkpoint=(p,o)=>({operationId:op,status:'retirement_compacted',outcome:o,receiptDigest:rd,terminalRevision:3,checkpointDigest:digest({approvalId:p.approvalId,operationId:op,outcome:o,permitId:p.id,receiptDigest:rd,terminalRevision:3}),verified:true});
function approval(a){return a?.requested?.approval?.event==='requested'&&a.requested.exitCode===2&&a.consumed?.approval?.event==='consumed'&&a.consumed.exitCode===0&&a.requested.approval.id===a.consumed.approval.id;}
export function assess(s,result){
 const r=result.response,valid=result.status==='returned';
 if(!valid)return {id:s.id,result,checks:{honest:false,rejection:false,positive:false,conflict:false,isolation:false,recovery:false,ownership:false,consumption:false,fixture:false,infrastructure:false},correct:false};
 const p=r.a.permit,q=r.b.permit,foreign=s.mode.startsWith('foreign'),target=s.api==='retire'?retirement(p,s.outcome):checkpoint(p,s.outcome);
 const start=s.api==='retire'?marker(p):retirement(p,s.outcome),foreignTarget=s.api==='retire'?retirement(q,s.outcome):checkpoint(q,s.outcome);
 const expectedBefore=s.mode==='foreign-journal'?marker(q):s.mode==='foreign-retained'?foreignTarget:s.mode==='duplicate'?target:start;
 const f=r.fixture,l=r.lifecycleFixture,j=r.journalTruth,jp=s.mode==='foreign-journal'?q:p,jr=s.mode==='foreign-journal'?r.b.record:r.a.record;
 const receipt={...marker(jp),receiptDigest:rd,verified:true,...(s.outcome==='failed'?{failureCode:'verified_failure'}:{})};
 const expectedJournal={operationId:op,permit:jr,state:s.outcome,claimed:true,revision:3,[s.outcome==='committed'?'successReceipt':'failureReceipt']:receipt};
 const fixture=f.first===true&&f.duplicate===false&&f.prepared===true&&eq(f.claimed,{id:'fixture',signature:'fixture'})&&f.claimReplay===null&&f.samePrepare===true&&f.foreignPrepare===false&&eq(f.beforeForeign,f.afterForeign)&&f.burned===true&&f.startAfterBurn===false&&f.start===true&&f.startReplay===false&&l.foreign===false&&eq(l.afterForeign,marker(p))&&l.first===true&&l.duplicate===false&&eq(l.afterRead,retirement(p,s.outcome))&&l.compactFirst===true&&l.compactDuplicate===false&&eq(l.afterCompact,checkpoint(p,s.outcome))&&p.id!==q.id&&p.approvalId!==q.approvalId&&r.a.record.id===p.id&&r.b.record.id===q.id&&eq(j,expectedJournal)&&eq(r.before,expectedBefore)&&eq(r.entryTarget,target)&&eq(r.entryStart,start)&&eq(r.foreignTarget,foreignTarget);
 const cas=r.operations.filter(x=>x.kind==='retire'||x.kind==='compact');
 const isolation=eq(r.after,foreign?expectedBefore:target)&&(s.mode!=='foreign-journal'||cas.length===0)&&cas.every(c=>eq(c.expected,start)&&eq(c.next,target));
 const checks={honest:r.result.status!=='retired'||eq(r.after,target),rejection:s.arm!=='hazard'||eq(r.result,blocked),positive:s.arm!=='positive'||eq(r.result,success),conflict:s.arm!=='conflict'||eq(r.result,blocked),isolation,recovery:eq(r.recovery,foreign?blocked:success)&&eq(r.control,success),ownership:r.callerMutable===true&&r.callerUnchanged===true,consumption:approval(r.a.approval)&&approval(r.b.approval),fixture,infrastructure:true};
 return {id:s.id,result,checks,correct:Object.values(checks).every(Boolean)};
}
export const rescore=rows=>rows.map((r,i)=>assess(scenarios[i],r.result));
export function metrics(rows){const arm=a=>rows.filter((_,i)=>scenarios[i].arm===a),frac=(xs,k)=>xs.filter(r=>r.checks[k]).length/xs.length;return {falseAttestationRate:1-frac(rows,'honest'),hazardRejectionAccuracy:frac(arm('hazard'),'rejection'),positiveAccuracy:frac(arm('positive'),'positive'),conflictAccuracy:frac(arm('conflict'),'conflict'),transitionIsolationAccuracy:frac(rows,'isolation'),recoveryAccuracy:frac(rows,'recovery'),callerOwnershipAccuracy:frac(rows,'ownership'),approvalConsumptionAccuracy:frac(rows,'consumption'),fixtureAccuracy:frac(rows,'fixture'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>eq(m,thresholds);
