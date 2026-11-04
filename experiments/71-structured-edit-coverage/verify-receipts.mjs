import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {experiment,seed,holdoutSeed,scenarios,thresholds} from './scenarios.mjs';
import {rescore,metrics,passing} from './oracle.mjs';
const root=import.meta.dirname;
export const hash=b=>`sha256:${createHash('sha256').update(b).digest('hex')}`;
const eq=(a,b,msg)=>assert.deepStrictEqual(a,b,msg),ok=(v,msg)=>assert.ok(v,msg);
const ts=(v,msg)=>ok(Number.isSafeInteger(v)&&v>=0,msg);
export function validate(result,events,{sha,since=0,now=Date.now(),repo,reference}={}){
 ok(/^[a-f0-9]{40}$/.test(sha),'exact SHA required');ts(now,'now');ts(since,'since');ok(since<=now,'since order');
 ok(/^sec-[a-z0-9]+-\d+$/.test(result.runId),'run id');
 eq(events.length,scenarios.length+2,'event count');
 const e=events[0],m=e.body;
 eq([e.t,e.from,e.to,e.topic],['message','moderator','moderator','meta'],'meta envelope');
 eq(m.runId,result.runId,'run binding');eq(m.experiment,experiment,'experiment');eq([m.seed,m.holdoutSeed,m.holdoutUsed],[seed,holdoutSeed,false],'seeds');eq(m.scenarios,scenarios,'scenario manifest');eq(m.thresholds,thresholds,'thresholds');
 const hm=['scenarios.mjs','oracle.mjs','child.mjs','main.mjs'].map(file=>({file,sha256:hash(readFileSync(join(root,file)))}));
 eq(m.harnessManifest,hm,'harness binding');eq(result.harnessManifest,hm,'result harness');
 eq(m.aegis.sha,sha,'meta SHA');eq(result.aegisSha,sha,'result SHA');eq(m.aegis.dirty,'','source clean');eq(result.aegisDirty,'','result clean');
 const mf=m.aegis.manifest;ok(Array.isArray(mf)&&mf.length>10,'artifact manifest');eq(new Set(mf.map(f=>f.file)).size,mf.length,'unique artifacts');
 for(const p of ['aegis','aegis-hook','aegis-collect'])for(const tail of ['package.json','src/index.ts','dist/index.js'])ok(mf.some(f=>f.file===`packages/${p}/${tail}`),'required artifact');
 for(const f of mf){ok(/^packages\/(aegis|aegis-hook|aegis-collect)\/(src\/[^.].*|dist\/[^.].*|package.json)$/.test(f.file)&&!f.file.split('/').includes('..'),'manifest path');ok(/^sha256:[a-f0-9]{64}$/.test(f.sha256),'manifest hash');}
 eq(hash(JSON.stringify(mf)),m.aegis.manifestSha256,'manifest digest');eq(result.manifestSha256,m.aegis.manifestSha256,'result manifest');
 if(repo){eq(execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),sha,'live checkout SHA');eq(execFileSync('git',['-C',repo,'status','--porcelain','--','packages','package.json','pnpm-lock.yaml'],{encoding:'utf8'}).trim(),'','live clean');for(const f of mf){const file=resolve(repo,f.file);ok(realpathSync(file).startsWith(realpathSync(repo)+'/'),'live containment');eq(hash(readFileSync(file)),f.sha256,'actual artifact bytes');}}
 ts(m.startedAt,'start');ts(result.endedAt,'end');eq(result.startedAt,m.startedAt,'start binding');ok(m.startedAt>=since&&result.endedAt>=m.startedAt&&result.endedAt<=now,'fresh run');
 let previous=m.startedAt;for(const ev of events){ts(ev.ts,'event timestamp');ok(ev.ts>=previous&&ev.ts<=result.endedAt,'event order');previous=ev.ts;}
 const rows=events.slice(1,-1).map((ev,i)=>{eq([ev.t,ev.from,ev.to,ev.topic],['message','real-aegis','moderator','scenario'],'scenario envelope');eq(ev.body.id,scenarios[i].id,'ordered id');eq(ev.body.kind,scenarios[i].kind,'arm');eq(ev.body.result.id,scenarios[i].id,'raw id');eq(ev.body.result.status,'returned','child returned');return ev.body;});
 if(reference)eq(rows.map(r=>r.result.response),reference.rows.map(r=>r.result.response),'pinned observable response equality');
 const rescored=rescore(rows);eq(rows,rescored,'raw re-scoring');const score=metrics(rescored);eq(events.at(-1).t,'score','last event');eq(events.at(-1).scores,score,'trace score');eq(result.summary,score,'result score');eq(result.passed,passing(score),'passed field');eq(result.failed,rows.filter(r=>!r.correct).map(r=>({id:r.id,checks:r.checks})),'failed rows');
 eq(score.infrastructureFailures,0,'no infrastructure faults');eq(score.ownershipRate,1,'ownership');eq(score.recoveryRate,1,'recovery');eq(score.directAccuracy,1,'direct controls');eq(score.controlAccuracy,1,'compatibility');
 return {meta:m,rows,score};
}
export function load(path){const result=JSON.parse(readFileSync(path,'utf8'));const tracePath=join(root,'runs',`${result.runId}.jsonl`);eq(result.trace,`experiments/${experiment}/runs/${result.runId}.jsonl`,'trace path');const bytes=readFileSync(tracePath);eq(hash(bytes),result.traceSha256,'trace digest');return {result,events:bytes.toString().trimEnd().split('\n').map(l=>JSON.parse(l)),bytes};}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];
 if(args.includes('--run')){const receipts=JSON.parse(readFileSync(join(root,'receipts.json')));const pinned=load(join(root,'runs',`${receipts.runs[2].runId}.result.json`));const reference=validate(pinned.result,pinned.events,{sha:receipts.candidateSha});
  const r=load(get('--run'));validate(r.result,r.events,{sha:get('--sha'),since:Number(get('--since')),repo:get('--repo'),reference});eq(r.result.summary,thresholds,'live all green');console.log('exp71 fresh actual-package verification passed');}
 else {
  const receipts=JSON.parse(readFileSync(join(root,'receipts.json'),'utf8'));eq(receipts.experiment,experiment);eq(receipts.runs.length,3);
  const checked=receipts.runs.map((r,i)=>{const file=join(root,'runs',`${r.runId}.result.json`);eq(hash(readFileSync(file)),r.resultSha256,'pinned result bytes');const p=load(file);eq(p.result.traceSha256,r.traceSha256,'pinned trace');return validate(p.result,p.events,{sha:i<2?receipts.baselineSha:receipts.candidateSha});});
  eq(checked[0].score,receipts.baselineMetrics,'red metric pin');eq(checked[1].score,checked[0].score,'repeat red');eq(checked[0].rows,checked[1].rows,'repeat raw outcomes');eq(checked[0].meta.aegis.manifest,checked[1].meta.aegis.manifest,'repeat package');eq(checked[0].score.hazardCoverage,0,'demonstrated red');eq(checked[0].score.identityCoverage,0,'identity red');eq(checked[2].score,thresholds,'candidate green');
  console.log('exp71 frozen red-red-green receipts verified (historical, not live execution)');
 }
}
