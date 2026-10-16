// Tamper only temporary copies. The admitted content-addressed traces remain immutable.
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const dir=import.meta.dirname,lp=process.argv[2];if(!lp)throw new Error('fresh live log required');
const live=JSON.parse(readFileSync(lp,'utf8')),raw=readFileSync(live.trace,'utf8'),firstTs=JSON.parse(raw.split('\n')[0]).ts;
const row=(es,id,arm='real-aegis')=>es.find(e=>e.topic==='scenario'&&e.from===arm&&e.body.id===id).body;
function run(mutate){const tmp=mkdtempSync(join(tmpdir(),'exp65v-')),es=raw.trim().split('\n').map(l=>JSON.parse(l)),log=structuredClone(live);mutate(es,log);log.trace=join(tmp,`${live.runId}.jsonl`);const path=join(tmp,'log.json');writeFileSync(log.trace,es.map(e=>JSON.stringify(e)).join('\n')+'\n');writeFileSync(path,JSON.stringify(log));return spawnSync(process.execPath,[join(dir,'verify-receipts.mjs'),'--run',path,'--since',String(firstTs)],{encoding:'utf8'});}
const cases=[
 ['missing check',es=>delete row(es,'substring-pattern').checks.snapshot],
 ['vacuous control',es=>{row(es,'frozen').checks={};}],
 ['extra check',es=>{row(es,'empty').checks.bonus=true;}],
 ['loaded-rule tamper unchanged booleans',es=>{row(es,'explicit-compiled-edit').data.loaded[0].rule.severity='critical';row(es,'explicit-compiled-edit').data.loaded[0].rule.id='forged';}],
 ['source tamper',es=>{row(es,'consumer-to-source').data.sourceAfter[0].match.pattern='FORGED';}],
 ['action tamper',es=>{row(es,'enabled').action='allow';}],
 ['diagnostic tamper',es=>{row(es,'regex-flags','detached-loader-control').data.actions[0]='allow';}],
 ['embedded identity tamper',es=>{es[0].body.runId='lro-forged';}],
 ['log identity tamper',(_es,log)=>{log.runId='lro-forged';}],
 ['missing summary',(_es,log)=>{delete log.summary;}],
 ['wrong replay count',(_es,log)=>{log.replayEvents=1;}],
 ['manifest tamper',es=>{es[0].body.aegis.manifest[0].sha256='sha256:invalid';}],
 ['stale timestamp',es=>{es.forEach(e=>e.ts=0);}],
 ['missing scenario',es=>{es.splice(1,1);}],
 ['reordered rows',es=>{[es[1],es[2]]=[es[2],es[1]];}],
];
const positive=run(()=>{});if(positive.status!==0)throw new Error(`positive control failed: ${positive.stderr}`);console.log('PASS untampered live positive');
for(const [name,mutate] of cases){const r=run(mutate);if(r.status===0)throw new Error(`accepted tamper ${name}`);console.log(`PASS rejected ${name}`);}
const missingSince=spawnSync(process.execPath,[join(dir,'verify-receipts.mjs'),'--run',lp],{encoding:'utf8'});if(missingSince.status===0)throw new Error('accepted live without freshness boundary');
console.log(`exp65 verifier: ${cases.length+1} tamper/freshness rejections + positive accepted`);
