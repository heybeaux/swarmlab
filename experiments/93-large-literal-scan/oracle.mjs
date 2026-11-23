import {isDeepStrictEqual as equal} from 'node:util';
import {thresholds} from './scenarios.mjs';
export function assess(s,r){
 const e=r.response?.evaluation, admission=!!e&&/substring.*(budget|admission)/i.test(e.reason);
 const expectedAction=admission&&s.expected.action==='allow'?'ask':s.expected.action;
 const checks={returned:r.status==='ok'&&r.evaluated===true&&!r.response?.error,bounded:r.response?.elapsedMs<=1500,action:e?.action===expectedAction,hits:equal(e?.matches?.map(h=>h.id),s.expected.hits),admission:!admission||s.expected.mayAdmit,ownership:r.response?.ownership===true,recovery:r.response?.recovered===true,input:r.input?.length===s.length&&/^sha256:[a-f0-9]{64}$/.test(r.input?.sha256??'')};
 return {id:s.id,kind:s.kind,observation:r,checks,correct:Object.values(checks).every(Boolean)};
}
export function metrics(rows){const rate=k=>{const xs=rows.filter(r=>r.kind===k);return xs.filter(r=>r.correct).length/xs.length;};return {stressAccuracy:rate('stress'),pairedControlAccuracy:rate('paired'),controlAccuracy:rate('control'),scenarioAccuracy:rows.filter(r=>r.correct).length/rows.length,runtimeFailureRate:rows.filter(r=>['runtime-exit','watchdog','runtime-error'].includes(r.observation.status)).length/rows.length,infrastructureFailures:rows.filter(r=>r.observation.status==='infrastructure-error').length};}
export const passing=scores=>equal(scores,thresholds);
