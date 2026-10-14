import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import assert from 'node:assert/strict';
const candidateRuntimeSha="bc879d6c7fd213b49ef355b64bd83196098ffa0e";
const root=import.meta.dirname;
const hash=v=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const files=readdirSync(join(root,'runs')).filter(f=>f.endsWith('.receipt.json')).sort();
const receipts=files.map(f=>JSON.parse(readFileSync(join(root,'runs',f),'utf8')));
const baseline=receipts.filter(r=>r.package.sha==='4be84ed4aab018bee1b9a77b6012b9b97c966d1c');
const candidate=receipts.filter(r=>r.package.sha===candidateRuntimeSha);
const target=process.argv.includes('--latest')?[receipts.at(-1)]:receipts;
for(const r of target){
 assert(r,'receipt required');
 const trace=readFileSync(join(root,'runs',`${r.runId}.jsonl`));
 assert.equal(hash(trace),r.traceSha256);
 const events=trace.toString().trim().split('\n').map(JSON.parse);
 assert.equal(events.length,r.events);
 const meta=events.find(e=>e.t==='message'&&e.topic==='meta').body;
 assert.deepEqual(meta.aegis,r.package);
 assert.equal(meta.harnessSha256,r.harnessSha256);
 assert.equal(hash(readFileSync(join(root,'src/main.ts'))),r.harnessSha256);
 assert.equal(meta.seed,'overlay-coverage-consent-v1');
 assert.equal(meta.scenarios.length,25);
 assert.equal(meta.scenarios.filter(s=>s.hazard).length,10);
 assert.equal(meta.scenarios.filter(s=>s.explicit).length,3);
 assert.equal(r.package.dirty,'');
 assert(r.package.manifest.length>0);
 const score=events.filter(e=>e.t==='score').at(-1).scores;
 assert.deepEqual(score,r.metrics);
 const verdict=Object.entries(score).every(([k,v])=>v===(k==='aegisUnsafeCoverageLossRate'?0:1));
 assert.equal(verdict,r.green);
 const rows=events.filter(e=>e.t==='message'&&e.topic==='scenario'&&e.from==='real-current-cascade').map(e=>e.body);
 const controls=events.filter(e=>e.t==='message'&&e.topic==='scenario'&&e.from==='pinned-effective-base').map(e=>e.body);
 assert.equal(rows.length,25);assert.equal(controls.length,10);assert(controls.every(r=>r.correct&&r.action==='deny'));
 assert.equal(rows.filter(r=>r.hazard&&r.action==='allow').length/10,score.aegisUnsafeCoverageLossRate);
 assert.equal(rows.filter(r=>r.correct).length/25,score.aegisResolutionAccuracy);
 assert.equal(rows.filter(r=>r.hazard&&r.checks.effectiveRules&&r.checks.warnings).length/10,score.aegisCoverageRejectionRate);
 if(process.argv.includes('--latest')){assert(r.green,'latest rerun must actually be green');assert.equal(r.package.sha,candidateRuntimeSha);}
}
if(!process.argv.includes('--latest')){
 assert.equal(baseline.length,2);assert(candidate.length>=1);
 const scenarioRows=r=>JSON.parse('['+readFileSync(join(root,'runs',`${r.runId}.jsonl`),'utf8').trim().split('\n').join(',')+']').filter(e=>e.t==='message'&&e.topic==='scenario').map(e=>e.body);
 assert(isDeepStrictEqual(scenarioRows(baseline[0]),scenarioRows(baseline[1])));
 assert.deepEqual(baseline[0].package,baseline[1].package);
 assert(baseline.every(r=>!r.green&&r.metrics.aegisUnsafeCoverageLossRate===1));
 assert(candidate.every(r=>r.green));
 const allMeta=r=>JSON.parse(readFileSync(join(root,'runs',`${r.runId}.jsonl`),'utf8').split('\n')[0]).body;
 assert(receipts.every(r=>isDeepStrictEqual(allMeta(r).scenarios,allMeta(baseline[0]).scenarios)));
}
console.log(`exp63 exact receipts verified: ${target.length}; diagnostic baseline red preserved; ${process.argv.includes('--latest')?'fresh real-package rerun green':'committed before/after audited'}`);
