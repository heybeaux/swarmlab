import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,negativeControls} from './scenarios.mjs';
export function assess(s,result){
 const returned=result.status==='returned',r=result.response;
 const checks={returned,classification:returned&&r?.outcome===s.expect,sourceUnchanged:returned&&r?.sourceUnchanged===true,recovery:returned&&r?.recovery===true};
 if(s.expect==='error')Object.assign(checks,{typed:returned&&r?.error?.typed===true,binding:returned&&r?.error?.packId===s.pack.packId&&r?.error?.ruleId===s.ruleId,diagnostic:returned&&r?.error?.message?.includes(s.fragment)===true});
 else Object.assign(checks,{compiled:returned&&same(r?.compiled,s.pack.rules.map(rule=>({rule,...(rule.match.kind==='regex'?{regex:{source:new RegExp(rule.match.pattern,rule.match.flags).source,flags:new RegExp(rule.match.pattern,rule.match.flags).flags}}:{})}))),semantics:returned&&r?.semantics===true,synchronous:returned&&r?.synchronous===true});
 return {id:s.id,kind:s.kind,result,checks,correct:Object.values(checks).every(Boolean)};
}
export function metrics(rows,controls){
 const hazards=rows.filter(r=>r.kind==='hazard'),safe=rows.filter(r=>r.kind==='control');
 return {aegisProbeWatchdogRate:hazards.filter(r=>r.result.status==='watchdog').length/5,aegisHazardRejectionRate:hazards.filter(r=>r.correct).length/5,aegisResolutionAccuracy:rows.filter(r=>r.correct).length/19,aegisControlAccuracy:safe.filter(r=>r.correct).length/14,aegisRecoveryRate:rows.filter(r=>r.checks.recovery).length/19,substringControlAccuracy:controls.filter(r=>r.correct).length/5,infrastructureFailures:[...rows,...controls].filter(r=>!['returned','watchdog'].includes(r.result.status)).length};
}
export const expected={aegisProbeWatchdogRate:0,aegisHazardRejectionRate:1,aegisResolutionAccuracy:1,aegisControlAccuracy:1,aegisRecoveryRate:1,substringControlAccuracy:1,infrastructureFailures:0};
export function assertRows(rows,controls){if(!same(rows.map(r=>r.id),scenarios.map(s=>s.id))||!same(controls.map(r=>r.id),negativeControls.map(s=>s.id)))throw Error('scenario identity/order mismatch');for(const [list,defs] of [[rows,scenarios],[controls,negativeControls]])for(let i=0;i<list.length;i++){const r=list[i],actual=assess(defs[i],r.result);if(!same(r,actual))throw Error(`oracle disagreement ${r.id}`);}}
