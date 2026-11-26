import {isDeepStrictEqual as eq} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
const execute={status:'execute',retryable:false},retry={status:'not_executed',retryable:true,reason:'not_started'};
const blocked=reason=>({status:'blocked',retryable:false,reason});
export function assess(s,row){
 const r=row.response,returned=row.status==='returned';
 if(!returned)return {...row,falseDefinitive:false,checks:{infrastructure:false},correct:false};
 const uncertain=!['valid','true'].includes(s.mode),burned=['true','throw-after'].includes(s.mode);
 const expected=s.mode==='valid'?(s.api==='resolve'?retry:execute):s.mode==='true'?{status:s.api==='resolve'?'not_executed':'blocked',retryable:false,reason:'invalid_snapshot'}:{status:'indeterminate',retryable:false,reason:s.api==='resolve'?'journal_unavailable':'status_unavailable'};
 const outcome=eq(r.result,expected),stateName=burned?'burned':s.mode==='valid'&&s.api==='begin'?'started':'authorized';
 const effect=r.after.effects[0],state=r.after.ready.length===0&&r.after.effects.length===1&&effect.state===stateName&&effect.claimed===true&&effect.operationId==='op_resume'&&eq(effect.permit,s.api==='finalize'?r.before.ready[0]:r.before.effects[0].permit)&&r.burns.length===(s.mode==='valid'?0:1)&&(s.api==='finalize'?r.finalized===null:eq(r.finalized,execute));
 const probe=eq(r.probe,stateName==='authorized'?execute:blocked(burned?'authorization_burned':'effect_started'))&&eq(r.probeAgain,blocked(burned?'authorization_burned':'effect_started'))&&r.afterProbe.effects[0].state===(burned?'burned':'started');
 const c=r.control,f=r.fixture;
 const paired=eq(c.finalized,execute)&&eq(c.resolved,retry)&&eq(c.begin,execute)&&eq(c.replay,blocked('effect_started'))&&c.state.effects[0]?.state==='started';
 const fixture=f.first===true&&f.duplicate===false&&f.prepared===true&&eq(f.claimed,{id:'fixture',signature:'fixture'})&&f.claimReplay===null&&f.burned===true&&f.startAfterBurn===false&&f.start===true&&f.startReplay===false&&f.state.effects[0]?.state==='burned';
 const approval=r.approval.requested.approval?.event==='requested'&&r.approval.requested.exitCode===2&&r.approval.consumed.approval?.event==='consumed'&&r.approval.consumed.exitCode===0;
 const ownership=eq(r.entry,r.live)&&r.ownership===true;
 const ack=s.mode==='valid'?r.burns.length===0:eq(r.burns,[{mode:s.mode,value:({true:true,false:false,string:'false',number:1,object:{ok:false},array:[],null:null,'throw-after':true})[s.mode],committed:burned}]);
 const checks={outcome,state:state&&ack,probe,paired,fixture,approval,ownership,infrastructure:returned};
 return {...row,falseDefinitive:uncertain&&r.result.reason==='invalid_snapshot',checks,correct:Object.values(checks).every(Boolean)};
}
export function metrics(rows){const select=f=>rows.filter((_,i)=>f(scenarios[i])),fraction=(xs,key)=>xs.filter(r=>r.checks[key]===true).length/xs.length,uncertain=select(s=>!['valid','true'].includes(s.mode));return {falseDefinitiveRate:uncertain.filter(r=>r.falseDefinitive).length/uncertain.length,uncertaintyAccuracy:fraction(uncertain,'outcome'),confirmedBurnAccuracy:fraction(select(s=>s.mode==='true'),'outcome'),validAccuracy:fraction(select(s=>s.mode==='valid'),'outcome'),stateAccuracy:fraction(rows,'state'),probeAccuracy:fraction(rows,'probe'),pairedControlAccuracy:fraction(rows,'paired'),approvalAccuracy:fraction(rows,'approval'),fixtureAccuracy:fraction(rows,'fixture'),ownershipAccuracy:fraction(rows,'ownership'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};}
export const passing=m=>eq(m,thresholds);
