import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
const consumed=r=>same(r,{exitCode:0,event:'consumed'}),blocked=r=>same(r,{exitCode:2,event:'requested'});
export function assess(s,result){const r=result?.response?.real;const checks={
 hazard:s.kind!=='hazard'||blocked(r?.first),
 validRetry:s.kind!=='control'||(consumed(r?.first)&&blocked(r?.repeat)&&!r?.retained&&r?.sameRetryIdentity===true),
 retained:s.kind!=='hazard'||!s.validOrigin||(r?.retained===true&&consumed(r?.recovery)&&blocked(r?.repeat)),
 identity:s.kind!=='identity'||(r?.identity?.changedSignature===true&&r?.identity?.changedKey===true&&r?.identity?.cloneSignature===true&&r?.identity?.cloneKey===true),
 ownership:r?.ownership===true,
 deny:same(r?.deny,{action:'deny',hits:['lab.deny'],exitCode:2}),
 recovery:r?.benignRecovery==='allow',
 infrastructure:result?.status==='returned'&&r?.initialAction==='ask'&&r?.retryAction==='ask'&&!!result.response.sessionOnly,
 };return {id:s.id,kind:s.kind,result,checks,correct:Object.values(checks).every(Boolean)};}
export function metrics(rows){const hazards=rows.filter(r=>r.kind==='hazard'),controls=rows.filter(r=>r.kind==='control'),ids=rows.filter(r=>r.kind==='identity'),recovery=rows.filter((r,i)=>scenarios[i].validOrigin);const rate=(rs,fn)=>rs.filter(fn).length/rs.length;return {unsafeConsumptionRate:rate(hazards,r=>consumed(r.result?.response?.real?.first)),hazardRejectionRate:rate(hazards,r=>r.checks.hazard),validRetryAccuracy:rate(controls,r=>r.checks.validRetry),retainedApprovalRecovery:rate(recovery,r=>r.checks.retained),identityIsolation:rate(ids,r=>r.checks.identity),ownershipRate:rate(rows,r=>r.checks.ownership),denyPreservation:rate(rows,r=>r.checks.deny),recoveryRate:rate(rows,r=>r.checks.recovery),infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>same(m,thresholds);
export function rescore(rows){if(rows.length!==scenarios.length||rows.some((r,i)=>r.id!==scenarios[i].id||r.result?.id!==scenarios[i].id))throw Error('scenario mismatch');return rows.map((r,i)=>assess(scenarios[i],r.result));}
