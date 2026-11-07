import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
const consumed=a=>a?.requested?.exitCode===2&&a?.requested?.approval?.event==='requested'&&a?.consumed?.exitCode===0&&a?.consumed?.approval?.event==='consumed';
export function assess(s,result){const r=result.response??{},cs=r.creations??[],accept=cs.map(c=>c.accepted),ex=r.executions??[],state=r.beforeReplay;
 const accepts={'normal-control':[true],'precommit-retry':[false,true],'ack-loss':[true],'reconnect-recovery':[false,true],'concurrent-recovery':[false,true,true],'spent-recovery':[true,false],'revoked-recovery':[false,true,false],'stale-handle-fresh':[false,true,true],'missing-capability':[false]};
 const expectedExecutions={'normal-control':[true],'precommit-retry':[true],'ack-loss':[true],'reconnect-recovery':[true],'concurrent-recovery':[true,false],'spent-recovery':[true],'revoked-recovery':[false],'stale-handle-fresh':[true,true]};
 const recovered=cs.filter(c=>c.accepted),sameOriginal=!s.recovery||(recovered.length>0&&recovered[0].permit.id===r.originalRecord?.id);
 const fresh=s.kind!=='stale-handle-fresh'||(consumed(r.freshApproval)&&r.stale===false&&cs[1]?.permit?.id!==cs[2]?.permit?.id);
 const readyExpected=(s.readHazard||s.kind==='default-no-recovery')?1:0,issuedExpected=s.kind==='missing-capability'?0:s.kind==='stale-handle-fresh'?2:1;
 const lifecycle=same(accept,accepts[s.kind]??[false,false])&&same(ex,expectedExecutions[s.kind]??[])&&sameOriginal&&fresh&&state?.ready?.length===readyExpected&&state?.issued?.length===issuedExpected&&r.ownership===true;
 const f=r.fixture,c=r.control;
 const checks={recovery:!s.recovery||lifecycle,duplicate:s.kind!=='concurrent-recovery'||ex.filter(x=>x===true).length<=1,readback:!s.readHazard||cs.at(-1)?.accepted===false,refusal:s.kind!=='missing-capability'||(same(accept,[false])&&r.operations?.length===0),lifecycle,consumption:consumed(r.approval),replay:Array.isArray(r.replays)&&r.replays.every(x=>x===false),control:c?.first?.accepted===false&&c?.retry?.accepted===false&&c?.after?.ready?.length===1&&c?.after?.issued?.length===1&&c?.operations?.every(x=>x.op==='createOnce'),fixture:f?.unmarked===null&&f?.first===true&&same(f.read,{id:'fixture'})&&same(f.taken,{id:'fixture'})&&f?.spent===null&&f?.reissue===false&&same(f.after,{ready:[],issued:['fixture']}),infrastructure:result.status==='returned'};
 return {id:s.id,result,checks,correct:Object.values(checks).every(x=>x===true)};
}
export const rescore=rows=>rows.map((r,i)=>assess(scenarios[i],r.result));
export function metrics(rows){const rate=(key,filter=()=>true)=>{const selected=rows.filter((r,i)=>filter(scenarios[i]));return selected.filter(r=>r.checks[key]).length/selected.length;};return {recoveryAccuracy:rate('recovery',s=>s.recovery),duplicateExecutionRate:1-rate('duplicate',s=>s.kind==='concurrent-recovery'),unsafeReadbackAcceptanceRate:1-rate('readback',s=>s.readHazard),refusalAccuracy:rate('refusal',s=>s.kind==='missing-capability'),lifecycleAccuracy:rate('lifecycle'),consumptionAccuracy:rate('consumption'),replayBlockRate:rate('replay'),controlAccuracy:rate('control'),fixtureAccuracy:rate('fixture'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=scores=>same(scores,thresholds);
