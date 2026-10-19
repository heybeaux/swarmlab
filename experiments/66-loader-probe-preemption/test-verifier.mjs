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
// Observable-interface audit: a deadline claim needs actual ordered timestamps,
// and the summary/log must describe the very trace whose outcomes were checked.
run('late-library-return',e=>{row(e).result.endAt=row(e).result.startAt+1501;});
run('missing-ready',e=>{delete row(e).result.readyAt;});
run('future-run-start',e=>{e[0].body.startedAt=Date.now()+86400000;});
run('stale-row-time',e=>{const x=row(e).result;x.readyAt=1;x.startAt=1;x.endAt=2;});
run('retagged-score-event',e=>{e.at(-1).t='not-a-score';});
run('unbound-result-artifact',(_e,r)=>{r.aegis={sha:'FORGED'};});
run('missing-result-timestamps',(_e,r)=>{delete r.startedAt;delete r.endedAt;});
run('contradictory-failed-list',(_e,r)=>{r.failed=[{id:'nested-a',status:'watchdog'}];});
run('missing-result-harness',(_e,r)=>{delete r.harnessManifest;});
run('forged-result-harness',(_e,r)=>{r.harnessSha256='sha256:forged';});
run('future-result-end',(_e,r)=>{r.endedAt=Date.now()+86400000;});
run('reversed-row-times',e=>{const x=row(e).result;x.readyAt=x.startAt+10;});
run('row-before-run',e=>{row(e).result.startAt=e[0].body.startedAt-1;});
run('row-event-before-return',e=>{e.find(x=>x.topic==='scenario').ts=row(e).result.endAt-1;});
run('invalid-row-clock',e=>{row(e).result.readyAt=null;});
run('wrong-score-envelope',e=>{e.at(-1).from='fake';});
run('wrong-scenario-envelope',e=>{e.find(x=>x.topic==='scenario').to='somewhere-else';});
run('stale-score-time',e=>{e.at(-1).ts=1;});
console.log('exp66 verifier: positive +33 tamper controls passed');
