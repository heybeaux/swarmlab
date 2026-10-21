import {fork,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {experiment,seed,holdoutSeed,WATCHDOG_MS,IMPORT_MS,scenarios,negativeControls,thresholds} from './scenarios.mjs';
import {assess,metrics,expected,assertRows} from './oracle.mjs';
const repo=process.env.AEGIS_REPO;if(!repo)throw Error('AEGIS_REPO required');
const dist=resolve(repo,'packages/aegis/dist/index.js');
const hash=v=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const root=import.meta.dirname,runId=`crw-${Date.now().toString(36)}-${process.pid}`,startedAt=Date.now();
const walk=dir=>readdirSync(dir).sort().flatMap(n=>{const p=join(dir,n);return statSync(p).isDirectory()?walk(p):[p];});
const manifest=[...walk(join(repo,'packages/aegis/src')),...walk(join(repo,'packages/aegis/dist')),join(repo,'packages/aegis/package.json')].sort().map(f=>({file:relative(repo,f),sha256:hash(readFileSync(f))}));
const harnessManifest=['scenarios.mjs','oracle.mjs','child.mjs','main.mjs'].map(file=>({file,sha256:hash(readFileSync(join(root,file)))}));
const aegis={sha:execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['-C',repo,'status','--porcelain','--','packages','pnpm-lock.yaml','package.json'],{encoding:'utf8'}),repo,manifest,manifestSha256:hash(JSON.stringify(manifest))};
const childEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('AEGIS_')));
const events=[],message=(from,topic,body)=>events.push({t:'message',ts:Date.now(),from,to:'moderator',topic,body});
message('moderator','meta',{runId,experiment,seed,holdoutSeed,holdoutUsed:false,startedAt,watchdogMs:WATCHDOG_MS,importMs:IMPORT_MS,thresholds,scenarios,negativeControls,harnessManifest,harnessSha256:hash(JSON.stringify(harnessManifest)),scenarioSha256:hash(JSON.stringify({scenarios,negativeControls})),aegis,node:process.version});
function run(s){return new Promise(done=>{
  const child=fork(join(root,'child.mjs'),[s.id],{env:{...childEnv,AEGIS_DIST:dist},execArgv:[],silent:true});
  let stdout='',stderr='',status,readyAt=null,startAt=null,endAt,response,childError,closed=false,timer=setTimeout(()=>finish('import-timeout'),IMPORT_MS);
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  function finish(next){if(status)return;status=next;endAt=Date.now();clearTimeout(timer);if(next!=='returned')child.kill('SIGKILL');else timer=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},1000);}
  child.on('message',m=>{
    if(m?.type==='ready'&&readyAt===null&&!status){readyAt=m.at;startAt=Date.now();clearTimeout(timer);timer=setTimeout(()=>finish('watchdog'),WATCHDOG_MS);child.send({type:'start'});}
    else if(m?.type==='result'&&readyAt!==null&&!status){response=m.response;finish('returned');}
    else if(!status){childError=m;finish(m?.type??'unexpected-message');}
  });
  child.on('error',e=>{stderr+=String(e);finish('spawn-error');});
  child.on('close',(exit,signal)=>{closed=true;clearTimeout(timer);if(!status)finish('child-exit');done({status,...(response?{response}:{}),...(childError?{childError}:{}),readyAt,startAt,endAt,exit,signal,stdout,stderr});});
});}
const rows=[],controls=[];
for(const s of scenarios){const row=assess(s,await run(s));rows.push(row);message('real-aegis','scenario',row);}
for(const s of negativeControls){const row=assess(s,await run(s));controls.push(row);message('linear-control','scenario',row);}
assertRows(rows,controls);const scores=metrics(rows,controls);events.push({t:'score',ts:Date.now(),scores});
mkdirSync(join(root,'runs'),{recursive:true});const trace=join(root,'runs',`${runId}.jsonl`);
writeFileSync(trace,events.map(e=>JSON.stringify(e)).join('\n')+'\n');
const replay=readFileSync(trace,'utf8').trim().split('\n').map(l=>JSON.parse(l));if(!same(replay,events))throw Error('full replay mismatch');
const result={runId,trace:relative(process.cwd(),trace),traceSha256:hash(readFileSync(trace)),startedAt,endedAt:Date.now(),aegisSha:aegis.sha,aegisDirty:aegis.dirty,aegisManifestSha256:aegis.manifestSha256,harnessManifest,harnessSha256:hash(JSON.stringify(harnessManifest)),summary:scores,passed:same(scores,expected),failed:[...rows,...controls].filter(r=>!r.correct).map(r=>({id:r.id,status:r.result.status,checks:r.checks})),replayEvents:events.length};
writeFileSync(join(root,'runs',`${runId}.result.json`),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
