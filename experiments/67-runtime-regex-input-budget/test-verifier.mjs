// Adversarial verifier self-check; generated audit artifacts retained outside admitted corpus.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=import.meta.dirname,log=process.argv[2];if(!log)throw Error('live log required');
const live=JSON.parse(readFileSync(resolve(log),'utf8')),events=readFileSync(resolve(live.trace),'utf8').trim().split('\n').map(l=>JSON.parse(l)),since=live.startedAt,sha=live.aegisSha;
const hash=b=>`sha256:${createHash('sha256').update(b).digest('hex')}`;
const cases=[
 ['empty check map',(e,r)=>{e[1].body.checks={};e[1].body.correct=true;}],
 ['late native return',(e,r)=>{e[1].body.result.response.elapsedMs=1501;}],
 ['missing ready timestamp',(e,r)=>{e[1].body.result.readyAt=null;}],
 ['future run start',(e,r)=>{r.startedAt=Date.now()+60000;e[0].body.startedAt=r.startedAt;}],
 ['stale child timestamp',(e,r)=>{e[1].body.result.response.startedAt=0;}],
 ['non-score terminal event',(e,r)=>{e.at(-1).t='message';}],
 ['unbound result manifest',(e,r)=>{r.aegisManifestSha256='sha256:'+'0'.repeat(64);} ],
 ['missing result end timestamp',(e,r)=>{delete r.endedAt;}],
 ['contradictory failed list',(e,r)=>{r.failed=[{id:'nested-q-command'}];}],
 ['actual action changed, booleans intact',(e,r)=>{e[1].body.result.response.evaluation.action='allow';}],
 ['actual reason changed, booleans intact',(e,r)=>{e[1].body.result.response.evaluation.reason='pretend regex budget unavailable';}],
 ['fabricated hazard hit',(e,r)=>{e[1].body.result.response.evaluation.matches.push({id:'hz.q.command',severity:'high',category:'bash',target:'command'});} ],
 ['missing embedded run id',(e,r)=>{delete e[0].body.runId;}],
 ['changed package sha',(e,r)=>{e[0].body.aegis.sha='0'.repeat(40);r.aegisSha='0'.repeat(40);} ],
 ['changed real artifact',(e,r)=>{e[0].body.aegis.manifest[0].sha256='sha256:'+'0'.repeat(64);e[0].body.aegis.manifestSha256=hash(JSON.stringify(e[0].body.aegis.manifest));r.aegisManifestSha256=e[0].body.aegis.manifestSha256;}],
 ['changed seed',(e,r)=>{e[0].body.seed='different';}],
 ['changed threshold',(e,r)=>{e[0].body.thresholds.runtimeWatchdogRate=1;}],
 ['changed scenario recipe',(e,r)=>{e[0].body.scenarios[0].call.command='safe';}],
 ['late parent return',(e,r)=>{e[1].body.result.endAt=e[1].body.result.startAt+1700;}],
 ['returned but child killed',(e,r)=>{e[1].body.result.signal='SIGKILL';}],
 ['incorrect recovery receipt',(e,r)=>{e[1].body.result.response.recovery.allow='ask';}],
 ['non-boolean ownership',(e,r)=>{e[1].body.result.response.ownership='true';}],
 ['missing scenario',(e,r)=>{e.splice(1,1);} ],
 ['extra scenario',(e,r)=>{e.splice(1,0,structuredClone(e[1]));}],
];
function run(path){return spawnSync(process.execPath,[join(root,'verify-receipts.mjs'),'--run',path,'--since',String(since),'--sha',sha],{cwd:process.cwd(),encoding:'utf8'});}
const positive=run(resolve(log));if(positive.status!==0)throw Error(`positive rejected: ${positive.stderr}`);
const audit=join(root,'verifier-audit');mkdirSync(audit,{recursive:true});
for(let i=0;i<cases.length;i++){
 const [name,mutate]=cases[i],e=structuredClone(events),r=structuredClone(live),id=`rrib-tamper-${process.pid*100+i}`;
 const trace=join(audit,`${id}.jsonl`),sidecar=join(root,'runs',`${id}.result.json`),out=join(audit,`${id}.log.json`);if(existsSync(sidecar))throw Error('refuse overwrite');
 r.runId=id;e[0].body.runId=id;r.trace=trace;mutate(e,r);
 const raw=e.map(v=>JSON.stringify(v)).join('\n')+'\n';writeFileSync(trace,raw);r.traceSha256=hash(raw);
 writeFileSync(sidecar,JSON.stringify(r));writeFileSync(out,JSON.stringify(r));
 const result=run(out);writeFileSync(join(audit,`${id}.verifier.log`),result.stdout+result.stderr);if(result.status===0)throw Error(`tamper accepted: ${name}`);
 // Keep own generated artifacts but not in the admitted runs directory.
 const {renameSync}=await import('node:fs');renameSync(sidecar,join(audit,`${id}.result.json`));
 console.log(`rejected: ${name}`);
}
console.log(`${cases.length} tamper rejections + positive control`);
