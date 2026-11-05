import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
const consumed=a=>a?.requested?.exitCode===2&&a.requested.approval?.event==='requested'&&a.consumed?.exitCode===0&&a.consumed.approval?.event==='consumed'&&a.requested.approval.id===a.consumed.approval.id;
export function assess(s,result){const r=result?.response?.real,c=result?.response?.control;const checks={
 reissue:!s.hazard||(r?.recreation?.accepted===false&&r?.second===false),
 stale:s.kind!=='old-handle-after-fresh'||r?.stale===false,
 fresh:!s.fresh||(consumed(r?.freshApproval)&&r.freshApproval.consumed.approval.id===r.approval.consumed.approval.id&&r?.recreation?.accepted===true&&r?.second===true&&r.recreation.permit.id!==r.permit.id),
 duplicate:s.kind!=='duplicate-ready'||r?.recreation?.accepted===false,
 initial:r?.first===!s.burn,
 consumption:consumed(r?.approval)&&r?.evaluation?.action==='ask'&&(s.kind!=='failed-consume-remint'||r?.failedConsumption===false),
 replay:r?.replay===false,
 control:c?.first===!s.burn&&c?.replay===false&&c?.second===null&&consumed(c?.approval),
 ownership:r?.ownership===true&&c?.ownership===true,
 infrastructure:result?.status==='returned'&&typeof r?.first==='boolean'&&typeof r?.replay==='boolean'&&typeof c?.first==='boolean',
 };return {id:s.id,result,checks,correct:Object.values(checks).every(Boolean)};}
export function metrics(rows){const rate=(filter,test)=>{const selected=rows.filter((_,i)=>filter(scenarios[i]));return selected.filter(test).length/selected.length;};return {
 unsafeReissueExecutionRate:rate(s=>s.hazard,r=>r.result?.response?.real?.second===true),staleHandleExecutionRate:rate(s=>s.kind==='old-handle-after-fresh',r=>r.result?.response?.real?.stale===true),freshApprovalAccuracy:rate(s=>s.fresh,r=>r.checks.fresh),duplicateReadyBlockRate:rate(s=>s.kind==='duplicate-ready',r=>r.checks.duplicate),initialLifecycleAccuracy:rate(()=>true,r=>r.checks.initial),approvalConsumptionRate:rate(()=>true,r=>r.checks.consumption),finalReplayBlockRate:rate(()=>true,r=>r.checks.replay),hostControlAccuracy:rate(()=>true,r=>r.checks.control),ownershipRate:rate(()=>true,r=>r.checks.ownership),scenarioAccuracy:rate(()=>true,r=>r.correct),infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>same(m,thresholds);
export function rescore(rows){if(rows.length!==scenarios.length||rows.some((r,i)=>r.id!==scenarios[i].id||r.result?.id!==scenarios[i].id))throw Error('scenario roster mismatch');return rows.map((r,i)=>assess(scenarios[i],r.result));}
