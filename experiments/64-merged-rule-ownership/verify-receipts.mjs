import {readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
const dir=resolve(import.meta.dirname),root=resolve(dir,'../..');
const hash=v=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const receipts=JSON.parse(readFileSync(join(dir,'receipts.json'),'utf8'));
const fail=message=>{throw new Error(message);};
const check=(v,m)=>{if(!v)fail(m);};
const ids=['new-top','new-match','new-scope','new-references','overlay-top','overlay-match','overlay-scope','inherited-references','rejected-base','consumer-to-input','sibling-results','shared-nested-rules','empty','insertion-dedup','tighten','reject','consent','frozen','explicit-output','explicit-remerge','warnings'];
const limits={detachedControlAccuracy:1,aegisProducerDriftRate:0,aegisUnsafeAllowRate:0,aegisResolutionAccuracy:1,aegisConsumerIsolation:1,aegisControlAccuracy:1,aegisCallerOwnership:1};
check(hash(readFileSync(join(dir,'src/main.ts')))===receipts.harnessSha256,'frozen harness hash');
let baselineRows;
function inspect(path,expected,live=false){
 const events=readFileSync(path,'utf8').trim().split('\n').map(l=>JSON.parse(l));
 check(events.length===46,'exact46 events');const meta=events[0];check(meta.t==='message'&&meta.topic==='meta','header');
 const m=meta.body;check(m.experiment==='64-merged-rule-ownership'&&m.seed==='merged-rule-ownership-v1','experiment/seed');
 check(same(m.scenarios,ids),'frozen roster');check(m.scenarioSha256===hash(JSON.stringify(ids)),'roster hash');
 check(m.holdout==='reserved-unused-no-tuning','holdout discipline');check(m.harnessSha256===receipts.harnessSha256,'trace harness');
 check(m.aegis.mode==='real-built-public-api'&&m.aegis.dirty==='','real clean package');
 check(m.aegis.manifestSha256===hash(JSON.stringify(m.aegis.manifest)),'manifest digest');
 const manifest=m.aegis.manifest;check(manifest.some(x=>x.file==='packages/aegis/src/rules/merge.ts')&&manifest.some(x=>x.file==='packages/aegis/dist/index.js'),'source and built artifact manifest');
 check(manifest.find(x=>x.file==='packages/aegis/dist/index.js').sha256===m.aegis.distSha256,'entry dist hash');
 if(live){check(m.aegis.sha===receipts.candidateSha,'live pinned runtime SHA');for(const f of manifest){const p=join(m.aegis.repo,f.file);check(existsSync(p)&&hash(readFileSync(p))===f.sha256,`live artifact ${f.file}`);}check(manifest.find(x=>x.file==='packages/aegis/src/rules/merge.ts').sha256===receipts.patchSourceSha256,'live runtime source patch');}
 else check(m.aegis.sha===expected.aegisSha,'frozen package SHA');
 const arms=['real-aegis','detached-boundary-control'];const groups={};
 for(const arm of arms){const rows=events.filter(e=>e.t==='message'&&e.topic==='scenario'&&e.from===arm).map(e=>e.body);check(same(rows.map(r=>r.id),ids),`${arm} exact row roster`);groups[arm]=rows;
  for(const [i,r] of rows.entries()){check(r.hazard===(i<12)&&r.producer===(i<9),'hazard denominator');check(r.unsafe===([0,1,2,4,5,6,8,10,11].includes(i)),'unsafe denominator');check(Object.values(r.checks).every(v=>typeof v==='boolean'),'boolean checks');check(r.correct===Object.values(r.checks).every(Boolean),'row correctness');
   if(i<12){check(r.checks.entryDenied===true,'baseline guarded deny fixture');check(r.checks.callerWritable===true,'caller mutable');check(r.checks.warningShape===true,'warning compatibility');}
   if(i<9){check(r.checks.snapshot===same(r.before,r.after),'independent producer snapshot equality');check(r.checks.protected===(r.action==='deny'),'protected action');}
  }
 }
 const calc=arm=>{const rows=groups[arm],p=rows.filter(r=>r.producer),c=rows.filter(r=>r.hazard&&!r.producer),risk=rows.filter(r=>r.unsafe),ctrl=rows.filter(r=>!r.hazard);return{producerDriftRate:p.filter(r=>!r.checks.snapshot).length/9,unsafeAllowRate:risk.filter(r=>r.action==='allow').length/9,resolutionAccuracy:rows.filter(r=>r.correct).length/21,consumerIsolation:Number(c.every(r=>r.correct)),controlAccuracy:ctrl.filter(r=>r.correct).length/9,callerOwnership:Number(rows.filter(r=>r.hazard).every(r=>r.checks.callerWritable))};};
 const scoreEvents=events.filter(e=>e.t==='score');check(scoreEvents.length===3,'score count');for(const [i,arm] of arms.entries()){const metrics=calc(arm);check(same(scoreEvents[i].scores,Object.fromEntries(Object.entries(metrics).map(([k,v])=>[`${arm.replaceAll('-','_')}_${k}`,v]))),'recomputed arm scores');}
 const summary={detachedControlAccuracy:calc(arms[1]).resolutionAccuracy,...Object.fromEntries(Object.entries(calc(arms[0])).map(([k,v])=>[`aegis${k[0].toUpperCase()}${k.slice(1)}`,v]))};check(same(scoreEvents[2].scores,summary),'recomputed last summary');check(same(summary,live?limits:expected.metrics),'frozen expected thresholds/observed baseline');check(calc(arms[1]).resolutionAccuracy===1,'diagnostic all21 ground truth');
 if(!live&&expected.role==='baseline'){if(baselineRows)check(same(groups,baselineRows),'repeated baseline identical rows');baselineRows=groups;}
 console.log(`verified ${m.runId??expected?.runId??path}: ${JSON.stringify(summary)}`);
}
for(const r of receipts.runs){const path=join(root,r.trace);check(hash(readFileSync(path))===r.traceSha256,`content-addressed ${r.runId}`);inspect(path,r);}
if(process.argv.includes('--run')){const log=JSON.parse(readFileSync(process.argv[process.argv.indexOf('--run')+1],'utf8'));check(log.failed.length===0,'fresh live rows green');inspect(log.trace,null,true);}
console.log('exp64 frozen receipts/roster/row checks/ground truth snapshots/recomputed metrics verified');
