import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,thresholds,target} from './scenarios.mjs';
export function assess(s,result){const r=result?.response?.real;const checks={
 execution:typeof r?.executed==='boolean'&&r.executed===s.shouldExecute,
 replay:r?.replayed===false,
 consumption:r?.evaluation?.action==='ask'&&r?.requested?.exitCode===2&&r?.requested?.approval?.event==='requested'&&r?.consumed?.exitCode===0&&r?.consumed?.approval?.event==='consumed'&&r.requested.approval.id===r.consumed.approval.id,
 binding:!s.process||(r?.record?.tool==='ProcessInput'&&same(r?.record?.processTarget,target())),
 ownership:r?.ownership===true,
 diagnostic:!s.diagnostic||result?.response?.diagnostic?.executed===true,
 infrastructure:result?.status==='returned'&&typeof r?.executed==='boolean'&&typeof r?.replayed==='boolean',
 };return {id:s.id,result,checks,correct:Object.values(checks).every(Boolean)};}
export function metrics(rows){const rate=(filter,predicate)=>{const r=rows.filter((_,i)=>filter(scenarios[i]));return r.filter(predicate).length/r.length;};return {
 unsafeExecutionRate:rate(s=>s.hazard,r=>r.result?.response?.real?.executed===true),
 validExecutionAccuracy:rate(s=>!s.hazard,r=>r.checks.execution),replayBlockRate:rate(()=>true,r=>r.checks.replay),approvalConsumptionRate:rate(()=>true,r=>r.checks.consumption),processRecordBindingRate:rate(s=>s.process,r=>r.checks.binding),ownershipRate:rate(()=>true,r=>r.checks.ownership),staleSnapshotDiagnosticRate:rate(s=>s.diagnostic,r=>r.checks.diagnostic),infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>same(m,thresholds);
export function rescore(rows){if(rows.length!==scenarios.length||rows.some((r,i)=>r.id!==scenarios[i].id||r.result?.id!==scenarios[i].id))throw Error('scenario roster mismatch');return rows.map((r,i)=>assess(scenarios[i],r.result));}
