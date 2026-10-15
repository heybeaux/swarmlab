import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
import {MessageBus,TraceWriter,readRunRecord} from '@swarmlab/core';

type Rule={id:string;category:'bash';severity:'low'|'high'|'critical';description:string;match:{kind:'substring';pattern:string;target:'command'};appliesTo:string[];enabled?:boolean;allowDowngrade?:boolean;references?:string[]};
type Result={rules:Rule[];warnings:{ruleId:string;message:string}[]};
type Runtime={mergeLayers(l:Rule[][]):Result;loadPack(p:unknown):unknown[];evaluate(c:unknown,r:unknown[],o:unknown):{action:string}};
const REPO=process.env['AEGIS_REPO'];if(!REPO)throw new Error('AEGIS_REPO required');
const DIST=process.env['AEGIS_DIST']??join(REPO,'packages/aegis/dist/index.js');
const runtime=await import(pathToFileURL(DIST).href) as Runtime;
const hash=(v:string|Buffer)=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const copy=<T>(v:T):T=>structuredClone(v);
const exp='64-merged-rule-ownership',seed='merged-rule-ownership-v1';
const rule=(id='policy.protected'):Rule=>({id,category:'bash',severity:'high',description:'protected action',match:{kind:'substring',pattern:'DANGER',target:'command'},appliesTo:['Bash'],enabled:true,references:['CWE-77']});
const evaluate=(rules:Rule[])=>runtime.evaluate({tool:'Bash',command:'DANGER'},runtime.loadPack({packId:'ownership',version:'1',rules}),{severityTable:{low:'allow',medium:'ask',high:'deny',critical:'deny'}}).action;
const hazards=['new-top','new-match','new-scope','new-references','overlay-top','overlay-match','overlay-scope','inherited-references','rejected-base','consumer-to-input','sibling-results','shared-nested-rules'];
const controls=['empty','insertion-dedup','tighten','reject','consent','frozen','explicit-output','explicit-remerge','warnings'];
const unsafe=new Set(['new-top','new-match','new-scope','overlay-top','overlay-match','overlay-scope','rejected-base','sibling-results','shared-nested-rules']);
const scenarios=[...hazards,...controls];
type Row={id:string;hazard:boolean;producer:boolean;unsafe:boolean;checks:Record<string,boolean>;correct:boolean;action?:string;before?:unknown;after?:unknown;inputs?:unknown;warnings?:unknown};
const results:Record<string,Row[]>={};
function frozen<T>(v:T):T{if(v&&typeof v==='object'){for(const child of Object.values(v))frozen(child);Object.freeze(v);}return v;}
function mutable(r:Rule){return !Object.isFrozen(r)&&!Object.isFrozen(r.match)&&!Object.isFrozen(r.appliesTo)&&(!r.references||!Object.isFrozen(r.references));}
for(const arm of ['real-aegis','detached-boundary-control']){
 const merge=(l:Rule[][])=>{const x=runtime.mergeLayers(arm==='real-aegis'?l:l.map(a=>a.map(copy)));return arm==='real-aegis'?x:{...x,rules:x.rules.map(copy)};};
 const rows:Row[]=[];
 for(const id of hazards){
  const base=rule();const overlay=rule();overlay.description='reviewed description';if(id==='inherited-references')delete overlay.references;if(id==='rejected-base')overlay.severity='low';
  const layers:Rule[][]=id.startsWith('overlay')||id==='inherited-references'||id==='rejected-base'||id==='consumer-to-input'?[[base],[overlay]]:[[base]];
  if(id==='shared-nested-rules')layers[0]!.push({...base,id:'policy.second'});
  const original=copy(layers);const r=merge(layers),before=copy(r);const second=id==='sibling-results'?merge(layers):undefined;
  const siblingBefore=second?copy(second):undefined;
  const entry=evaluate(r.rules);const producer=hazards.indexOf(id)<9;
  if(id==='new-top'||id==='overlay-top'){const src=id==='new-top'?base:overlay;src.severity='low';src.enabled=false;src.id='changed.id';}
  else if(id==='new-match'||id==='overlay-match'||id==='rejected-base'){(id==='overlay-match'?overlay:base).match.pattern='NEVER';}
  else if(id==='new-scope'||id==='overlay-scope'){(id==='overlay-scope'?overlay:base).appliesTo.splice(0,1,'Other');}
  else if(id==='new-references'||id==='inherited-references')base.references!.push('edited');
  else {const out=r.rules[0]!;out.match.pattern='NEVER';out.appliesTo.splice(0,1,'Other');out.references!.push('edited');if(id==='consumer-to-input'){out.id='consumer';out.severity='low';out.enabled=false;out.description='consumer';}}
  const checks:Record<string,boolean>={entryDenied:entry==='deny',callerWritable:layers.flat().every(mutable),warningShape:before.warnings.length===(id==='rejected-base'?1:0)};
  let action:string;
  if(producer){action=evaluate(r.rules);checks.snapshot=same(r,before);checks.protected=action==='deny';}
  else if(id==='consumer-to-input'){action=evaluate(r.rules);checks.input=same(layers,original);checks.outputWritable=mutable(r.rules[0]!);}
  else if(id==='sibling-results'){action=evaluate(second!.rules);checks.sibling=same(second,siblingBefore);checks.input=same(layers,original);checks.protected=action==='deny';}
  else {action=evaluate([r.rules[1]!]);checks.sibling=same(r.rules[1],before.rules[1]);checks.input=same(layers,original);checks.protected=action==='deny';}
  rows.push({id,hazard:true,producer,unsafe:unsafe.has(id),checks,correct:Object.values(checks).every(Boolean),action,before,after:copy(r),inputs:copy(layers),warnings:copy(r.warnings)});
 }
 const add=(id:string,checks:Record<string,boolean>,r?:Result)=>rows.push({id,hazard:false,producer:false,unsafe:false,checks,correct:Object.values(checks).every(Boolean),...(r?{after:copy(r)}:{})});
 add('empty',{empty:same(merge([]),{rules:[],warnings:[]})&&same(merge([[],[]]),{rules:[],warnings:[]})});
 {const a=rule('__proto__'),b=rule('policy.other'),c=rule('__proto__');c.description='later';const r=merge([[a,b],[c]]);add('insertion-dedup',{order:same(r.rules.map(r=>r.id),['__proto__','policy.other']),collapse:r.rules.length===2,precedence:r.rules[0]!.description==='later'},r);}
 {const a=rule(),b=rule();b.severity='critical';const r=merge([[a],[b]]);add('tighten',{severity:r.rules[0]!.severity==='critical',warn:r.warnings.length===0,deny:evaluate(r.rules)==='deny'},r);}
 {const a=rule(),b=rule();b.severity='low';b.description='rejected';const r=merge([[a],[b]]);add('reject',{retained:same(r.rules[0],a),warn:r.warnings.length===1,deny:evaluate(r.rules)==='deny'},r);}
 {const a=rule(),b=rule();b.severity='low';b.allowDowngrade=true;const r=merge([[a],[b]]);add('consent',{accepted:r.rules[0]!.severity==='low',warn:r.warnings.length===0,allow:evaluate(r.rules)==='allow'},r);}
 {const a=frozen(rule()),b=frozen(rule());const r=merge([ [a],[b] ]);let writable=true;try{r.rules[0]!.match.pattern='NEVER';r.rules[0]!.appliesTo.push('Other');r.rules[0]!.references!.push('edited');}catch{writable=false;}add('frozen',{input:same(a,rule())&&same(b,rule()),writable,allow:writable&&evaluate(r.rules)==='allow'},r);}
 {const a=rule(),r=merge([[a]]);r.rules[0]!.enabled=false;add('explicit-output',{effect:evaluate(r.rules)==='allow',writable:mutable(r.rules[0]!)},r);}
 {const a=rule(),old=merge([[a]]),before=copy(old);a.match.pattern='NEVER';const next=merge([[a]]);add('explicit-remerge',{old:same(old,before)&&evaluate(old.rules)==='deny',new:same(next.rules[0],a)&&evaluate(next.rules)==='allow'},next);}
 {const a=rule(),b=rule();b.severity='low';const first=merge([[a],[b]]),second=merge([[a],[b]]);first.warnings[0]!.message='consumer';first.warnings.push({ruleId:'local',message:'extra'});add('warnings',{independent:second.warnings.length===1&&second.warnings[0]!.message!=='consumer'});}
 results[arm]=rows;
}
const metrics=(arm:string)=>{const rows=results[arm]!,prod=rows.filter(r=>r.producer),cons=rows.filter(r=>r.hazard&&!r.producer),risk=rows.filter(r=>r.unsafe),ctrl=rows.filter(r=>!r.hazard);return{producerDriftRate:prod.filter(r=>!r.checks['snapshot']).length/prod.length,unsafeAllowRate:risk.filter(r=>r.action==='allow').length/risk.length,resolutionAccuracy:rows.filter(r=>r.correct).length/rows.length,consumerIsolation:Number(cons.every(r=>r.correct)),controlAccuracy:ctrl.filter(r=>r.correct).length/ctrl.length,callerOwnership:Number(rows.filter(r=>r.hazard).every(r=>r.checks['callerWritable']))};};
const runId=`mro-${Date.now().toString(36)}`,dir=join(import.meta.dirname,'..','runs');mkdirSync(dir,{recursive:true});const path=join(dir,`${runId}.jsonl`);const trace=new TraceWriter(path,{runId,experiment:exp}),bus=new MessageBus({trace});
const walk=(dir:string):string[]=>readdirSync(dir).sort().flatMap(n=>{const p=join(dir,n);return statSync(p).isDirectory()?walk(p):[p];});
const files=[...walk(join(REPO,'packages/aegis/src')),...walk(join(REPO,'packages/aegis/dist')),join(REPO,'packages/aegis/package.json')].sort();
const manifest=files.map(file=>({file:relative(REPO,file),sha256:hash(readFileSync(file))}));
bus.publish({from:'moderator',to:'*',topic:'meta',body:{evidenceVersion:1,experiment:exp,spec:'70-merged-rule-ownership',seed,holdout:'reserved-unused-no-tuning',scenarios,scenarioSha256:hash(JSON.stringify(scenarios)),harnessSha256:hash(readFileSync(join(import.meta.dirname,'..','src/main.ts'))),aegis:{sha:execFileSync('git',['-C',REPO,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['-C',REPO,'status','--porcelain'],{encoding:'utf8'}),repo:REPO,distSha256:hash(readFileSync(DIST)),manifest,manifestSha256:hash(JSON.stringify(manifest)),mode:'real-built-public-api'}}});
for(const [arm,rows] of Object.entries(results)){for(const row of rows)bus.publish({from:arm,to:'moderator',topic:'scenario',body:row});trace.append({t:'score',ts:Date.now(),scores:Object.fromEntries(Object.entries(metrics(arm)).map(([k,v])=>[`${arm.replaceAll('-','_')}_${k}`,v]))});}
const summary={detachedControlAccuracy:metrics('detached-boundary-control').resolutionAccuracy,...Object.fromEntries(Object.entries(metrics('real-aegis')).map(([k,v])=>[`aegis${k[0]!.toUpperCase()}${k.slice(1)}`,v]))};trace.append({t:'score',ts:Date.now(),scores:summary});
const replay=await readRunRecord(path);if(!same(replay.events,trace.toRunRecord().events))throw new Error('full replay mismatch');
console.log(JSON.stringify({runId,summary,failed:results['real-aegis']!.filter(r=>!r.correct).map(r=>({id:r.id,checks:r.checks})),replayEvents:replay.events.length,trace:path},null,2));
if(summary.detachedControlAccuracy!==1)throw new Error('detached diagnostic failed; fixture not admissible');
