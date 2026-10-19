import {readFileSync,existsSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,negativeControls,experiment,seed,WATCHDOG_MS,IMPORT_MS} from './scenarios.mjs';
import {assertRows,metrics,expected} from './oracle.mjs';
const root=resolve(import.meta.dirname,'../..'),dir=import.meta.dirname;
const hash=v=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const check=(v,m)=>{if(!v)throw Error(m);};
const receipts=JSON.parse(readFileSync(join(dir,'receipts.json'),'utf8'));
const normalized=rows=>rows.map(r=>({...r,result:Object.fromEntries(Object.entries(r.result).filter(([k])=>!['readyAt','startAt','endAt'].includes(k)))}));
const manifest=receipts.harnessManifest.map(f=>({file:f.file,sha256:hash(readFileSync(join(dir,f.file)))}));
check(same(manifest,receipts.harnessManifest)&&hash(JSON.stringify(manifest))===receipts.harnessSha256,'frozen harness manifest');
const clock = (value, label) => {
 check(Number.isSafeInteger(value) && value > 0 && value <= Date.now() + 5000, `valid ${label} clock`);
};
let baselineRows,greenRows;
function inspect(trace,pin,live=false,since=0){
 const bytes=readFileSync(trace),events=bytes.toString().trim().split('\n').map(JSON.parse);
 check(events.length===26,'exact26 events');
 const meta=events[0];check(meta.t==='message'&&meta.topic==='meta'&&meta.from==='moderator'&&meta.to==='moderator','metadata header');
 const m=meta.body;check(m.runId===basename(trace,'.jsonl')&&m.experiment===experiment&&m.seed===seed,'run identity');
 check(same(m.scenarios,scenarios)&&same(m.negativeControls,negativeControls)&&m.scenarioSha256===hash(JSON.stringify({scenarios,negativeControls})),'scenario identity');
 check(m.watchdogMs===WATCHDOG_MS&&m.importMs===IMPORT_MS&&same(m.harnessManifest,manifest)&&m.harnessSha256===receipts.harnessSha256,'design bound');
 check(m.aegis.dirty===''&&m.aegis.manifestSha256===hash(JSON.stringify(m.aegis.manifest)),'clean artifact manifest');
 clock(m.startedAt,'run start');
 let previous = m.startedAt;
 for(const event of events) {
  clock(event.ts,'event');check(event.ts>=previous,'event time order');previous=event.ts;
 }
 check(events.at(-1).ts-m.startedAt<120_000,'bounded experiment duration');
 const defs=[...scenarios.map(s=>({from:'real-aegis',id:s.id})),...negativeControls.map(s=>({from:'substring-control',id:s.id}))];
 for(const [i,def] of defs.entries()) {
  const event=events[i+1];
  check(same(Object.keys(event).sort(),['body','from','t','to','topic','ts']),`scenario envelope ${def.id}`);
  check(event.t==='message'&&event.topic==='scenario'&&event.from===def.from&&event.to==='moderator'&&event.body.id===def.id,'ordered scenario envelope');
 }
 const score=events.at(-1);
 check(same(Object.keys(score).sort(),['scores','t','ts'])&&score.t==='score','score envelope');
 const rows=events.filter(e=>e.t==='message'&&e.topic==='scenario'&&e.from==='real-aegis').map(e=>e.body),controls=events.filter(e=>e.t==='message'&&e.topic==='scenario'&&e.from==='substring-control').map(e=>e.body);
 assertRows(rows,controls);const summary=metrics(rows,controls);check(same(events.at(-1).scores,summary),'recomputed score');
 for(const [i,r] of [...rows,...controls].entries()) {
  const x=r.result;
  for(const k of ['readyAt','startAt','endAt'])clock(x[k],k);
  check(events[i].ts<=x.readyAt&&x.readyAt<=x.startAt&&x.startAt<=x.endAt&&x.endAt<=events[i+1].ts,'ordered child/run timing');
  if(x.status==='watchdog')check(x.endAt-x.startAt>=WATCHDOG_MS&&x.signal==='SIGKILL'&&!x.response,'real watchdog');
  if(x.status==='returned') {
   check(x.endAt-x.startAt<WATCHDOG_MS,'returned before watchdog deadline');
   check(x.exit===0&&x.signal===null&&x.stdout===''&&x.stderr==='','normal return/clean child');
  }
 }
 if(live){
  check(Number.isFinite(since)&&since>0&&m.startedAt>=since&&meta.ts>=since&&meta.ts<=Date.now()+5000,'live freshness');
  check(!receipts.runs.some(r=>r.runId===m.runId),'frozen run not live');
  const candidate=receipts.runs.find(r=>r.role==='candidate');check(m.aegis.sha===receipts.candidateSha&&same(m.aegis.manifest,candidate.aegis.manifest),'pinned real candidate');
  for(const f of m.aegis.manifest){check(!f.file.includes('..')&&!f.file.startsWith('/'),'safe manifest path');const actual=join(m.aegis.repo,f.file);check(existsSync(actual)&&hash(readFileSync(actual))===f.sha256,`actual artifact ${f.file}`);}
  check(same(summary,expected),'live green');check(same(normalized([...rows,...controls]),greenRows),'full both-arm observable rows equal admitted green');
 }else{
  check(hash(bytes)===pin.traceSha256&&m.runId===pin.runId&&same(m.aegis,pin.aegis)&&same(summary,pin.metrics)&&m.startedAt===pin.startedAt,'frozen receipt');clock(pin.endedAt,'frozen end');check(pin.endedAt>=score.ts,'frozen run completion');
  if(pin.role==='baseline'){baselineRows=normalized([...rows,...controls]);check(summary.aegisProbeWatchdogRate===1&&summary.aegisHazardRejectionRate===0&&summary.aegisControlAccuracy===12/14&&summary.substringControlAccuracy===1,'admitted red');}
  if(pin.role==='baseline-repeat')check(same(normalized([...rows,...controls]),baselineRows),'repeated exact deterministic observations');
  if(pin.role==='candidate'){check(same(summary,expected)&&m.aegis.sha===receipts.candidateSha,'admitted green');greenRows=normalized([...rows,...controls]);}
 }
 return {runId:m.runId,summary,events:events.length,metadata:m,scoreAt:score.ts,failed:rows.filter(r=>!r.correct).map(r=>({id:r.id,checks:r.checks,status:r.result.status}))};
}
for(const r of receipts.runs)inspect(join(root,r.trace),r);
const args=process.argv.slice(2),at=args.indexOf('--run');
if(at>=0) {
 check(args.length===4&&args.filter(a=>a==='--run').length===1&&args.filter(a=>a==='--since').length===1,'exact --run/--since arguments');
 const si=args.indexOf('--since');check(si>=0&&args[at+1]&&!args[at+1].startsWith('--')&&args[si+1]&&!args[si+1].startsWith('--'),'--since required for live');
 const result=JSON.parse(readFileSync(args[at+1],'utf8')),proof=inspect(result.trace,null,true,Number(args[si+1]));
 check(result.runId===proof.runId&&result.replayEvents===proof.events&&result.traceSha256===hash(readFileSync(result.trace))&&same(result.summary,proof.summary)&&result.passed===true,'result log bound to trace');
 check(result.startedAt===proof.metadata.startedAt&&same(result.aegis,proof.metadata.aegis)&&same(result.harnessManifest,proof.metadata.harnessManifest)&&result.harnessSha256===proof.metadata.harnessSha256&&same(result.failed,proof.failed),'result metadata bound to trace');
 clock(result.startedAt,'result start');clock(result.endedAt,'result end');check(result.endedAt>=proof.scoreAt,'result completion bound to trace');
} else check(args.length===0,'unknown arguments');
console.log('exp66 receipts verified: frozen repeated-red/green; exact design/observations, scores, package manifests'+(at>=0?' + fresh real artifact run':''));
