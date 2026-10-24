import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,thresholds} from './scenarios.mjs';
export function assess(s,result){
 const r=result.response;
 const checks={action:r?.evaluation?.action===s.expected.action,hits:same(r?.evaluation?.matches?.map(h=>h.id),s.expected.hits),ownership:r?.ownership===true,recovery:r?.recovery?.action==='allow'&&r?.recovery?.matches?.length===0,direct:s.kind!=='hazard'||(r?.direct?.action===s.expected.action&&same(r?.direct?.matches?.map(h=>h.id),s.expected.hits)),identity:s.kind!=='hazard'||(r?.identity?.signatureChanges===true&&r?.identity?.keyChanges===true&&r?.identity?.cloneStable===true),infrastructure:result.status==='returned'&&!r?.error};
 return {id:s.id,kind:s.kind,result,checks,correct:Object.values(checks).every(Boolean)};
}
export function metrics(rows){
 const hazards=rows.filter(r=>r.kind==='hazard'),controls=rows.filter(r=>r.kind==='control');
 const rate=(rs,fn)=>rs.filter(fn).length/rs.length;
 return {hazardCoverage:rate(hazards,r=>r.checks.action&&r.checks.hits),controlAccuracy:rate(controls,r=>r.checks.action&&r.checks.hits),identityCoverage:rate(hazards,r=>r.checks.identity),directAccuracy:rate(hazards,r=>r.checks.direct),ownershipRate:rate(rows,r=>r.checks.ownership),recoveryRate:rate(rows,r=>r.checks.recovery),resolutionAccuracy:rate(rows,r=>r.correct),infrastructureFailures:rows.filter(r=>!r.checks.infrastructure).length};
}
export function passing(m){return same(m,thresholds);}
export function rescore(rows){if(rows.length!==scenarios.length)throw Error('row count');return rows.map((r,i)=>assess(scenarios[i],r.result));}
