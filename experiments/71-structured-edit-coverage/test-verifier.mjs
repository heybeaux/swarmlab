import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {validate,load} from './verify-receipts.mjs';
const root=import.meta.dirname,r=JSON.parse(readFileSync(join(root,'receipts.json'))),p=load(join(root,'runs',`${r.runs[2].runId}.result.json`));
const reference=validate(p.result,p.events,{sha:r.candidateSha});
const cases=[
 (a,b)=>b[1].body.result.response.call={tool:'Other'},
 (a,b)=>b[1].body.result.response.evaluation.reason='fabricated',
 (a,b)=>a.passed=false,
 (a,b)=>a.summary.hazardCoverage=0,
 (a,b)=>b[1].body.result.response.evaluation.action='allow',
 (a,b)=>b[1].body.result.response.identity.signatureChanges=false,
 (a,b)=>b[1].body.checks.action=false,
 (a,b)=>b[1].body.result.status='timeout',
 (a,b)=>b[1].body.result.response.ownership=false,
 (a,b)=>b[0].body.aegis.sha='0'.repeat(40),
 (a,b)=>a.aegisSha='0'.repeat(40),
 (a,b)=>b[0].body.aegis.dirty='M',
 (a,b)=>a.aegisDirty='M',
 (a,b)=>b[0].body.holdoutUsed=true,
 (a,b)=>b[0].body.scenarios.pop(),
 (a,b)=>b[0].body.harnessManifest[0].sha256='sha256:'+'0'.repeat(64),
 (a,b)=>b[0].body.aegis.manifest.pop(),
 (a,b)=>a.endedAt=String(a.endedAt),
 (a,b)=>a.endedAt+=.25,
 (a,b)=>b[1].ts=String(b[1].ts),
 (a,b)=>b[1].ts=b[0].ts-1,
 (a,b)=>b[1].body.id='duplicate',
 (a,b)=>b.push(b[1]),
];
for(const mutate of cases){const a=structuredClone(p.result),b=structuredClone(p.events);mutate(a,b);assert.throws(()=>validate(a,b,{sha:r.candidateSha,reference}));}
assert.throws(()=>validate(p.result,p.events,{sha:r.candidateSha,since:Date.now()+1}));
console.log(`exp71 verifier rejects ${cases.length+1} forged evidence variants`);
