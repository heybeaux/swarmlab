import {readFileSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const input=JSON.parse(readFileSync(process.argv[2],'utf8')),base=readFileSync(input.trace,'utf8').trim().split('\n').map(JSON.parse),since=String(input.startedAt),dir=mkdtempSync(join(tmpdir(),'exp66-verifier-'));
const hash=v=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
function run(name,mutate,good=false){
 const events=structuredClone(base),result=structuredClone(input);mutate(events,result);
 const folder=join(dir,name);mkdirSync(folder);result.trace=join(folder,result.runId+'.jsonl');writeFileSync(result.trace,events.map(JSON.stringify).join('\n')+'\n');result.traceSha256=hash(readFileSync(result.trace));const log=join(folder,'run.json');writeFileSync(log,JSON.stringify(result));
 let ok=true;try{execFileSync(process.execPath,[join(import.meta.dirname,'verify-receipts.mjs'),'--run',log,'--since',since],{stdio:'pipe'});}catch{ok=false;}
 if(ok!==good)throw Error(`${name}: expected ${good?'accept':'reject'}, got ${ok}`);console.log(`${name}: ${ok?'accepted':'rejected'}`);
}
run('positive',()=>{},true);
const row=e=>e.find(x=>x.topic==='scenario').body;
run('missing-checks',e=>{row(e).checks={};row(e).correct=true;});
run('changed-pattern',e=>{e[0].body.scenarios[0].pack.rules[0].match.pattern='SAFE';});
run('changed-output',e=>{row(e).result.response.error.packId='wrong';});
run('changed-diagnostic',e=>{row(e).result.response.error.message='ReDoS forged';});
run('dropped-row',e=>e.splice(2,1));
run('dropped-meta',e=>e.shift());
run('stale-meta',e=>{e[0].ts=1;e[0].body.startedAt=1;});
run('wrong-sha',e=>{e[0].body.aegis.sha='0'.repeat(40);});
run('dirty-package',e=>{e[0].body.aegis.dirty='M loader.ts';});
run('forged-score',e=>{e.at(-1).scores.aegisResolutionAccuracy=0;});
run('forged-result',(_e,r)=>{r.summary={};});
run('unknown-scenario',e=>{row(e).id='renamed';});
run('missing-recovery',e=>{delete row(e).result.response.recovery;});
run('wrong-runid',e=>{e[0].body.runId='other';});
run('wrong-watchdog',e=>{e[0].body.watchdogMs=5000;});
console.log('exp66 verifier: positive +15 tamper controls passed');
