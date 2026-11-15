import {isDeepStrictEqual as eq} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
const execute={status:'execute',retryable:false},retry={status:'not_executed',retryable:true,reason:'not_started'};
const blocked=(reason,retryable=false)=>({status:'blocked',retryable,reason});
const started={status:'indeterminate',retryable:false,reason:'effect_started'};
function approval(a){return a?.requested?.approval?.event==='requested'&&a.requested.exitCode===2&&a.consumed?.approval?.event==='consumed'&&a.consumed.exitCode===0;}
function lifecycle(r,first,alreadyStarted=false){return eq(r?.finalized,first)&&eq(r?.resolved,alreadyStarted?started:retry)&&eq(r?.begin,alreadyStarted?blocked('effect_started'):execute)&&eq(r?.replay,blocked('effect_started'));}
export function assess(s,result){
 const r=result.response,valid=result.status==='returned',f=r.fixture;
 const fixture=valid&&f.first===true&&f.duplicate===false&&f.prepared===true&&eq(f.claimed,{id:'fixture',signature:'fixture'})&&f.claimReplay===null&&f.samePrepare===true&&f.foreignPrepare===false&&eq(f.beforeForeign,f.afterForeign)&&f.burned===true&&f.startAfterBurn===false&&f.start===true&&f.startReplay===false&&f.state.effects[0]?.state==='burned';
 let isolation=true,decision=true,owner=true,challenger=true,control=true,consumption=false,setup=false;
 if(valid&&s.arm==='collision'){
  const v=r.before.effects[0],c=r.before.ready[0];
  setup=r.prepareValue===false&&r.before.effects.length===1&&r.before.ready.length===1&&v.permit.id===r.victim.permit.id&&c.id===r.contender.permit.id&&c.id!==v.permit.id&&(s.binding==='same'?c.approvalId===v.permit.approvalId:c.approvalId!==v.permit.approvalId)&&v.state===(s.occupancy==='started'?'started':'authorized')&&v.claimed===(s.occupancy!=='unclaimed')&&(s.occupancy==='unclaimed'?r.initial.prepared===true:eq(r.initial.finalized,execute))&&(s.occupancy!=='started'||eq(r.initial.begin,execute));
  isolation=eq(r.before,r.after)&&!r.challengerOperations.some(o=>['claim','burn','begin'].includes(o.op));
  decision=eq(r.result,blocked('not_taken',true));
  owner=lifecycle(r.ownerRecovery,s.occupancy==='unclaimed'?execute:blocked('not_taken'),s.occupancy==='started')&&r.ownerRecovery.state.effects[0]?.state==='started';
  challenger=lifecycle(r.challengerRecovery,execute)&&r.challengerRecovery.state.ready.length===0&&r.challengerRecovery.state.effects.length===2&&r.challengerRecovery.state.effects.find(e=>e.operationId==='op_contender')?.state==='started';
  consumption=approval(r.victim.approval)&&approval(r.contender.approval);
 }else if(valid){
  const unavailable=s.ack==='unavailable';setup=r.prepareValue===true;
  control=eq(r.result,unavailable?{status:'indeterminate',retryable:false,reason:'status_unavailable'}:execute)&&r.after.effects[0]?.state==='authorized'&&r.after.effects[0]?.claimed===!unavailable&&(!unavailable||!r.initialOperations.some(o=>['claim','burn','begin'].includes(o.op)))&&lifecycle(r.recovery,unavailable?execute:blocked('not_taken'))&&r.recovery.state.effects[0]?.state==='started';
  consumption=approval(r.approval);
 }
 const checks={isolation,decision,owner,challenger,control,consumption,fixture:fixture&&setup,infrastructure:valid};
 return {id:s.id,result,checks,correct:Object.values(checks).every(Boolean)};
}
export const rescore=rows=>rows.map((r,i)=>assess(scenarios[i],r.result));
export function metrics(rows){const collisions=rows.filter((_,i)=>scenarios[i].arm==='collision'),controls=rows.filter((_,i)=>scenarios[i].arm==='control'),frac=(xs,k)=>xs.filter(r=>r.checks[k]).length/xs.length;return {foreignMutationRate:1-frac(collisions,'isolation'),collisionDecisionAccuracy:frac(collisions,'decision'),ownerRecoveryAccuracy:frac(collisions,'owner'),challengerRecoveryAccuracy:frac(collisions,'challenger'),sameOwnerControlAccuracy:frac(controls,'control'),approvalConsumptionAccuracy:frac(rows,'consumption'),fixtureAccuracy:frac(rows,'fixture'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>eq(m,thresholds);
