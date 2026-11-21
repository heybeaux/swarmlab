import {isDeepStrictEqual as equal} from 'node:util';
import {thresholds} from './scenarios.mjs';
export function assess(s,r) {
 const infra=r?.status==='ok';
 const effect=x=>x?.status===0 && x?.signal===null && x?.stderr==='' && x.stdout.split(/\r?\n/).includes('LAB_EFFECT');
 const shell=x=>x?.status===0 && x?.signal===null && x?.stderr==='';
 const correctBoolean=r?.implicit===s.expectedSafe && r?.explicit===s.expectedSafe;
 const checks={
   rejection:s.kind!=='hazard'||correctBoolean,
   control:s.kind!=='control'||correctBoolean,
   paired:s.kind!=='hazard'||(r?.paired?.implicit===false && r?.paired?.explicit===false && effect(r.paired.shell)),
   shell:shell(r?.shell)&&effect(r.shell)===s.expectedEffect,
   ownership:equal(r?.allowlistBefore,['echo','pwd','whoami'])&&equal(r?.allowlistAfter,r?.allowlistBefore),
   recovery:r?.recovery===true,
   infrastructure:infra,
 };
 return {id:s.id,kind:s.kind,observation:r,checks,correct:Object.values(checks).every(Boolean)};
}
export function metrics(rows) {
 const rate=(rs,key)=>rs.filter(r=>r.checks[key]).length/rs.length;
 const hazards=rows.filter(r=>r.kind==='hazard'),controls=rows.filter(r=>r.kind==='control');
 return {hazardRejectionAccuracy:rate(hazards,'rejection'),falseSafeRate:hazards.filter(r=>r.observation.implicit===true||r.observation.explicit===true).length/hazards.length,controlAccuracy:rate(controls,'control'),separatorControlAccuracy:rate(hazards,'paired'),shellGroundTruthAccuracy:rate(rows,'shell'),ownershipAccuracy:rate(rows,'ownership'),recoveryAccuracy:rate(rows,'recovery'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};
}
export const passing=scores=>equal(scores,thresholds);
