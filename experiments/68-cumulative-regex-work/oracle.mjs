import {scenarios,negativeControls,thresholds,WATCHDOG_MS} from './scenarios.mjs';
export const isDiag=s=>typeof s==='string'&&/regex/i.test(s)&&/budget|timeout|unavailable/i.test(s);
export function assess(s,r){
  const ev=r.response?.evaluation,matches=Array.isArray(ev?.matches)?ev.matches:[];
  const infra=!['returned','watchdog'].includes(r.status)||(r.status==='returned'&&!ev&&!r.response?.error);
  const diagnostic=matches.some(m=>isDiag(m?.id))||isDiag(ev?.reason);
  const hits=matches.map(m=>m?.id).filter(id=>!isDiag(id));
  const checks={
    bounded:r.status==='returned'&&typeof r.response?.elapsedMs==='number'&&r.response.elapsedMs<=WATCHDOG_MS&&!r.response.error,
    action:ev?.action===s.expected.action,
    hitsExact:JSON.stringify(hits)===JSON.stringify(s.expected.hits),
    diagnostic:diagnostic===s.expected.diagnostic,
    cumulative:(typeof ev?.reason==='string'&&/cumulative.*regex.*budget|regex.*cumulative.*budget/i.test(ev.reason))===s.expected.cumulative,
    recovered:r.response?.recovered===true,
    ownership:r.response?.ownership===true,
  };
  return {id:s.id,kind:s.kind,expected:s.expected,checks,correct:Object.values(checks).every(Boolean),watchdog:r.status==='watchdog',infrastructure:infra,result:r};
}
export function metrics(rows,controls){
  const hz=rows.filter(r=>r.kind==='hazard'),ct=rows.filter(r=>r.kind==='control'),every=[...rows,...controls];
  const rate=(xs,f)=>xs.filter(f).length/xs.length;
  return {
    aggregateWatchdogRate:rate(hz,r=>r.watchdog),
    cumulativeSafetyRate:rate(hz,r=>r.checks.bounded&&r.checks.action&&r.checks.diagnostic&&r.checks.cumulative&&r.checks.hitsExact),
    resolutionAccuracy:rate(rows,r=>r.correct),
    controlAccuracy:rate(ct,r=>r.correct),
    recoveryRate:rate(rows,r=>r.checks.recovered),
    ownershipRate:rate(rows,r=>r.checks.ownership),
    linearControlAccuracy:rate(controls,r=>r.correct),
    infrastructureFailures:every.filter(r=>r.infrastructure).length,
  };
}
export const expected=thresholds;
export function assertRows(rows,controls){
  if(JSON.stringify(rows.map(r=>r.id))!==JSON.stringify(scenarios.map(s=>s.id)))throw Error('scenario roster drift');
  if(JSON.stringify(controls.map(r=>r.id))!==JSON.stringify(negativeControls.map(s=>s.id)))throw Error('negative-control roster drift');
  if(rows.filter(r=>r.kind==='hazard').length!==8||rows.filter(r=>r.kind==='control').length!==13||controls.length!==8)throw Error('frozen counts drift');
}
