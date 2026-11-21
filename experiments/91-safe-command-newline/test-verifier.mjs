import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {load,validate} from './verify-receipts.mjs';
const root=import.meta.dirname,receipt=JSON.parse(readFileSync(join(root,'receipts.json')));
const pinned=load(join(root,'runs',receipt.runs[2].runId+'.result.json'));
const options={sha:receipt.candidateSha};
validate(pinned.result,pinned.events,options);
const mutations=[
 (r,e)=>r.passed=false,
 (r,e)=>r.summary.falseSafeRate=1,
 (r,e)=>r.failed=[{id:'invented'}],
 (r,e)=>r.aegisSha='0'.repeat(40),
 (r,e)=>e[0].body.aegis.dirty=' M source',
 (r,e)=>e[0].body.scenarios.pop(),
 (r,e)=>e[0].body.thresholds.falseSafeRate=1,
 (r,e)=>e[0].body.seed='other',
 (r,e)=>e[0].body.holdoutUsed=true,
 (r,e)=>e[0].body.harnessManifest[0].sha256='sha256:'+'0'.repeat(64),
 (r,e)=>e[0].body.aegis.manifest.pop(),
 (r,e)=>e[1].body.observation.implicit=true,
 (r,e)=>e[1].body.observation.explicit=true,
 (r,e)=>e[1].body.observation.shell.stdout='SAFE\n',
 (r,e)=>e[1].body.observation.shell.status=1,
 (r,e)=>e[1].body.observation.paired.implicit=true,
 (r,e)=>e[1].body.observation.recovery=false,
 (r,e)=>e[1].body.observation.allowlistAfter.push('unsafe'),
 (r,e)=>e[1].body.observation.id='other',
 (r,e)=>e[1].body.checks.shell=false,
 (r,e)=>e.pop(),
 (r,e)=>e.at(-1).scores.scenarioAccuracy=0,
 (r,e)=>r.endedAt=r.startedAt-1,
 (r,e)=>r.startedAt=0,
];
for(const mutate of mutations){const {result,events}=structuredClone(pinned);mutate(result,events);assert.throws(()=>validate(result,events,options));}
assert.throws(()=>validate(pinned.result,pinned.events,{...options,since:pinned.result.endedAt+1}));
console.log(JSON.stringify({positiveAccepted:true,tamperRejections:mutations.length+1}));
