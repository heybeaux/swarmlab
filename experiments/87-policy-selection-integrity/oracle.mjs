import {isDeepStrictEqual as eq} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
function approval(a){return a?.requested?.approval?.event==='requested'&&a.requested.exitCode===2&&a.consumed?.approval?.event==='consumed'&&a.consumed.exitCode===0;}
export function assess(s,result){
 const r=result.response,valid=result.status==='returned',f=r.fixture,p=r.policyFixture;
 const fixture=valid&&f.first===true&&f.duplicate===false&&f.prepared===true&&eq(f.claimed,{id:'fixture',signature:'fixture'})&&f.claimReplay===null&&f.samePrepare===true&&f.foreignPrepare===false&&eq(f.beforeForeign,f.afterForeign)&&f.burned===true&&f.startAfterBurn===false&&f.start===true&&f.startReplay===false&&p.first===true&&p.duplicate===false&&eq(p.original,p.retained)&&p.retained.permitId==='permit_probe'&&r.a.permit.id!==r.b.permit.id&&(s.mode!=='foreign'||(s.binding==='same'?r.a.permit.approvalId===r.b.permit.approvalId:r.a.permit.approvalId!==r.b.permit.approvalId))&&eq(r.initial,s.mode==='foreign'?r.foreign:s.mode==='duplicate'?r.entry:null);
 const retained=valid?r.after[0]:undefined;
 const honest=valid&&(r.result===null||(eq(r.result,r.entry)&&eq(r.result,retained)));
 const rejection=s.arm!=='hazard'||(valid&&r.result===null);
 const positive=s.arm!=='positive'||(valid&&eq(r.result,r.entry));
 const conflict=s.arm!=='conflict'||(valid&&r.result===null);
 const isolation=valid&&eq(r.after,[s.mode==='foreign'?r.foreign:r.entry])&&(s.mode!=='foreign'||eq(r.before,r.after))&&r.selectionOperations.filter(x=>x.op==='bind').length===1&&eq(r.selectionOperations.find(x=>x.op==='bind').marker,r.entry);
 const recovery=valid&&eq(r.recovery,s.mode==='foreign'?null:r.entry)&&eq(r.unrelated,{...r.entry,operationId:'op_unrelated'});
 const ownership=valid&&r.callerMutable===true&&r.callerUnchanged===true&&r.detached===true;
 const checks={honest,rejection,positive,conflict,isolation,recovery,ownership,consumption:valid&&approval(r.a.approval)&&approval(r.b.approval),fixture,infrastructure:valid};
 return {id:s.id,result,checks,correct:Object.values(checks).every(Boolean)};
}
export const rescore=rows=>rows.map((r,i)=>assess(scenarios[i],r.result));
export function metrics(rows){const arm=a=>rows.filter((_,i)=>scenarios[i].arm===a),frac=(xs,k)=>xs.filter(r=>r.checks[k]).length/xs.length;return {falseReceiptRate:1-frac(rows,'honest'),hazardRejectionAccuracy:frac(arm('hazard'),'rejection'),positiveAccuracy:frac(arm('positive'),'positive'),conflictControlAccuracy:frac(arm('conflict'),'conflict'),storageIsolationAccuracy:frac(rows,'isolation'),recoveryAccuracy:frac(rows,'recovery'),callerOwnershipAccuracy:frac(rows,'ownership'),approvalConsumptionAccuracy:frac(rows,'consumption'),fixtureAccuracy:frac(rows,'fixture'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>eq(m,thresholds);
