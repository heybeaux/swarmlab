// Negative controls for verify-receipts.mjs. Usage: node test-verifier.mjs <fresh-live-log.json>
// Run identity is filename-bound only (frozen harness does not embed runId in trace); a log whose runId
// disagrees with its trace path must be rejected.
// Each mutation is applied to a temporary COPY of a real live trace/log; frozen receipts are never edited.
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const dir=resolve(import.meta.dirname);
const logPath=process.argv[2];if(!logPath)throw new Error('usage: test-verifier.mjs <live-log.json>');
const live=JSON.parse(readFileSync(logPath,'utf8'));const raw=readFileSync(live.trace,'utf8');
const firstTs=JSON.parse(raw.split('\n')[0]).ts;
const row=(es,id,arm='real-aegis')=>es.find(e=>e.topic==='scenario'&&e.from===arm&&e.body.id===id).body;
function run(mutate,{since=firstTs}={}){
 const tmp=mkdtempSync(join(tmpdir(),'exp64v-'));const es=raw.trim().split('\n').map(l=>JSON.parse(l));const log=structuredClone(live);
 mutate(es,log);const trace=join(tmp,`${live.runId}.jsonl`);log.trace=trace;
 writeFileSync(trace,es.map(e=>JSON.stringify(e)).join('\n')+'\n');const lp=join(tmp,'log.json');writeFileSync(lp,JSON.stringify(log));
 const args=[join(dir,'verify-receipts.mjs'),'--run',lp];if(since!==null)args.push('--since',String(since));
 return spawnSync(process.execPath,args,{encoding:'utf8',env:{...process.env,CI:''}});
}
const cases=[
 ['missing required outputWritable',es=>{delete row(es,'consumer-to-input').checks.outputWritable;}],
 ['vacuous empty control checks',es=>{for(const e of es.filter(e=>e.topic==='scenario'&&e.from==='real-aegis'&&!e.body.hazard))e.body.checks={};}],
 ['extra unexpected check key',es=>{row(es,'tighten').checks.bonus=true;}],
 ['consent effective rule contradicts booleans',es=>{const r=row(es,'consent');r.after.rules[0].severity='high';r.after.rules[0].allowDowngrade=false;}],
 ['producer input mutated, boolean unchanged',es=>{row(es,'consumer-to-input').inputs[0][0].match.pattern='MUTATED';}],
 ['consumer action contradicts booleans',es=>{row(es,'consumer-to-input').action='deny';}],
 ['detached-control row data tampered',es=>{row(es,'sibling-results','detached-boundary-control').after.rules[0].match.pattern='TAMPERED';}],
 ['missing live summary',(es,log)=>{delete log.summary;}],
 ['wrong live summary',(es,log)=>{log.summary={...log.summary,aegisUnsafeAllowRate:0.5};}],
 ['missing run id',(es,log)=>{delete log.runId;}],
 ['retagged run id',(es,log)=>{log.runId='mro-unrelated';}],
 ['replay count mismatch',(es,log)=>{log.replayEvents=1;}],
 ['frozen receipt replayed as live',(es,log)=>{log.runId='mro-mv966i1f';}],
 ['stale timestamps before invocation',es=>{es.forEach(e=>{e.ts=0;});}],
 ['manifest tamper',es=>{es[0].body.aegis.manifest[0].sha256='sha256:invalid';}],
 ['unsafe action tamper',es=>{row(es,'new-match').action='allow';}],
];
let failures=0;
const ok=run(()=>{});if(ok.status!==0){console.error('POSITIVE CONTROL FAILED',ok.stderr);failures++;}else console.log('PASS positive control: untampered live log accepted');
const noSinceCi=spawnSync(process.execPath,[join(dir,'verify-receipts.mjs'),'--run',logPath],{encoding:'utf8',env:{...process.env,CI:'true'}});
if(noSinceCi.status===0){console.error('FAIL CI without --since accepted');failures++;}else console.log('PASS rejected: CI freshness requires --since');
for(const [name,mutate] of cases){const p=run(mutate);const err=p.stderr.match(/Error: (.+)/)?.[1];if(p.status===0){console.error(`FAIL accepted tamper: ${name}`);failures++;}else console.log(`PASS rejected: ${name} (${err})`);}
if(failures)throw new Error(`${failures} verifier negative-control failure(s)`);
console.log(`exp64 verifier negative controls: ${cases.length+1} rejections + positive control green`);
