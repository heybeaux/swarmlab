import {readFileSync} from 'node:fs';
import {join,resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {experiment,seed,holdoutSeed,scenarios,thresholds,WATCHDOG_MS,IMPORT_MS} from './scenarios.mjs';
import {assess,metrics} from './oracle.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
export const hash=v=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const receipt=json(join(root,'receipts.json'));
const fullSha=/^[a-f0-9]{40}$/;
function check(v,message){assert.ok(v,message);}
function eq(a,b,message){assert.ok(same(a,b),message);}
function timestamp(value,message){check(Number.isSafeInteger(value)&&value>=0,message);}
export function validate(result,events,{sha,since=0,now=Date.now(),reference,traceBytes}={}){
 check(typeof sha==='string'&&fullSha.test(sha),'expected SHA must be exact 40hex');
 timestamp(now,'invalid verification clock');timestamp(since,'invalid since');check(since<=now,'invalid since');
 check(typeof result.runId==='string'&&/^pa-[a-z0-9]+-[0-9]+$/.test(result.runId),'runId');
 check(Array.isArray(events)&&events.length===22,'event count');
 const metaEvent=events[0],meta=metaEvent.body;
 eq([metaEvent.t,metaEvent.from,metaEvent.to,metaEvent.topic],['message','moderator','moderator','meta'],'meta envelope');
 eq(meta.runId,result.runId,'embedded runId');eq(meta.experiment,experiment,'experiment');eq(meta.seed,seed,'seed');eq(meta.holdoutSeed,holdoutSeed,'holdout');eq(meta.holdoutUsed,false,'holdout use');eq(meta.scenarios,scenarios,'frozen scenarios');eq(meta.thresholds,thresholds,'thresholds');eq([meta.watchdogMs,meta.importMs],[WATCHDOG_MS,IMPORT_MS],'watchdogs');
 const harnessManifest=['scenarios.mjs','oracle.mjs','child.mjs','main.mjs'].map(file=>({file,sha256:hash(readFileSync(join(root,file)))}));
 eq(meta.harnessManifest,harnessManifest,'frozen file manifest');eq(result.harnessManifest,harnessManifest,'result harness manifest');eq(meta.harnessSha256,hash(JSON.stringify(harnessManifest)),'meta harness digest');eq(result.harnessSha256,meta.harnessSha256,'result harness digest');eq(meta.scenarioSha256,hash(JSON.stringify(scenarios)),'scenario hash');
 eq(meta.aegis.sha,sha,'trace package SHA');eq(result.aegisSha,sha,'result package SHA');eq(meta.aegis.dirty,'','trace source dirty');eq(result.aegisDirty,'','result source dirty');
 check(Array.isArray(meta.aegis.manifest)&&meta.aegis.manifest.length>5,'artifact manifest');
 check(new Set(meta.aegis.manifest.map(m=>m.file)).size===meta.aegis.manifest.length,'duplicate artifact');
 check(meta.aegis.manifest.some(m=>m.file==='packages/aegis/dist/index.js')&&meta.aegis.manifest.some(m=>m.file==='packages/aegis/src/eval/preprocess.ts'),'source+runtime artifact');
 for(const m of meta.aegis.manifest)check(typeof m.file==='string'&&/^sha256:[a-f0-9]{64}$/.test(m.sha256),'manifest shape');
 eq(meta.aegis.manifestSha256,hash(JSON.stringify(meta.aegis.manifest)),'artifact digest');eq(result.aegisManifestSha256,meta.aegis.manifestSha256,'artifact result binding');
 if(reference)eq(meta.aegis.manifest,reference.meta.aegis.manifest,'pinned actual source/dist/package equality');
 timestamp(meta.startedAt,'start timestamp');timestamp(result.endedAt,'end timestamp');
 check(meta.startedAt>=since&&meta.startedAt<=now,'start freshness');eq(result.startedAt,meta.startedAt,'start binding');check(result.endedAt>=meta.startedAt&&result.endedAt<=now,'end freshness');
 timestamp(metaEvent.ts,'meta timestamp');check(metaEvent.ts>=meta.startedAt&&metaEvent.ts<=result.endedAt,'meta timestamp');
 let previous=metaEvent.ts;
 const rows=[];
 for(let i=0;i<20;i++){
  const e=events[i+1],s=scenarios[i],row=e.body,r=row.result;
  eq([e.t,e.from,e.to,e.topic],['message','real-aegis','moderator','scenario'],'scenario envelope');
  timestamp(e.ts,'event timestamp');check(e.ts>=previous&&e.ts<=result.endedAt,'event order/time');
  eq(row.id,s.id,'scenario id');eq(row.kind,s.kind,'scenario arm');
  eq(r.status,'returned','no child watchdog');eq(r.exit,0,'child exit');eq(r.signal,null,'child signal');eq(r.stdout,'','child stdout');eq(r.stderr,'','child stderr');
  check(!r.childError&&!r.response.error,'child error');timestamp(r.readyAt,'ready timestamp');timestamp(r.startAt,'child start timestamp');timestamp(r.endAt,'child end timestamp');
  check(r.readyAt>=previous&&r.readyAt<=r.startAt&&r.startAt<=r.endAt&&r.endAt<=e.ts,'child freshness/order');check(r.endAt-r.startAt<=WATCHDOG_MS,'parent-observed deadline');
  check(Number.isFinite(r.response.elapsedMs)&&r.response.elapsedMs>=0&&r.response.elapsedMs<=WATCHDOG_MS,'elapsed deadline');
  eq(row,assess(s,r),'recomputed row');
  if(reference){eq(r.response.evaluation,reference.rows[i].result.response.evaluation,'live full evaluation');eq(r.response.raw,reference.rows[i].result.response.raw,'live raw full evaluation');}
  rows.push(row);previous=e.ts;
 }
 const score=events.at(-1);eq(score.t,'score','terminal score');timestamp(score.ts,'score timestamp');check(score.ts>=previous&&score.ts<=result.endedAt,'score timestamp');
 const summary=metrics(rows);eq(score.scores,summary,'replayed score');eq(result.summary,summary,'result score');eq(result.passed,same(summary,thresholds),'passed classification');eq(result.failed,rows.filter(r=>!r.correct).map(r=>({id:r.id,status:r.result.status,checks:r.checks})),'failed classification');eq(result.replayEvents,22,'replay count');
 eq(basename(result.trace),`${result.runId}.jsonl`,'trace identity');
 if(traceBytes)eq(result.traceSha256,hash(traceBytes),'trace/result digest');
 return {meta,rows,summary};
}
export function verifyFrozen(){
 check(receipt.experiment===experiment&&fullSha.test(receipt.baselineSha)&&fullSha.test(receipt.candidateSha),'receipt pins');
 let green;
 const baselines=[];
 for(const [i,entry] of receipt.runs.entries()){
  const trace=readFileSync(join(root,'runs',`${entry.runId}.jsonl`)),resultBytes=readFileSync(join(root,'runs',`${entry.runId}.result.json`));
  eq(hash(trace),entry.traceSha256,'receipt trace hash');eq(hash(resultBytes),entry.resultSha256,'receipt sidecar hash');
  const events=trace.toString().trim().split('\n').map(l=>JSON.parse(l)),result=JSON.parse(resultBytes);eq(result.runId,entry.runId,'receipt identity');
  const parsed=validate(result,events,{sha:i<2?receipt.baselineSha:receipt.candidateSha,traceBytes:trace});
  if(i<2){eq(parsed.summary,receipt.baselineMetrics,'red metrics');eq(parsed.summary.controlAccuracy,1,'red controls');eq(parsed.summary.rawControlAccuracy,1,'red raw');eq(parsed.summary.admissionSafetyRate,0,'demonstrated red');baselines.push(parsed);}else{eq(parsed.summary,thresholds,'green metrics');green=parsed;}
 }
 eq(receipt.runs.length,3,'red red green count');
 for(let i=0;i<20;i++){eq(baselines[0].rows[i].result.response.evaluation,baselines[1].rows[i].result.response.evaluation,'reproducible baseline evaluation');eq(baselines[0].rows[i].checks,baselines[1].rows[i].checks,'reproducible checks');}
 return green;
}
function cli(){
 const args=process.argv.slice(2),opts={};for(let i=0;i<args.length;i+=2){check(['--run','--sha','--since'].includes(args[i])&&args[i+1]&&!Object.hasOwn(opts,args[i]),'arguments');opts[args[i]]=args[i+1];}
 const reference=verifyFrozen();
 if(args.length){check(opts['--run']&&opts['--sha']&&opts['--since'],'live requires run/sha/since');check(opts['--sha']===receipt.candidateSha,'live package must match pinned candidate');check(/^\d+$/.test(opts['--since']),'since integer');const result=json(opts['--run']);check(!receipt.runs.some(r=>r.runId===result.runId),'frozen receipt not fresh live');const trace=readFileSync(resolve(process.cwd(),result.trace));const parsed=validate(result,trace.toString().trim().split('\n').map(l=>JSON.parse(l)),{sha:opts['--sha'],since:Number(opts['--since']),reference,traceBytes:trace});eq(parsed.summary,thresholds,'live green');}
 console.log('exp70 frozen real-Aegis red/red/green and supplied fresh run verified');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))cli();
