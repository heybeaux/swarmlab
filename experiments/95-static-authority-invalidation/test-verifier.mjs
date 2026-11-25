import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validate,receipts} from './verify-receipts.mjs';
import {thresholds} from './scenarios.mjs';
const result=receipts.candidate;
const original=readFileSync(resolve(import.meta.dirname,'../..',result.trace),'utf8').trim().split('\n').map(JSON.parse);
const config={expectedSha:result.aegisSha,expectedScores:thresholds};
validate(result,original,config);
const cases=[
 ['run identity',(r,e)=>{e[0].body.runId='different';}],
 ['scenario omission',(r,e)=>{e.splice(2,1);}],
 ['scenario reorder',(r,e)=>{[e[1],e[2]]=[e[2],e[1]];}],
 ['duplicate scenario',(r,e)=>{e[2]=structuredClone(e[1]);}],
 ['wrong seed',(r,e)=>{e[0].body.seed='different';}],
 ['holdout used',(r,e)=>{e[0].body.holdoutUsed=true;}],
 ['threshold relaxed',(r,e)=>{e[0].body.thresholds.unsafeRecoveryRate=1;}],
 ['package identity',(r,e)=>{e[0].body.aegis.sha='0'.repeat(40);}],
 ['dirty package',(r,e)=>{e[0].body.aegis.dirty='M approval.ts';}],
 ['harness hash',(r,e)=>{e[0].body.harnessManifest[0].sha256='sha256:'+'0'.repeat(64);}],
 ['manifest hash',(r,e)=>{e[0].body.aegis.manifest[0].sha256='sha256:'+'0'.repeat(64);}],
 ['raw unsafe execute',(r,e)=>{e[2].body.response.result={status:'execute',retryable:false};}],
 ['raw paired block',(r,e)=>{e[1].body.response.control.finalized={status:'blocked',retryable:false};}],
 ['raw replay',(r,e)=>{e[1].body.response.probeAgain={status:'execute',retryable:false};}],
 ['raw approval',(r,e)=>{e[1].body.response.approval.consumed.exitCode=2;}],
 ['raw fixture',(r,e)=>{e[1].body.response.fixture.duplicate=true;}],
 ['raw ownership',(r,e)=>{e[1].body.response.ownership=false;}],
 ['raw retained grant',(r,e)=>{e[2].body.response.after.effects[0].state='authorized';}],
 ['raw clean recovery',(r,e)=>{e[2].body.response.probe={status:'execute',retryable:false};}],
 ['raw rival',(r,e)=>{e[19].body.response.rival={status:'blocked',retryable:false};}],
 ['raw static input',(r,e)=>{e[2].body.response.entry.current.revoked=false;e[2].body.response.live.current.revoked=false;}],
 ['wrong tool',(r,e)=>{e[1].body.response.call.tool='Other';}],
 ['wrong effect identity',(r,e)=>{e[2].body.response.after.effects[0].operationId='foreign';}],
 ['wrong claim marker',(r,e)=>{e[2].body.response.after.effects[0].claimed=true;}],
 ['false unsafe label',(r,e)=>{e[2].body.unsafe=true;}],
 ['computed checks',(r,e)=>{e[1].body.checks.outcome=false;}],
 ['computed score',(r,e)=>{e.at(-1).scores.scenarioAccuracy=0;}],
 ['result score',(r,e)=>{r.summary.scenarioAccuracy=0;}],
 ['pass flag',(r,e)=>{r.passed=false;}],
 ['failed list',(r,e)=>{r.failed.push({id:'invented'});}],
 ['timestamp',(r,e)=>{e[1].ts=r.startedAt-1;}],
 ['fractional timestamp',(r,e)=>{e[1].ts+=0.5;}],
 ['end before start',(r,e)=>{r.endedAt=r.startedAt-1;}],
 ['event type',(r,e)=>{e[1].t='score';}],
 ['trace path',(r,e)=>{r.trace='../escape';}],
];
for(const [name,mutate] of cases){const r=structuredClone(result),e=structuredClone(original);mutate(r,e);assert.throws(()=>validate(r,e,config),undefined,name);}
console.log(`Verifier positive accepted; ${cases.length} tamper cases rejected.`);
