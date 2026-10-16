import {readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
const dir=resolve(import.meta.dirname),root=resolve(dir,'../..');
const hash=v=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const receipts=JSON.parse(readFileSync(join(dir,'receipts.json'),'utf8'));
const check=(v,m)=>{if(!v)throw new Error(m);};
const ids=['substring-pattern','regex-kind','tool-scope','match-target','enabled','severity','rule-id','metadata','regex-declaration','consumer-to-source','separate-loads','shared-nested','empty','frozen','explicit-reload','explicit-compiled-edit','regex-flags','all-targets'];
const unsafe=new Set([...ids.slice(0,6),'separate-loads','shared-nested']);
const limits={detachedControlAccuracy:1,aegisProducerDriftRate:0,aegisUnsafeAllowRate:0,aegisResolutionAccuracy:1,aegisConsumerIsolation:1,aegisControlAccuracy:1,aegisCallerOwnership:1};
const keys={producer:['callerWritable','entryDenied','producerEdited','protected','snapshot'],'consumer-to-source':['callerWritable','consumerEdited','entryDenied','sourceUnchanged'],'separate-loads':['callerWritable','consumerEdited','entryDenied','protected','siblingUnchanged','sourceUnchanged'],'shared-nested':['callerWritable','consumerEdited','entryDenied','protected','siblingUnchanged','sourceUnchanged'],empty:['allow','empty'],frozen:['effect','sourceUnchanged','writable'],'explicit-reload':['callerWritable','fresh','old'],'explicit-compiled-edit':['callerWritable','effect','sourceUnchanged'],'regex-flags':['actions','callerWritable','stateless'],'all-targets':['argv','command','content','path']};
const readTrace=path=>readFileSync(path,'utf8').trim().split('\n').map(l=>JSON.parse(l));
const rows=events=>events.filter(e=>e.t==='message'&&e.topic==='scenario').map(e=>({from:e.from,body:e.body}));
check(hash(readFileSync(join(dir,'src/main.ts')))===receipts.harnessSha256,'frozen harness');
let baseline;
function inspect(path,expected,live=false){
 const events=readTrace(path);check(events.length===38,'exact38 events');
 const meta=events[0];check(meta.t==='message'&&meta.topic==='meta','metadata header');const m=meta.body;
 check(m.runId===path.split('/').at(-1).replace('.jsonl',''),'trace embedded run identity');
 check(m.experiment==='65-loaded-rule-ownership'&&m.spec==='71-loaded-rule-ownership'&&m.seed==='loaded-rule-ownership-v1','identity/seed');
 check(same(m.scenarios,ids)&&m.scenarioSha256===hash(JSON.stringify(ids))&&m.holdout==='reserved-unused-no-tuning','roster/holdout');
 check(m.harnessSha256===receipts.harnessSha256,'trace frozen harness');
 check(m.aegis.mode==='real-built-public-api'&&m.aegis.dirty==='','real clean package');
 check(m.aegis.manifestSha256===hash(JSON.stringify(m.aegis.manifest)),'manifest digest');
 check(m.aegis.manifest.find(f=>f.file==='packages/aegis/dist/index.js')?.sha256===m.aegis.distSha256,'dist digest');
 if(live){
  check(m.aegis.sha===receipts.candidateSha,'pinned candidate SHA');
  check(same(m.aegis.manifest,receipts.runs.find(r=>r.role==='candidate').aegis.manifest),'exact admitted source/dist manifest');
  for(const f of m.aegis.manifest){check(!f.file.includes('..')&&!f.file.startsWith('/'),'safe manifest path');const file=join(m.aegis.repo,f.file);check(existsSync(file)&&hash(readFileSync(file))===f.sha256,`actual live artifact ${f.file}`);}
  check(m.aegis.manifest.find(f=>f.file==='packages/aegis/src/rules/loader.ts')?.sha256===receipts.patchSourceSha256,'loader patch source');
 }else{check(m.aegis.sha===expected.aegisSha&&same(m.aegis,expected.aegis),'frozen exact package receipt');check(m.runId===expected.runId,'frozen run id');}
 const groups={};const arms=['real-aegis','detached-loader-control'];
 for(const arm of arms){const rs=events.filter(e=>e.t==='message'&&e.topic==='scenario'&&e.from===arm).map(e=>e.body);check(same(rs.map(r=>r.id),ids),`${arm} exact18 rows`);groups[arm]=rs;
  for(const [i,r] of rs.entries()){
   check(r.kind===(i<9?'producer':i<12?'consumer':'control')&&r.unsafe===unsafe.has(r.id),'metric denominators');
   check(r.checks&&same(Object.keys(r.checks).sort(),keys[i<9?'producer':r.id]),`exact check keys ${r.id}`);
   check(Object.values(r.checks).every(v=>typeof v==='boolean')&&r.correct===Object.values(r.checks).every(Boolean),'boolean checks/correctness');
   if(i<12){check(r.data.entry==='deny'&&r.checks.entryDenied===true,'original action genuinely guarded');check(r.checks.callerWritable===true,'inputs and owned outputs writable');}
   if(i<9){check(r.checks.snapshot===same(r.data.before,r.data.after),'producer snapshot oracle');check(r.checks.protected===(r.action==='deny'),'protected action oracle');check(r.checks.producerEdited===!same(r.data.sourceBefore,r.data.sourceAfter),'actual producer edit');}
   if(i>=9&&i<12){check(r.checks.sourceUnchanged===same(r.data.sourceBefore,r.data.sourceAfter),'source ownership oracle');if(i>9){check(r.checks.siblingUnchanged===(i===10?same(r.data.before,r.data.after):same(r.data.before[1],r.data.after[1])),'sibling oracle');check(r.checks.protected===(r.action==='deny'),'consumer protected action');}}
  }
 }
 const calc=arm=>{const rs=groups[arm],p=rs.slice(0,9),c=rs.slice(9,12),risk=rs.filter(r=>r.unsafe),ctrl=rs.slice(12);return{producerDriftRate:p.filter(r=>!r.checks.snapshot).length/9,unsafeAllowRate:risk.filter(r=>r.action==='allow').length/8,resolutionAccuracy:rs.filter(r=>r.correct).length/18,consumerIsolation:Number(c.every(r=>r.correct)),controlAccuracy:ctrl.filter(r=>r.correct).length/6,callerOwnership:Number(rs.every(r=>r.checks.callerWritable!==false&&r.checks.producerEdited!==false))};};
 const summary={detachedControlAccuracy:calc(arms[1]).resolutionAccuracy,...Object.fromEntries(Object.entries(calc(arms[0])).map(([k,v])=>[`aegis${k[0].toUpperCase()}${k.slice(1)}`,v]))};
 check(events.at(-1).t==='score'&&same(events.at(-1).scores,summary),'recomputed metrics');check(same(summary,live?limits:expected.metrics),'expected metrics');check(summary.detachedControlAccuracy===1,'diagnostic18/18');
 if(!live&&expected.role==='baseline'){if(baseline)check(same(groups,baseline),'baseline repeated rows');baseline=groups;}
 return {events,summary};
}
for(const r of receipts.runs){const path=join(root,r.trace);check(hash(readFileSync(path))===r.traceSha256,`trace hash ${r.runId}`);inspect(path,r);}
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
if(process.argv.includes('--run')){
 const log=JSON.parse(readFileSync(arg('--run'),'utf8'));check(typeof log.runId==='string'&&/^lro-[a-z0-9]+$/.test(log.runId),'live run id');check(log.trace?.endsWith(`/${log.runId}.jsonl`),'log trace identity');
 check(!receipts.runs.some(r=>r.runId===log.runId),'fresh, not frozen receipt');
 const {events,summary}=inspect(log.trace,null,true);check(events[0].body.runId===log.runId,'embedded log identity');check(same(log.summary,summary)&&log.replayEvents===38&&same(log.failed,[]),'log/trace equality');
 const admitted=receipts.runs.find(r=>r.role==='candidate');check(same(rows(events),rows(readTrace(join(root,admitted.trace)))),'full live observable rows equal frozen green (both arms)');
 const since=Number(arg('--since'));check(Number.isFinite(since)&&since>0,'--since required for live freshness');let prev=since;for(const e of events){check(Number.isFinite(e.ts)&&e.ts>=prev,'fresh monotonic timestamps');prev=e.ts;}check(prev<=Date.now()+60000,'not future');
}
console.log('exp65: frozen red-red-green receipts, row oracles, denominators and metrics verified; live pinned package/observable rows/freshness checked when requested');
