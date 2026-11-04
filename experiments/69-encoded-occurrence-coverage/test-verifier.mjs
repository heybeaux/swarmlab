import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {verifyBundle,root,hash} from './verify-receipts.mjs';
const log=resolve(process.argv[2]??'');if(!process.argv[2])throw Error('fresh live log required');
const result=JSON.parse(readFileSync(log)),events=readFileSync(resolve(result.trace),'utf8').trim().split('\n').map(l=>JSON.parse(l)),receipts=JSON.parse(readFileSync(join(root,'receipts.json')));
const live={log,since:result.startedAt,sha:result.aegisSha};verifyBundle({live});
function attempt(mutate){
 const r=structuredClone(result),e=structuredClone(events),c=structuredClone(receipts);mutate(e,r,c);
 const raw=e.map(v=>JSON.stringify(v)).join('\n')+'\n';r.traceSha256=hash(raw);
 const overrides=new Map([[log,JSON.stringify(r)],[resolve(r.trace),raw],[join(root,'runs',`${r.runId}.result.json`),JSON.stringify(r)],[join(root,'receipts.json'),JSON.stringify(c)]]);
 return ()=>verifyBundle({live,read:p=>overrides.has(p)?Buffer.from(overrides.get(p)):readFileSync(p)});
}
attempt(()=>{})();
const cases=[
 ['missing checks',e=>{e[1].body.checks={};}],
 ['fake action',e=>{e[1].body.result.response.evaluation.action='allow';}],
 ['fake variants',e=>{e[1].body.result.response.variants.pop();}],
 ['unscored decision metadata',e=>{e[1].body.result.response.evaluation.decidedBy='prediction';}],
 ['fake reason',e=>{e[1].body.result.response.evaluation.reason='made-up';}],
 ['fake hit',e=>{e[1].body.result.response.evaluation.matches=[];}],
 ['wrong seed',e=>{e[0].body.seed='wrong';}],
 ['loosen threshold',e=>{e[0].body.thresholds.laterPayloadMissRate=1;}],
 ['scenario changed',e=>{e[0].body.scenarios[0].call.command='safe';}],
 ['wrong package',(e,r)=>{e[0].body.aegis.sha='0'.repeat(40);r.aegisSha='0'.repeat(40);}],
 ['manifest changed',(e,r)=>{e[0].body.aegis.manifest[0].sha256='sha256:'+'0'.repeat(64);e[0].body.aegis.manifestSha256=hash(JSON.stringify(e[0].body.aegis.manifest));r.aegisManifestSha256=e[0].body.aegis.manifestSha256;}],
 ['dirty source',e=>{e[0].body.aegis.dirty=' M src/fake';}],
 ['missing end',(e,r)=>{delete r.endedAt;}],
 ['stale start',(e,r)=>{r.startedAt=1;e[0].body.startedAt=1;e[0].ts=1;}],
 ['wrong replay count',(e,r)=>{r.replayEvents=23;}],
 ['child signal',e=>{e[1].body.result.signal='SIGKILL';}],
 ['missing child ready',e=>{e[1].body.result.readyAt=null;}],
 ['slow return',e=>{e[1].body.result.response.elapsedMs=1501;}],
 ['wrong direct control',e=>{e[1].body.result.response.direct.action='allow';}],
 ['string ownership',e=>{e[1].body.result.response.ownership='true';}],
 ['recovery false',e=>{e[1].body.result.response.recovered=false;}],
 ['missing row',e=>{e.splice(1,1);}],
 ['extra row',e=>{e.splice(1,0,structuredClone(e[1]));}],
 ['duplicate receipt',(e,r,c)=>{c.runs[1]=structuredClone(c.runs[0]);}],
 ['unbound green',(e,r,c)=>{c.green.aegisSha='0'.repeat(40);}],
 ['empty pin',()=>{live.sha='';}],
 ['bad since',()=>{live.since=NaN;}],
];
for(const [name,mutate] of cases){let rejected=false;try{attempt(mutate)();}catch{rejected=true;}live.sha=result.aegisSha;live.since=result.startedAt;if(!rejected)throw Error(`accepted tamper: ${name}`);console.log(`rejected: ${name}`);}
console.log(`${cases.length} tamper rejections + actual/virtual positive controls`);
