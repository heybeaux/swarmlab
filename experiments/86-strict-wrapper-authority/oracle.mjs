import {isDeepStrictEqual as eq} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
const execute={status:'execute',retryable:false},retry={status:'not_executed',retryable:true,reason:'not_started'};
const blocked=reason=>({status:'blocked',retryable:false,reason});
export function assess(s,result){
 const r=result.response,valid=result.status==='returned',f=r.fixture;
 const fixture=valid&&f.first===true&&f.duplicate===false&&f.prepared===true&&eq(f.claimed,{id:'fixture',signature:'fixture'})&&f.claimReplay===null&&f.samePrepare===true&&f.foreignPrepare===false&&eq(f.beforeForeign,f.afterForeign)&&f.burned===true&&f.startAfterBurn===false&&f.start===true&&f.startReplay===false;
 const resolve=s.api.endsWith('resolve'),positive=s.arm==='positive',pre=s.arm==='preflight',post=s.arm==='postflight';
 const a=r.approval,consumption=valid&&a?.requested?.approval?.event==='requested'&&a.requested.exitCode===2&&a.consumed?.approval?.event==='consumed'&&a.consumed.exitCode===0;
 const setup=valid&&eq(r.finalized,execute)&&r.before.effects[0]?.state==='authorized'&&r.before.effects[0]?.claimed===true&&eq(r.selected,{operationId:'op_strict',permitId:r.entry.permit.id,approvalId:r.entry.permit.approvalId});
 const permission=valid&&(r.result.status==='execute'||r.result.retryable===true);
 const preflight=!pre||(valid&&eq(r.result,{status:resolve?'not_executed':'blocked',retryable:false,reason:'invalid_snapshot'})&&r.after.effects[0]?.state==='burned'&&!r.operations.some(o=>o.op==='begin'));
 const postflight=!post||(valid&&eq(r.result,blocked('invalid_snapshot'))&&r.after.effects[0]?.state==='started'&&r.operations.filter(o=>o.op==='begin').length===1&&!r.operations.some(o=>o.op==='burn'));
 const positives=!positive||(valid&&eq(r.result,resolve?retry:execute)&&r.after.effects[0]?.state===(resolve?'authorized':'started'));
 const recovery=valid&&eq(r.recovery,pre?blocked('authorization_burned'):positive&&resolve?execute:blocked('effect_started'))&&eq(r.replay,blocked(pre?'authorization_burned':'effect_started'));
 const c=r.control,control=valid&&eq(c.result,resolve?retry:execute)&&eq(c.begin,execute)&&eq(c.replay,blocked('effect_started'))&&c.state.effects[0]?.state==='started';
 const expected=valid&&structuredClone(r.entry);if(valid){if(s.mode.startsWith('repair')){expected.current.revoked=false;expected.current.links[0].revoked=false;}if(s.mode==='post-revoke')expected.current.revoked=true;}
 const ownership=valid&&eq(r.live,expected);
 const injected=valid&&(s.mode==='post-revoke'?r.mutations.some(m=>m.kind==='roster'&&m.rosters===4&&m.current.revoked):s.mode==='post-revoke-restored'?r.mutations.some(m=>m.kind==='marker'&&m.markers===2&&m.current.revoked)&&r.mutations.some(m=>m.kind==='roster'&&m.rosters===4&&!m.current.revoked):s.mode==='pre-revoke-restored'?r.mutations.some(m=>m.kind==='marker'&&m.markers===1&&m.current.revoked)&&r.mutations.some(m=>m.kind==='roster'&&m.rosters===1&&!m.current.revoked):true);
 const checks={safe:positive||!permission,preflight,postflight,positive:positives,recovery,control,consumption,fixture:fixture&&setup&&injected,ownership,infrastructure:valid};
 return {id:s.id,result,checks,correct:Object.values(checks).every(Boolean)};
}
export const rescore=rows=>rows.map((r,i)=>assess(scenarios[i],r.result));
export function metrics(rows){const subset=arm=>rows.filter((_,i)=>scenarios[i].arm===arm),frac=(xs,k)=>xs.filter(r=>r.checks[k]).length/xs.length;return {unsafePermissionRate:1-frac(rows.filter((_,i)=>scenarios[i].arm!=='positive'),'safe'),preflightInvalidationAccuracy:frac(subset('preflight'),'preflight'),postflightFenceAccuracy:frac(subset('postflight'),'postflight'),positiveAccuracy:frac(subset('positive'),'positive'),recoverySafety:frac(rows,'recovery'),controlAccuracy:frac(rows,'control'),approvalConsumptionAccuracy:frac(rows,'consumption'),fixtureAccuracy:frac(rows,'fixture'),ownershipAccuracy:frac(rows,'ownership'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>eq(m,thresholds);
