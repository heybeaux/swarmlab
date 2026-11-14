import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {validate,load} from './verify-receipts.mjs';
const root=import.meta.dirname,r=JSON.parse(readFileSync(join(root,'receipts.json'))),p=load(join(root,'runs',`${r.runs[2].runId}.result.json`));
const opts={sha:r.candidateSha},reference=validate(p.result,p.events,opts);let rejected=0;
const cases=[
 (r,e)=>e[1].body.result.response.rival.status='blocked',
 (r,e)=>e[1].body.result.response.losingClaim={id:'invented'},
 (r,e)=>e[9].body.result.response.rivalBegin.status='blocked',
 (r,e)=>r.passed=false,(r,e)=>r.summary.unsafeRecoveryRate=1,(r,e)=>r.failed.push({id:'fake'}),
 (r,e)=>e[1].body.result.response.result.retryable=true,
 (r,e)=>e[1].body.result.response.after.effects[0].state='started',
 (r,e)=>e[1].body.result.response.probeAgain.status='execute',
 (r,e)=>e[1].body.result.response.approval.consumed.approval.event='requested',
 (r,e)=>e[1].body.result.response.before.ready[0].issuanceId='wrong',
 (r,e)=>e[1].body.result.response.fixture.duplicate=true,
 (r,e)=>e[1].body.checks={},
 (r,e)=>e[1].body.result.response.entry.current.revoked=true,
 (r,e)=>e[1].body.result.response.entry.permit.id='wrong',
 (r,e)=>e[1].body.result.response.after.issued=[],
 (r,e)=>e[1].body.result.response.operations[0].op='take',
 (r,e)=>e[0].body.runId='cci-other-9',
 (r,e)=>e[0].body.aegis.sha='0'.repeat(40),(r,e)=>r.aegisSha='0'.repeat(40),
 (r,e)=>e[0].body.aegis.dirty='modified',(r,e)=>r.aegisDirty='modified',
 (r,e)=>e[0].body.harnessManifest=[],(r,e)=>e[0].body.aegis.manifest[0].sha256='x',
 (r,e)=>e[0].body.thresholds.unsafeRecoveryRate=1,
 (r,e)=>e[0].body.scenarios[0].mode='burn-false',
 (r,e)=>r.endedAt=String(r.endedAt),(r,e)=>e[1].ts=1.5,
 (r,e)=>e[1].body.result.status='infrastructure-error',
 (r,e)=>e.at(-1).t='message',(r,e)=>e.splice(1,1),
 (r,e)=>e[1].body.result.response.control.begin.status='blocked',
 (r,e)=>e[1].body.result.response.live.current.revocationChecked=false,
 (r,e)=>e[3].body.result.response.result.retryable=true,
 (r,e)=>e[3].body.result.response.after.effects[0].state='authorized',
];
for(const change of cases){const result=structuredClone(p.result),events=structuredClone(p.events);change(result,events);assert.throws(()=>validate(result,events,{...opts,reference}));rejected++;}
assert.throws(()=>validate(p.result,p.events,{sha:''}));rejected++;
assert.throws(()=>validate(p.result,p.events,{sha:r.candidateSha,since:p.result.endedAt+1,now:p.result.endedAt+2}));rejected++;
validate(p.result,p.events,{...opts,reference});console.log(`exp84 verifier: ${rejected} tamper cases rejected; positive accepted`);
