import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {validate,load} from './verify-receipts.mjs';
const root=import.meta.dirname,r=JSON.parse(readFileSync(join(root,'receipts.json'))),p=load(join(root,'runs',`${r.runs[2].runId}.result.json`));
const opts={sha:r.candidateSha},reference=validate(p.result,p.events,opts);let rejected=0;
const cases=[
 (r,e)=>r.passed=false,(r,e)=>r.summary.unsafeReissueExecutionRate=1,(r,e)=>r.failed.push({id:'fake'}),
 (r,e)=>e[1].body.result.response.real.second=true,
 (r,e)=>e[1].body.result.response.real.recreation.accepted=true,
 (r,e)=>e[1].body.result.response.real.replay=true,
 (r,e)=>e[1].body.result.response.real.approval.consumed.approval.event='requested',
 (r,e)=>e[1].body.result.response.real.ownership=false,
 (r,e)=>e[1].body.result.response.control.first=false,
 (r,e)=>delete e[1].body.checks.reissue,
 (r,e)=>e[8].body.result.response.real.second=false,
 (r,e)=>e[8].body.result.response.real.recreation.permit.id=e[8].body.result.response.real.permit.id,
 (r,e)=>e[10].body.result.response.real.stale=true,
 (r,e)=>e[1].body.result.response.real.current.authorizationDigest='hidden',
 (r,e)=>e[1].body.result.response.real.after=[],
 (r,e)=>e[0].body.runId='lpi-other-9',
 (r,e)=>e[0].body.aegis.sha='0'.repeat(40),(r,e)=>r.aegisSha='0'.repeat(40),
 (r,e)=>e[0].body.aegis.dirty='modified',(r,e)=>r.aegisDirty='modified',
 (r,e)=>e[0].body.harnessManifest=[],(r,e)=>e[0].body.aegis.manifest[0].sha256='x',
 (r,e)=>e[0].body.thresholds.unsafeReissueExecutionRate=1,
 (r,e)=>e[0].body.scenarios[0].hazard=false,
 (r,e)=>r.endedAt=String(r.endedAt),(r,e)=>e[1].ts=1.5,
 (r,e)=>e[1].body.result.status='infrastructure-error',
 (r,e)=>e.at(-1).t='message',(r,e)=>e.splice(1,1),
];
for(const change of cases){const result=structuredClone(p.result),events=structuredClone(p.events);change(result,events);assert.throws(()=>validate(result,events,{...opts,reference}));rejected++;}
assert.throws(()=>validate(p.result,p.events,{sha:''}));rejected++;
assert.throws(()=>validate(p.result,p.events,{sha:r.candidateSha,since:p.result.endedAt+1,now:p.result.endedAt+2}));rejected++;
validate(p.result,p.events,{...opts,reference});console.log(`exp75 verifier: ${rejected} tamper cases rejected; positive accepted`);
