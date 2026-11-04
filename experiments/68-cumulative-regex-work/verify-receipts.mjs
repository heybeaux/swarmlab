import {readFileSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {experiment,seed,holdoutSeed,WATCHDOG_MS,IMPORT_MS,scenarios,negativeControls,thresholds} from './scenarios.mjs';
import {assess,metrics,assertRows} from './oracle.mjs';
const root=import.meta.dirname,hash=b=>`sha256:${createHash('sha256').update(b).digest('hex')}`,read=p=>JSON.parse(readFileSync(p,'utf8'));
const eq=(a,b,msg)=>{if(!same(a,b))throw Error(msg);};const ok=(v,msg)=>{if(!v)throw Error(msg);};
const args=process.argv.slice(2);
let liveRequest;
if(args.length){
 ok(args.length===6&&args[0]==='--run'&&args[2]==='--since'&&args[4]==='--sha',
   'usage --run log --since integer-ms --sha exact-sha');
 ok(typeof args[1]==='string'&&args[1].length>0,'run log required');
 ok(/^[1-9][0-9]*$/.test(args[3]),'invalid since');
 const since=Number(args[3]);ok(Number.isSafeInteger(since),'invalid since');
 ok(/^[a-f0-9]{40}$/.test(args[5]),'invalid expected package sha');
 liveRequest={log:resolve(args[1]),since,sha:args[5]};
}
const receipts=read(join(root,'receipts.json'));
ok(Array.isArray(receipts.runs)&&receipts.runs.length===3,'red/red/green receipt roster');
ok(new Set(receipts.runs.map(r=>r.runId)).size===3,'duplicate receipt run');
eq(receipts.green,receipts.runs[2],'green reference must be admitted third receipt');
for(const f of receipts.harnessManifest)eq(hash(readFileSync(join(root,f.file))),f.sha256,`frozen design changed ${f.file}`);
function verify(result,receipt,{since=0,live=false,sha}={}){
 ok(result&&typeof result==='object','result missing');
 ok(/^crw-[a-z0-9]+-[0-9]+$/.test(result.runId),'bad run identity');
 const trace=resolve(process.cwd(),result.trace);ok(basename(trace)===`${result.runId}.jsonl`,'trace identity');
 const raw=readFileSync(trace),events=raw.toString().trim().split('\n').map(l=>JSON.parse(l));
 eq(hash(raw),result.traceSha256,'trace content address');
 if(receipt){eq(result.runId,receipt.runId,'receipt run');eq(result.traceSha256,receipt.traceSha256,'receipt trace');eq(hash(readFileSync(join(root,'runs',`${result.runId}.result.json`))),receipt.resultSha256,'result content address');}
 const sidecar=read(join(root,'runs',`${result.runId}.result.json`));eq(sidecar,result,'log/result binding');
 const meta=events[0]?.body;ok(events[0]?.t==='message'&&events[0]?.topic==='meta','meta event');
 eq(meta?.runId,result.runId,'embedded run id');eq(meta.experiment,experiment,'experiment');eq(meta.seed,seed,'seed');eq(meta.holdoutSeed,holdoutSeed,'holdout seed');eq(meta.holdoutUsed,false,'holdout used');eq(meta.watchdogMs,WATCHDOG_MS,'watchdog');eq(meta.importMs,IMPORT_MS,'import deadline');eq(meta.thresholds,thresholds,'thresholds');eq(meta.scenarios,scenarios,'scenario data');eq(meta.negativeControls,negativeControls,'controls data');
 eq(meta.harnessManifest,receipts.harnessManifest,'design manifest');eq(result.harnessManifest,meta.harnessManifest,'result design');eq(meta.harnessSha256,hash(JSON.stringify(meta.harnessManifest)),'meta design digest');eq(result.harnessSha256,meta.harnessSha256,'result design digest');eq(meta.scenarioSha256,hash(JSON.stringify({scenarios,negativeControls})),'scenario digest');
 ok(/^[a-f0-9]{40}$/.test(meta.aegis.sha),'actual package sha');if(sha)eq(meta.aegis.sha,sha,'live expected package sha');
 eq(meta.aegis.dirty,'','dirty package source');eq(result.aegisDirty,'','dirty result source');eq(result.aegisSha,meta.aegis.sha,'result package sha');
 eq(meta.aegis.manifestSha256,hash(JSON.stringify(meta.aegis.manifest)),'artifact digest');eq(result.aegisManifestSha256,meta.aegis.manifestSha256,'result artifact digest');
 if(receipt){eq(meta.aegis.sha,receipt.aegisSha,'receipt package sha');eq(meta.aegis.manifest,receipt.aegisManifest,'receipt artifact manifest');}
 if(live){eq(meta.aegis.manifest,receipts.green.aegisManifest,'live source/dist equals admitted candidate');ok(!receipts.runs.some(r=>r.runId===result.runId),'frozen trace is not live evidence');}
 const now=Date.now();for(const [k,v] of Object.entries({startedAt:result.startedAt,endedAt:result.endedAt})){ok(Number.isSafeInteger(v)&&v>=since&&v<=now,`invalid ${k}`);}
 eq(meta.startedAt,result.startedAt,'start binding');ok(result.startedAt<=result.endedAt,'reversed run');ok(result.endedAt-result.startedAt<=120000,'run bound');
 eq(events.length,31,'event count');eq(result.replayEvents,31,'replay count');let prior=result.startedAt;
 for(const e of events){ok(Number.isSafeInteger(e.ts)&&e.ts>=prior&&e.ts<=result.endedAt,'event timeline');prior=e.ts;}
 const rows=[],controls=[];
 const roster=[...scenarios,...negativeControls];
 roster.forEach((s,i)=>{
  const event=events[i+1],row=event?.body,r=row?.result;
  eq(event?.t,'message','row event');eq(event?.topic,'scenario','row topic');eq(event?.from,i<21?'real-aegis':'linear-control','row arm');eq(row?.id,s.id,'row identity');
  ok(r&&['returned','watchdog'].includes(r.status),'non-policy infrastructure failure');
  for(const k of ['readyAt','startAt','endAt'])ok(Number.isSafeInteger(r[k])&&r[k]>=result.startedAt&&r[k]<=event.ts,`row ${s.id} ${k}`);
  ok(r.readyAt<=r.startAt&&r.startAt<=r.endAt,'row event order');ok(r.readyAt-result.startedAt<=120000,'ready bound');
  eq(r.stdout,'','unexpected stdout');eq(r.stderr,'','unexpected stderr');
  if(r.status==='returned'){
   eq(r.exit,0,'returned child exit');eq(r.signal,null,'returned child signal');
   const p=r.response;ok(p&&typeof p==='object','response');ok(!p.error,'evaluation error');
   ok(Number.isFinite(p.elapsedMs)&&p.elapsedMs>=0&&p.elapsedMs<=WATCHDOG_MS,'late native return');
   for(const k of ['startedAt','endedAt'])ok(Number.isSafeInteger(p[k])&&p[k]>=r.startAt&&p[k]<=r.endAt,`child ${k}`);
   ok(p.startedAt<=p.endedAt,'child timestamp order');ok(r.endAt-r.startAt<=WATCHDOG_MS+100,'parent deadline exceeded');
   ok(['allow','ask','deny'].includes(p.evaluation?.action)&&Array.isArray(p.evaluation?.matches),'typed evaluation');
   ok(typeof p.ownership==='boolean'&&typeof p.recovered==='boolean','typed checks');
   if(live){
    const expectedRow=receipts.greenEvaluations[s.id];eq(p.evaluation,expectedRow,`actual live decision ${s.id}`);
    eq(p.recovery,{deny:'deny',allow:'allow'},'actual recovery');eq(p.ownership,true,'ownership');eq(p.recovered,true,'recovered');
   }
  }else{
   eq(r.signal,'SIGKILL','watchdog signal');eq(r.exit,null,'watchdog exit');ok(r.response===undefined,'watchdog not returned');ok(r.endAt-r.startAt>=WATCHDOG_MS-10,'early watchdog');
  }
  const computed=assess(s,r);eq(row,computed,`derived checks ${s.id}`);
  (i<21?rows:controls).push(row);
 });
 assertRows(rows,controls);const scores=metrics(rows,controls);eq(events.at(-1)?.t,'score','terminal score');eq(events.at(-1)?.scores,scores,'recomputed scores');eq(result.summary,scores,'result scores');eq(result.passed,same(scores,thresholds),'pass binding');
 eq(result.failed,[...rows,...controls].filter(r=>!r.correct).map(r=>({id:r.id,status:r.result.status,checks:r.checks})),'failed roster');
 if(receipt)eq(scores,receipt.summary,'receipt summary');if(live)eq(scores,thresholds,'live not green');
 return {result,meta,rows,controls};
}
const admitted=receipts.runs.map(r=>verify(read(join(root,'runs',`${r.runId}.result.json`)),r));
eq(admitted[0].result.summary,admitted[1].result.summary,'baseline repeat');eq(admitted[0].meta.aegis.manifest,admitted[1].meta.aegis.manifest,'repeat package');
eq(admitted[0].result.summary.aggregateWatchdogRate,1,'baseline not red');eq(admitted[0].result.summary.controlAccuracy,1,'baseline controls');eq(admitted[0].result.summary.linearControlAccuracy,1,'baseline linear');eq(admitted[2].result.summary,thresholds,'admitted green');
// Reference decisions are not independent claims: derive them from the already
// content-addressed, verified green trace. Never let an auxiliary index redefine
// what a fresh real-package run is required to reproduce.
const greenEvaluations=Object.fromEntries([...admitted[2].rows,...admitted[2].controls]
 .map(r=>[r.id,r.result.response.evaluation]));
eq(receipts.greenEvaluations,greenEvaluations,'green evaluation index must equal admitted decisions');
if(liveRequest){
 verify(read(liveRequest.log),null,{since:liveRequest.since,live:true,sha:liveRequest.sha});
}
console.log(`exp68: red/red/green receipts verified${args.length?' + fresh actual live package': ''}`);
