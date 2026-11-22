import {fork,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {experiment,seed,holdoutSeed,scenarios,thresholds} from './scenarios.mjs';
import {assess,metrics,passing} from './oracle.mjs';
const repo=resolve(process.env.AEGIS_REPO??'');if(!process.env.AEGIS_REPO)throw Error('AEGIS_REPO required');
const root=import.meta.dirname,hash=v=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const walk=p=>readdirSync(p).sort().flatMap(n=>statSync(join(p,n)).isDirectory()?walk(join(p,n)):[join(p,n)]);
const files=[...walk(join(repo,'packages/aegis/src')),...walk(join(repo,'packages/aegis/dist')),join(repo,'packages/aegis/package.json')].sort();
const manifest=files.map(f=>({file:relative(repo,f),sha256:hash(readFileSync(f))}));
const harnessManifest=['scenarios.mjs','oracle.mjs','child.mjs','main.mjs'].map(file=>({file,sha256:hash(readFileSync(join(root,file)))}));
const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
const startedAt=Date.now(),runId=`tlp-${startedAt.toString(36)}-${process.pid}`;
const meta={runId,experiment,seed,holdoutSeed,holdoutUsed:false,startedAt,scenarios,thresholds,harnessManifest,limits:{heapMB:256,importMs:15000,evaluateMs:3000},aegis:{sha:git('rev-parse','HEAD'),dirty:git('status','--porcelain','--','packages','package.json','pnpm-lock.yaml'),manifest,manifestSha256:hash(JSON.stringify(manifest))},node:process.version};
async function run(s){return new Promise(resolve=>{let ready=false,response,timedOut=false,stdout='',stderr='';const start=Date.now();const child=fork(join(root,'child.mjs'),[s.id],{execArgv:['--max-old-space-size=256'],env:{PATH:process.env.PATH,HOME:process.env.HOME,AEGIS_DIST:join(repo,'packages/aegis/dist/index.js')},stdio:['ignore','pipe','pipe','ipc']});let timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},15000);child.stdout.on('data',d=>stdout=(stdout+d).slice(-12000));child.stderr.on('data',d=>stderr=(stderr+d).slice(-12000));child.on('message',m=>{if(m.type==='ready'){ready=true;clearTimeout(timer);timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},3000);child.send({type:'start'});}if(m.type==='result'){response=m.response;clearTimeout(timer);timer=setTimeout(()=>child.kill('SIGKILL'),1000);}});child.on('error',e=>stderr+=String(e));child.on('close',(code,signal)=>{clearTimeout(timer);resolve({id:s.id,status:!ready?'infrastructure-error':timedOut?'watchdog':!response?'runtime-exit':response.error?'runtime-error':'ok',response,ready,startedAt:start,endedAt:Date.now(),exitCode:code,signal,stdout,stderr});});});}
const rows=[];for(const s of scenarios){rows.push(assess(s,await run(s)));process.stderr.write(`${s.id}: ${rows.at(-1).observation.status} correct=${rows.at(-1).correct}\n`);}
const scores=metrics(rows),events=[{t:'message',ts:startedAt,from:'moderator',to:'moderator',topic:'meta',body:meta},...rows.map(body=>({t:'message',ts:Date.now(),from:'real-aegis',to:'moderator',topic:'scenario',body})),{t:'score',ts:Date.now(),scores}];
const dir=join(root,'runs');mkdirSync(dir,{recursive:true});const trace=join(dir,`${runId}.jsonl`);writeFileSync(trace,events.map(e=>JSON.stringify(e)).join('\n')+'\n');
const result={runId,trace:relative(process.cwd(),trace),traceSha256:hash(readFileSync(trace)),startedAt,endedAt:Date.now(),aegisSha:meta.aegis.sha,aegisDirty:meta.aegis.dirty,manifestSha256:meta.aegis.manifestSha256,harnessManifest,summary:scores,passed:passing(scores),failed:rows.filter(r=>!r.correct).map(r=>({id:r.id,status:r.observation.status,checks:r.checks}))};writeFileSync(join(dir,`${runId}.result.json`),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));process.exitCode=result.passed?0:1;
