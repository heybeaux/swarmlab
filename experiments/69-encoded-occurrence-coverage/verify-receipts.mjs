import {readFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,join,basename,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {experiment,seed,holdoutSeed,WATCHDOG_MS,IMPORT_MS,scenarios,thresholds} from './scenarios.mjs';
import {assess,metrics} from './oracle.mjs';
export const root=import.meta.dirname,hash=b=>`sha256:${createHash('sha256').update(b).digest('hex')}`;
const eq=(a,b,m)=>{if(!same(a,b))throw Error(m);},ok=(v,m)=>{if(!v)throw Error(m);};
export function verifyBundle({read=p=>readFileSync(p),live}={}){
 const json=p=>JSON.parse(read(p).toString()),receipts=json(join(root,'receipts.json'));
 ok(Array.isArray(receipts.runs)&&receipts.runs.length===3,'receipt roster');ok(new Set(receipts.runs.map(r=>r.runId)).size===3,'duplicate receipt');
 eq(receipts.green,receipts.runs[2],'green reference');eq(receipts.harnessManifest.map(f=>f.file),['scenarios.mjs','oracle.mjs','child.mjs','main.mjs'],'design roster');
 for(const f of receipts.harnessManifest)eq(hash(read(join(root,f.file))),f.sha256,'frozen design');
 function verify(result,receipt,isLive=false){
  ok(/^eoc-[a-z0-9]+-[0-9]+$/.test(result.runId),'run identity');ok(basename(result.trace)===`${result.runId}.jsonl`,'trace identity');
  const raw=read(resolve(result.trace)),events=raw.toString().trim().split('\n').map(l=>JSON.parse(l)),meta=events[0]?.body;
  eq(hash(raw),result.traceSha256,'trace digest');eq(json(join(root,'runs',`${result.runId}.result.json`)),result,'log sidecar');
  if(receipt){eq(result.runId,receipt.runId,'receipt identity');eq(result.traceSha256,receipt.traceSha256,'receipt trace');eq(hash(read(join(root,'runs',`${result.runId}.result.json`))),receipt.resultSha256,'result digest');}
  eq(events.length,24,'event count');eq(result.replayEvents,24,'replay count');eq(events[0]?.t,'message','meta type');eq(events[0]?.topic,'meta','meta topic');
  eq(meta.runId,result.runId,'embedded run');eq(meta.experiment,experiment,'experiment');eq(meta.seed,seed,'seed');eq(meta.holdoutSeed,holdoutSeed,'holdout');eq(meta.holdoutUsed,false,'holdout used');eq(meta.thresholds,thresholds,'thresholds');eq(meta.scenarios,scenarios,'scenario data');eq(meta.watchdogMs,WATCHDOG_MS,'watchdog');eq(meta.importMs,IMPORT_MS,'import bound');
  eq(meta.harnessManifest,receipts.harnessManifest,'harness manifest');eq(result.harnessManifest,meta.harnessManifest,'result design');eq(meta.harnessSha256,hash(JSON.stringify(meta.harnessManifest)),'harness digest');eq(result.harnessSha256,meta.harnessSha256,'result harness digest');eq(meta.scenarioSha256,hash(JSON.stringify(scenarios)),'scenario digest');
  ok(/^[a-f0-9]{40}$/.test(meta.aegis.sha),'package sha');eq(meta.aegis.sha,result.aegisSha,'package binding');eq(meta.aegis.dirty,'','dirty source');eq(result.aegisDirty,'','dirty result');
  eq(meta.aegis.manifestSha256,hash(JSON.stringify(meta.aegis.manifest)),'package manifest digest');eq(result.aegisManifestSha256,meta.aegis.manifestSha256,'result artifact digest');
  if(receipt){eq(meta.aegis.manifest,receipt.aegisManifest,'admitted manifest');eq(meta.aegis.sha,receipt.aegisSha,'admitted sha');eq(result.summary,receipt.summary,'receipt metrics');}
  if(isLive){eq(meta.aegis.sha,live.sha,'expected package');eq(meta.aegis.manifest,receipts.green.aegisManifest,'live admitted artifact');ok(!receipts.runs.some(r=>r.runId===result.runId),'admitted is not live');
   const walk=dir=>readdirSync(dir).sort().flatMap(n=>{const p=join(dir,n);return statSync(p).isDirectory()?walk(p):[p];});
   const files=[...walk(join(meta.aegis.repo,'packages/aegis/src')),...walk(join(meta.aegis.repo,'packages/aegis/dist')),join(meta.aegis.repo,'packages/aegis/package.json')].sort();
   eq(files.map(f=>({file:relative(meta.aegis.repo,f),sha256:hash(read(f))})),meta.aegis.manifest,'actual files');
  }
  ok(Number.isSafeInteger(result.startedAt)&&Number.isSafeInteger(result.endedAt)&&result.startedAt<=result.endedAt&&result.endedAt<=Date.now()&&result.endedAt-result.startedAt<=120000,'run timeline');if(isLive)ok(result.startedAt>=live.since,'stale run');eq(meta.startedAt,result.startedAt,'start binding');
  let prior=result.startedAt;for(const e of events){ok(Number.isSafeInteger(e.ts)&&e.ts>=prior&&e.ts<=result.endedAt,'event timeline');prior=e.ts;}
  const rows=scenarios.map((s,i)=>{
   const e=events[i+1],row=e?.body,r=row?.result;eq(e?.t,'message','row event');eq(e?.topic,'scenario','row topic');eq(e?.from,'real-aegis','row arm');eq(row?.id,s.id,'scenario identity');
   eq(r?.status,'returned','infrastructure result');eq(r.exit,0,'exit');eq(r.signal,null,'signal');eq(r.stdout,'','stdout');eq(r.stderr,'','stderr');
   for(const k of ['readyAt','startAt','endAt'])ok(Number.isSafeInteger(r[k])&&r[k]>=result.startedAt&&r[k]<=e.ts,'child timeline');ok(r.readyAt<=r.startAt&&r.startAt<=r.endAt&&r.endAt-r.startAt<=WATCHDOG_MS+100,'child deadline');
   const p=r.response;ok(p&&!p.error&&Number.isFinite(p.elapsedMs)&&p.elapsedMs>=0&&p.elapsedMs<=WATCHDOG_MS,'response');ok(['allow','ask','deny'].includes(p.evaluation?.action)&&Array.isArray(p.evaluation.matches),'typed evaluation');
   ok(typeof p.ownership==='boolean'&&typeof p.recovered==='boolean','typed checks');eq(row,assess(s,r),'computed checks');
   if(isLive){const ref=admitted[2].rows[i].result.response;for(const k of ['variants','evaluation','direct','ownership','recovered'])eq(p[k],ref[k],`live actual ${s.id} ${k}`);}
   return row;
  });
  const scores=metrics(rows);eq(events.at(-1)?.t,'score','score event');eq(events.at(-1)?.scores,scores,'recomputed score');eq(result.summary,scores,'result summary');eq(result.passed,same(scores,thresholds),'pass binding');eq(result.failed,rows.filter(r=>!r.correct).map(r=>({id:r.id,status:r.result.status,checks:r.checks})),'failed roster');if(isLive)eq(scores,thresholds,'live green');return {result,meta,rows};
 }
 const admitted=receipts.runs.map(r=>verify(json(join(root,'runs',`${r.runId}.result.json`)),r));
 eq(admitted[0].result.summary,admitted[1].result.summary,'repeat metrics');eq(admitted[0].meta.aegis.manifest,admitted[1].meta.aegis.manifest,'repeat artifact');
 const bodies=x=>x.rows.map(r=>({checks:r.checks,variants:r.result.response.variants,evaluation:r.result.response.evaluation,direct:r.result.response.direct}));eq(bodies(admitted[0]),bodies(admitted[1]),'repeat observable rows');
 eq(admitted[0].result.summary.laterPayloadMissRate,1,'baseline red');eq(admitted[0].result.summary.infrastructureFailures,0,'baseline infrastructure');eq(admitted[0].result.summary.directControlAccuracy,1,'baseline direct');eq(admitted[2].result.summary,thresholds,'green result');
 if(live){ok(live.log&&/^[a-f0-9]{40}$/.test(live.sha),'invalid live package pin');ok(Number.isSafeInteger(live.since)&&live.since>0,'invalid since');verify(json(resolve(live.log)),null,true);}
 return admitted;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2);let live;
 if(a.length){ok(a.length===6&&a[0]==='--run'&&a[2]==='--since'&&a[4]==='--sha','usage --run log --since integer-ms --sha exact-sha');ok(a[1]&&/^[1-9][0-9]*$/.test(a[3]),'invalid log/since');ok(/^[a-f0-9]{40}$/.test(a[5]),'invalid package pin');live={log:a[1],since:Number(a[3]),sha:a[5]};}
 verifyBundle({live});console.log(`exp69: red/red/green content-addressed receipts verified${live?' + fresh actual package':''}`);
}
