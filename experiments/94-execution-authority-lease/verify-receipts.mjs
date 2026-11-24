import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {experiment,seed,holdoutSeed,scenarios,thresholds} from './scenarios.mjs';
import {assess,metrics,passing} from './oracle.mjs';
const root=import.meta.dirname,repoRoot=resolve(root,'../..');
export const hash=v=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
export const receipts=JSON.parse(readFileSync(join(root,'receipts.json'),'utf8'));
const frozenFiles=['scenarios.mjs','oracle.mjs','child.mjs','main.mjs'];
const currentHarness=frozenFiles.map(file=>({file,sha256:hash(readFileSync(join(root,file)))}));
const checkedPath=(base,path)=>{assert.equal(typeof path,'string');assert(!isAbsolute(path));const out=resolve(base,path);assert(!relative(base,out).startsWith('..'));return out;};
export function validate(result,events,{expectedSha,expectedScores,since=0,artifactRepo}={}) {
 assert.match(result.runId,/^eal-[a-z0-9]+-\d+$/);
 assert.equal(result.trace,`experiments/${experiment}/runs/${result.runId}.jsonl`);
 assert.equal(events.length,scenarios.length+2);
 assert.equal(events[0].t,'message');assert.equal(events[0].topic,'meta');
 const m=events[0].body;
 assert.equal(m.runId,result.runId);assert.equal(m.experiment,experiment);assert.equal(m.seed,seed);assert.equal(m.holdoutSeed,holdoutSeed);assert.equal(m.holdoutUsed,false);
 assert.deepEqual(m.scenarios,scenarios);assert.deepEqual(m.thresholds,thresholds);
 assert.deepEqual(m.harnessManifest,currentHarness);assert.deepEqual(result.harnessManifest,currentHarness);
 assert.equal(m.aegis.sha,expectedSha);assert.equal(result.aegisSha,expectedSha);assert.equal(m.aegis.dirty,'');assert.equal(result.aegisDirty,'');
 assert.equal(m.aegis.manifestSha256,hash(JSON.stringify(m.aegis.manifest)));assert.equal(result.manifestSha256,m.aegis.manifestSha256);
 const paths=m.aegis.manifest.map(x=>x.file);assert.equal(new Set(paths).size,paths.length);
 for(const pkg of ['aegis','aegis-hook','aegis-collect']){assert(paths.some(p=>p.startsWith(`packages/${pkg}/src/`)));assert(paths.includes(`packages/${pkg}/dist/index.js`));assert(paths.includes(`packages/${pkg}/package.json`));}
 for(const entry of m.aegis.manifest){checkedPath(repoRoot,entry.file);assert.match(entry.sha256,/^sha256:[a-f0-9]{64}$/);}
 assert.equal(m.startedAt,result.startedAt);
 assert(Number.isSafeInteger(result.startedAt)&&result.startedAt>=since);assert(Number.isSafeInteger(result.endedAt)&&result.endedAt>=result.startedAt&&result.endedAt<=Date.now());
 let last=result.startedAt;
 for(const e of events){assert(Number.isSafeInteger(e.ts)&&e.ts>=last&&e.ts<=result.endedAt);last=e.ts;}
 const raw=events.slice(1,-1).map((e,i)=>{assert.equal(e.t,'message');assert.equal(e.topic,'scenario');assert.equal(e.from,'real-aegis');assert.equal(e.body.id,scenarios[i].id);return e.body;});
 const scored=raw.map((r,i)=>assess(scenarios[i],r));
 for(let i=0;i<raw.length;i++){assert.deepEqual(raw[i].checks,scored[i].checks);assert.equal(raw[i].correct,scored[i].correct);}
 const scores=metrics(scored);
 assert.equal(events.at(-1).t,'score');assert.deepEqual(events.at(-1).scores,scores);assert.deepEqual(result.summary,scores);assert.deepEqual(scores,expectedScores);assert.equal(result.passed,passing(scores));
 assert.deepEqual(result.failed,scored.filter(r=>!r.correct).map(r=>({id:r.id,checks:r.checks})));
 if(artifactRepo){const git=(...a)=>execFileSync('git',['-C',artifactRepo,...a],{encoding:'utf8'}).trim();assert.equal(git('rev-parse','HEAD'),expectedSha);assert.equal(git('status','--porcelain','--','packages','package.json','pnpm-lock.yaml'),'');for(const f of m.aegis.manifest)assert.equal(hash(readFileSync(checkedPath(artifactRepo,f.file))),f.sha256);}
 return {runId:result.runId,scores,raw};
}
export function verify(result,options){const text=readFileSync(checkedPath(repoRoot,result.trace),'utf8');assert.equal(hash(text),result.traceSha256);return validate(result,text.trim().split('\n').map(JSON.parse),options);}
function admitted(){
 const git=(...a)=>execFileSync('git',['-C',repoRoot,...a],{encoding:'utf8'}).trim();
 const preTime=Number(git('show','-s','--format=%ct',receipts.preregistrationCommit))*1000;
 for(const f of frozenFiles){const blob=execFileSync('git',['-C',repoRoot,'show',`${receipts.frozenHarnessCommit}:experiments/${experiment}/${f}`]);assert.equal(hash(blob),currentHarness.find(x=>x.file===f).sha256);}
 const base=[];
 for(const r of receipts.baseline){assert(r.startedAt>=preTime);base.push(verify(r,{expectedSha:receipts.baseline[0].aegisSha,expectedScores:receipts.baseline[0].summary}));}
 assert.deepEqual(base[0].raw,base[1].raw);assert.equal(base[0].scores.unsafeExecutionRate,24/26);assert.equal(base[0].scores.scenarioAccuracy,8/34);assert.equal(base[0].scores.infrastructureFailures,0);
 assert(receipts.candidate.startedAt>receipts.baseline[1].endedAt);
 verify(receipts.candidate,{expectedSha:receipts.candidate.aegisSha,expectedScores:thresholds});
 console.log('Admitted red/red/green evidence verified; all raw outcomes rescored.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 admitted();
 const index=process.argv.indexOf('--run');
 if(index>=0){const arg=k=>process.argv[process.argv.indexOf(k)+1];assert(process.argv.includes('--sha')&&process.argv.includes('--since')&&process.argv.includes('--repo'));const r=JSON.parse(readFileSync(process.argv[index+1],'utf8'));verify(r,{expectedSha:arg('--sha'),since:Number(arg('--since')),expectedScores:thresholds,artifactRepo:resolve(arg('--repo'))});console.log(`Fresh real artifact verified: ${r.runId}`);}
}
