import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {validate,load} from './verify-receipts.mjs';
const root=import.meta.dirname,receipts=JSON.parse(readFileSync(join(root,'receipts.json'))),good=load(join(root,'runs',`${receipts.runs[2].runId}.result.json`));
const options={sha:receipts.candidateSha};validate(good.result,good.events,options);
const mutations=[
 (r,e)=>e[0].body.scenarios.pop(),(r,e)=>e[0].body.seed='changed',(r,e)=>e[0].body.holdoutUsed=true,(r,e)=>e[0].body.limits.heapMB=512,(r,e)=>e[0].body.thresholds.hazardAccuracy=0,
 (r,e)=>e[0].body.harnessManifest[0].sha256='sha256:'+'0'.repeat(64),(r,e)=>e[0].body.aegis.sha='0'.repeat(40),(r,e)=>e[0].body.aegis.dirty='M file',(r,e)=>e[0].body.aegis.manifest.pop(),
 (r,e)=>e[1].body.observation.response.evaluation.action='allow',(r,e)=>e[1].body.observation.response.evaluation.matches=[{id:'fake'}],(r,e)=>e[1].body.observation.response.evaluation.reason='complete scan',
 (r,e)=>e[1].body.observation.response.ownership=false,(r,e)=>e[1].body.observation.response.recovered=false,(r,e)=>e[1].body.observation.status='runtime-exit',(r,e)=>e[1].body.observation.ready=false,(r,e)=>e[1].body.observation.signal='SIGABRT',
 (r,e)=>e[1].body.observation.response.elapsedMs=4000,(r,e)=>e[1].body.id='unknown',(r,e)=>e.pop(),(r,e)=>e.at(-1).scores.hazardAccuracy=0,
 (r,e)=>r.summary.hazardAccuracy=0,(r,e)=>r.passed=false,(r,e)=>r.failed.push({id:'bogus'}),(r,e)=>r.endedAt=0,
];
for(const mutate of mutations){const {result,events}=structuredClone(good);mutate(result,events);assert.throws(()=>validate(result,events,options));}
console.log(`exp92 verifier: positive accepted, ${mutations.length} tamper cases rejected`);
