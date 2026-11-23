import assert from 'node:assert/strict';
import {readFileSync,realpathSync,readdirSync,statSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {experiment,seed,holdoutSeed,scenarios,thresholds} from './scenarios.mjs';
import {assess,metrics,passing} from './oracle.mjs';
const root=import.meta.dirname;
const inputs=new Map();
function expectedInput(s){
 const key=JSON.stringify([s.length,!!s.hit]);if(inputs.has(key))return inputs.get(key);
 const h=createHash('sha256');let remaining=s.length-(s.hit?257:0);const block='q'.repeat(1048576);
 while(remaining>=block.length){h.update(block);remaining-=block.length;}h.update('q'.repeat(remaining));if(s.hit)h.update('q'.repeat(255)+'Z0');
 const input={length:s.length,sha256:`sha256:${h.digest('hex')}`};inputs.set(key,input);return input;
}
const walk=p=>readdirSync(p).sort().flatMap(n=>statSync(join(p,n)).isDirectory()?walk(join(p,n)):[join(p,n)]);
export const hash=b=>`sha256:${createHash('sha256').update(b).digest('hex')}`;
const eq=(a,b,msg)=>assert.deepStrictEqual(a,b,msg),ok=(v,msg)=>assert.ok(v,msg);
const ts=(v,msg)=>ok(Number.isSafeInteger(v)&&v>=0,msg);
// The corpus has deterministic IDs and no approval timestamps; require exact raw equality.
export const normalize=r=>({id:r.id,status:r.status,ready:r.ready,evaluated:r.evaluated,input:r.input,exitCode:r.exitCode,signal:r.signal,...(r.response?{response:{...r.response,elapsedMs:undefined}}:{})});
export function validate(result,events,{sha,since=0,now=Date.now(),repo,reference}={}){
 ok(/^[a-f0-9]{40}$/.test(sha),'exact SHA required');ts(now,'now');ts(since,'since');ok(since<=now,'since order');
 ok(/^lls-[a-z0-9]+-\d+$/.test(result.runId),'run id');
 eq(events.length,scenarios.length+2,'event count');
 const e=events[0],m=e.body;
 eq([e.t,e.from,e.to,e.topic],['message','moderator','moderator','meta'],'meta envelope');
 eq(m.runId,result.runId,'run binding');eq(m.experiment,experiment,'experiment');eq([m.seed,m.holdoutSeed,m.holdoutUsed],[seed,holdoutSeed,false],'seeds');eq(m.scenarios,scenarios,'scenario manifest');eq(m.thresholds,thresholds,'thresholds');eq(m.limits,{heapMB:512,importMs:15000,evaluateMs:1500},'resource limits');
 const hm=['scenarios.mjs','oracle.mjs','child.mjs','main.mjs'].map(file=>({file,sha256:hash(readFileSync(join(root,file)))}));
 eq(m.harnessManifest,hm,'harness binding');eq(result.harnessManifest,hm,'result harness');
 eq(m.aegis.sha,sha,'meta SHA');eq(result.aegisSha,sha,'result SHA');eq(m.aegis.dirty,'','source clean');eq(result.aegisDirty,'','result clean');
 const mf=m.aegis.manifest;ok(Array.isArray(mf)&&mf.length>10,'artifact manifest');eq(new Set(mf.map(f=>f.file)).size,mf.length,'unique artifacts');
 for(const p of ['aegis'])for(const tail of ['package.json','src/index.ts','dist/index.js'])ok(mf.some(f=>f.file===`packages/${p}/${tail}`),'required artifact');
 for(const f of mf){ok(/^packages\/(aegis)\/(src\/[^.].*|dist\/[^.].*|package.json)$/.test(f.file)&&!f.file.split('/').includes('..'),'manifest path');ok(/^sha256:[a-f0-9]{64}$/.test(f.sha256),'manifest hash');}
 eq(hash(JSON.stringify(mf)),m.aegis.manifestSha256,'manifest digest');eq(result.manifestSha256,m.aegis.manifestSha256,'result manifest');
 if(repo){const expectedFiles=['aegis'].flatMap(p=>[...walk(join(repo,'packages',p,'src')),...walk(join(repo,'packages',p,'dist')),join(repo,'packages',p,'package.json')]).sort().map(p=>p.slice(resolve(repo).length+1));eq(mf.map(f=>f.file),expectedFiles,'complete actual artifact roster');eq(execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),sha,'live checkout SHA');eq(execFileSync('git',['-C',repo,'status','--porcelain','--','packages','package.json','pnpm-lock.yaml'],{encoding:'utf8'}).trim(),'','live clean');for(const f of mf){const file=resolve(repo,f.file);ok(realpathSync(file).startsWith(realpathSync(repo)+'/'),'live containment');eq(hash(readFileSync(file)),f.sha256,'actual artifact bytes');}}
 ts(m.startedAt,'start');ts(result.endedAt,'end');eq(result.startedAt,m.startedAt,'start binding');eq(parseInt(result.runId.split('-')[1],36),m.startedAt,'run timestamp');ok(m.startedAt>=since&&result.endedAt>=m.startedAt&&result.endedAt<=now,'fresh run');
 let previous=m.startedAt;for(const ev of events){ts(ev.ts,'event timestamp');ok(ev.ts>=previous&&ev.ts<=result.endedAt,'event order');previous=ev.ts;}
 const rows=events.slice(1,-1).map((ev,i)=>{eq([ev.t,ev.from,ev.to,ev.topic],['message','real-aegis','moderator','scenario'],'scenario envelope');eq(ev.body.id,scenarios[i].id,'ordered id');eq(ev.body.observation.id,scenarios[i].id,'raw id');const r=ev.body.observation;ok(['ok','runtime-exit','watchdog','runtime-error','infrastructure-error'].includes(r.status),'status');ok(r.startedAt>=m.startedAt&&r.endedAt>=r.startedAt&&r.endedAt<=result.endedAt,'child timestamps');if(r.status==='ok'){eq(r.ready,true,'ready');eq(r.evaluated,true,'evaluated');eq(r.input,expectedInput(scenarios[i]),'independent input digest');eq(r.exitCode,0,'child exit');eq(r.signal,null,'child signal');eq(r.stdout,'','stdout');eq(r.stderr,'','stderr');ok(Number.isFinite(r.response.elapsedMs)&&r.response.elapsedMs>=0&&r.response.elapsedMs<=1500,'elapsed');}return ev.body;});
 if(reference)eq(rows.map(r=>normalize(r.observation)),reference.rows.map(r=>normalize(r.observation)),'pinned observable response equality');
 const rescored=rows.map((r,i)=>assess(scenarios[i],r.observation));eq(rows,rescored,'raw re-scoring');const score=metrics(rescored);eq(events.at(-1).t,'score','last event');eq(events.at(-1).scores,score,'trace score');eq(result.summary,score,'result score');eq(result.passed,passing(score),'passed field');eq(result.failed,rows.filter(r=>!r.correct).map(r=>({id:r.id,status:r.observation.status,checks:r.checks})),'failed rows');
 eq(score.infrastructureFailures,0,'no infrastructure faults');eq(score.pairedControlAccuracy,1,'paired controls');
 return {meta:m,rows,score};
}
export function load(path){const result=JSON.parse(readFileSync(path,'utf8'));const tracePath=join(root,'runs',`${result.runId}.jsonl`);eq(result.trace,`experiments/${experiment}/runs/${result.runId}.jsonl`,'trace path');const bytes=readFileSync(tracePath);eq(hash(bytes),result.traceSha256,'trace digest');return {result,events:bytes.toString().trimEnd().split('\n').map(l=>JSON.parse(l)),bytes};}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const receipts=JSON.parse(readFileSync(join(root,'receipts.json'),'utf8'));
 eq(receipts.experiment,experiment);eq(receipts.outcome,'honest-null');eq(receipts.runs.length,2);
 const checked=receipts.runs.map(r=>{const file=join(root,'runs',`${r.runId}.result.json`);eq(hash(readFileSync(file)),r.resultSha256,'pinned result bytes');const p=load(file);eq(p.result.traceSha256,r.traceSha256,'pinned trace');const checked=validate(p.result,p.events,{sha:receipts.baselineSha});eq(checked.score,thresholds,'null complete');return checked;});
 eq(checked[0].rows.map(r=>normalize(r.observation)),checked[1].rows.map(r=>normalize(r.observation)),'repeat raw outcomes');eq(checked[0].meta.aegis.manifest,checked[1].meta.aegis.manifest,'repeat package');
 const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];
 if(args.includes('--run')){
  eq(get('--sha'),receipts.baselineSha,'admitted package SHA');ok(args.includes('--repo')&&get('--repo'),'live repo required');ok(args.includes('--since'),'freshness required');const r=load(get('--run'));validate(r.result,r.events,{sha:get('--sha'),since:Number(get('--since')),repo:get('--repo'),reference:checked[0]});eq(r.result.summary,thresholds,'live all green');console.log('exp93 fresh actual-package null replication passed');
 }else console.log('exp93 frozen null/null receipts verified; no Aegis improvement claimed');
}
