import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {experiment,seed,holdoutSeed,scenarios,thresholds} from './scenarios.mjs';
import {assess,metrics,passing} from './oracle.mjs';
const repo=resolve(process.env.AEGIS_REPO??'');if(!process.env.AEGIS_REPO)throw Error('AEGIS_REPO required');
const root=import.meta.dirname,hash=v=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const walk=p=>readdirSync(p).sort().flatMap(n=>statSync(join(p,n)).isDirectory()?walk(join(p,n)):[join(p,n)]);
const files=['aegis','aegis-hook','aegis-collect'].flatMap(p=>[...walk(join(repo,'packages',p,'src')),...walk(join(repo,'packages',p,'dist')),join(repo,'packages',p,'package.json')]).sort();
const manifest=files.map(f=>({file:relative(repo,f),sha256:hash(readFileSync(f))}));
const harnessManifest=['scenarios.mjs','oracle.mjs','child.mjs','main.mjs'].map(file=>({file,sha256:hash(readFileSync(join(root,file)))}));
const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
const startedAt=Date.now(),runId=`pib-${startedAt.toString(36)}-${process.pid}`;
const meta={runId,experiment,seed,holdoutSeed,holdoutUsed:false,startedAt,scenarios,thresholds,harnessManifest,aegis:{sha:git('rev-parse','HEAD'),dirty:git('status','--porcelain','--','packages','package.json','pnpm-lock.yaml'),manifest,manifestSha256:hash(JSON.stringify(manifest))},node:process.version};
let observations;
try {observations=JSON.parse(execFileSync(process.execPath,[join(root,'child.mjs')],{env:{PATH:process.env.PATH,HOME:process.env.HOME,AEGIS_REPO:repo},encoding:'utf8',timeout:30000,maxBuffer:4000000}));}
catch(e){observations=scenarios.map(s=>({id:s.id,status:'infrastructure-error',response:{error:String(e)}}));}
if(observations.length!==scenarios.length||observations.some((r,i)=>r.id!==scenarios[i].id))throw Error('child scenario mismatch');
const rows=observations.map((r,i)=>assess(scenarios[i],r));
const scores=metrics(rows),events=[{t:'message',ts:startedAt,from:'moderator',to:'moderator',topic:'meta',body:meta},...rows.map(body=>({t:'message',ts:Date.now(),from:'real-aegis',to:'moderator',topic:'scenario',body})),{t:'score',ts:Date.now(),scores}];
const dir=join(root,'runs');mkdirSync(dir,{recursive:true});const trace=join(dir,`${runId}.jsonl`);writeFileSync(trace,events.map(e=>JSON.stringify(e)).join('\n')+'\n');
const result={runId,trace:relative(process.cwd(),trace),traceSha256:hash(readFileSync(trace)),startedAt,endedAt:Date.now(),aegisSha:meta.aegis.sha,aegisDirty:meta.aegis.dirty,manifestSha256:meta.aegis.manifestSha256,harnessManifest,summary:scores,passed:passing(scores),failed:rows.filter(r=>!r.correct).map(r=>({id:r.id,checks:r.checks}))};
writeFileSync(join(dir,`${runId}.result.json`),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
