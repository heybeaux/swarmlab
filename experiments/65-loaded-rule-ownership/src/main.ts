import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
import {MessageBus,TraceWriter,readRunRecord} from '@swarmlab/core';

type Target='command'|'content'|'path'|'argv';
type Rule={id:string;category:'bash';severity:'low'|'critical';description:string;match:{kind:'substring'|'regex';pattern:string;flags?:string;target:Target};appliesTo:string[];enabled?:boolean;references?:string[];remediation?:string};
type Compiled={rule:Rule;regex?:RegExp};
type Runtime={loadPack(p:{packId:string;version:string;rules:Rule[]}):Compiled[];evaluate(c:unknown,r:Compiled[]):{action:string;matches:unknown[]}};
const REPO=process.env['AEGIS_REPO'];if(!REPO)throw new Error('AEGIS_REPO required');
const DIST=join(REPO,'packages/aegis/dist/index.js');
const runtime=await import(pathToFileURL(DIST).href) as Runtime;
const hash=(v:string|Buffer)=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const copy=<T>(v:T):T=>structuredClone(v);
const exp='65-loaded-rule-ownership',seed='loaded-rule-ownership-v1';
const rule=(regex=false):Rule=>({id:'policy.guard',category:'bash',severity:'critical',description:'validated guard',match:{kind:regex?'regex':'substring',pattern:'DANGER',target:'command',...(regex?{flags:'i'}:{})},appliesTo:['Bash'],enabled:true,references:['CWE-77']});
const call={tool:'Bash',command:'DANGER'};
const action=(rules:Compiled[],c:unknown=call)=>runtime.evaluate(c,rules).action;
const snapshot=(rules:Compiled[])=>rules.map(c=>({rule:copy(c.rule),...(c.regex?{regex:{source:c.regex.source,flags:c.regex.flags}}:{})}));
const producer=['substring-pattern','regex-kind','tool-scope','match-target','enabled','severity','rule-id','metadata','regex-declaration'];
const consumer=['consumer-to-source','separate-loads','shared-nested'];
const controls=['empty','frozen','explicit-reload','explicit-compiled-edit','regex-flags','all-targets'];
const scenarios=[...producer,...consumer,...controls];
const unsafe=new Set([...producer.slice(0,6),'separate-loads','shared-nested']);
type Row={id:string;kind:'producer'|'consumer'|'control';unsafe:boolean;checks:Record<string,boolean>;correct:boolean;action?:string;data:unknown};
const results:Record<string,Row[]>={};
function freeze<T>(v:T):T{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
const mutable=(r:Rule)=>!Object.isFrozen(r)&&!Object.isFrozen(r.match)&&!Object.isFrozen(r.appliesTo)&&(!r.references||!Object.isFrozen(r.references));
function edit(r:Rule){r.enabled=false;r.severity='low';r.id='consumer';r.match.pattern='NEVER';r.appliesTo.splice(0,1,'Other');r.references!.push('consumer');}
for(const arm of ['real-aegis','detached-loader-control']){
 const load=(rules:Rule[])=>runtime.loadPack({packId:'validation-snapshot',version:'1',rules:arm==='real-aegis'?rules:rules.map(copy)});
 const rows:Row[]=[];
 const add=(id:string,kind:Row['kind'],checks:Row['checks'],data:unknown,afterAction?:string)=>rows.push({id,kind,unsafe:unsafe.has(id),checks,correct:Object.values(checks).every(Boolean),data,...(afterAction===undefined?{}:{action:afterAction})});
 for(const id of producer){
  const source=rule(id==='regex-kind'||id==='regex-declaration'),sourceBefore=copy(source),loaded=load([source]),before=snapshot(loaded),entry=action(loaded);
  if(id==='substring-pattern')source.match.pattern='NEVER';
  else if(id==='regex-kind'){source.match.kind='substring';source.match.pattern='NEVER';}
  else if(id==='tool-scope')source.appliesTo.splice(0,1,'Other');
  else if(id==='match-target')source.match.target='content';
  else if(id==='enabled')source.enabled=false;
  else if(id==='severity')source.severity='low';
  else if(id==='rule-id')source.id='changed';
  else if(id==='metadata'){source.description='draft guard';source.remediation='draft';source.references!.push('draft');}
  else {source.match.pattern='NEVER';source.match.flags='m';}
  const after=snapshot(loaded),afterAction=action(loaded);
  add(id,'producer',{entryDenied:entry==='deny',snapshot:same(after,before),protected:afterAction==='deny',callerWritable:mutable(source)&&mutable(loaded[0]!.rule),producerEdited:!same(source,sourceBefore)}, {sourceBefore,sourceAfter:copy(source),before,after,entry,call},afterAction);
 }
 for(const id of consumer){
  const source=rule(),sources=id==='shared-nested'?[source,{...source,id:'policy.second'}]:[source],sourceBefore=copy(sources),loaded=load(sources),other=id==='separate-loads'?load(sources):undefined,before=snapshot(other??loaded),entry=action(loaded);
  edit(loaded[0]!.rule);
  const target=id==='separate-loads'?other!:id==='shared-nested'?[loaded[1]!]:loaded;
  const afterAction=action(target),after=snapshot(other??loaded);
  const checks:Row['checks']={entryDenied:entry==='deny',sourceUnchanged:same(sources,sourceBefore),callerWritable:sources.every(mutable)&&loaded.every(c=>mutable(c.rule)),consumerEdited:loaded[0]!.rule.enabled===false};
  if(id!=='consumer-to-source'){checks['siblingUnchanged']=id==='separate-loads'?same(after,before):same(after[1],before[1]);checks['protected']=afterAction==='deny';}
  add(id,'consumer',checks,{sourceBefore,sourceAfter:copy(sources),before,after,edited:snapshot(loaded),entry,call},afterAction);
 }
 {const empty=load([]);add('empty','control',{empty:empty.length===0,allow:action(empty)==='allow'},{loaded:snapshot(empty)},action(empty));}
 {const source=freeze(rule()),before=copy(source),loaded=load([source]);let writable=true;try{edit(loaded[0]!.rule);}catch{writable=false;}add('frozen','control',{sourceUnchanged:same(source,before),writable:writable&&mutable(loaded[0]!.rule),effect:action(loaded)==='allow'},{source:copy(source),loaded:snapshot(loaded)},action(loaded));}
 {const source=rule(),old=load([source]),before=snapshot(old);source.match.pattern='NEVER';const fresh=load([source]);add('explicit-reload','control',{old:same(snapshot(old),before)&&action(old)==='deny',fresh:action(fresh)==='allow'&&same(fresh[0]!.rule,source),callerWritable:mutable(source)&&mutable(old[0]!.rule)&&mutable(fresh[0]!.rule)},{old:snapshot(old),fresh:snapshot(fresh),source:copy(source),before},action(fresh));}
 {const source=rule(),before=copy(source),loaded=load([source]);loaded[0]!.rule.enabled=false;add('explicit-compiled-edit','control',{effect:action(loaded)==='allow',sourceUnchanged:same(source,before),callerWritable:mutable(source)&&mutable(loaded[0]!.rule)},{source:copy(source),loaded:snapshot(loaded)},action(loaded));}
 {const source=rule(true),loaded=load([source]),actions=['DANGER','danger','danger','safe'].map(command=>action(loaded,{tool:'Bash',command}));add('regex-flags','control',{actions:same(actions,['deny','deny','deny','allow']),stateless:loaded[0]!.regex!.flags==='i',callerWritable:mutable(source)&&mutable(loaded[0]!.rule)},{actions,loaded:snapshot(loaded)});}
 {const cases:unknown[]=[];const checks:Row['checks']={};for(const target of ['command','content','path','argv'] as const){const source=rule();source.match.target=target;const loaded=load([source]),field=target==='path'?'paths':target;const input={tool:'Bash',[field]:target==='path'||target==='argv'?['safe','DANGER']:'DANGER'},negative={tool:'Bash',[field]:target==='path'||target==='argv'?['safe']:'safe'};const actions=[action(loaded,input),action(loaded,{...input,tool:'Other'}),action(loaded,negative)];checks[target]=same(actions,['deny','allow','allow']);cases.push({target,input,negative,loaded:snapshot(loaded),actions});}add('all-targets','control',checks,cases);}
 results[arm]=rows;
}
function metrics(arm:string){const rows=results[arm]!,p=rows.filter(r=>r.kind==='producer'),c=rows.filter(r=>r.kind==='consumer'),risk=rows.filter(r=>r.unsafe),ctrl=rows.filter(r=>r.kind==='control');return{producerDriftRate:p.filter(r=>!r.checks['snapshot']).length/p.length,unsafeAllowRate:risk.filter(r=>r.action==='allow').length/risk.length,resolutionAccuracy:rows.filter(r=>r.correct).length/rows.length,consumerIsolation:Number(c.every(r=>r.correct)),controlAccuracy:ctrl.filter(r=>r.correct).length/ctrl.length,callerOwnership:Number(rows.every(r=>r.checks['callerWritable']!==false&&r.checks['producerEdited']!==false))};}
const summary={detachedControlAccuracy:metrics('detached-loader-control').resolutionAccuracy,...Object.fromEntries(Object.entries(metrics('real-aegis')).map(([k,v])=>[`aegis${k[0]!.toUpperCase()}${k.slice(1)}`,v]))};
const runId=`lro-${Date.now().toString(36)}`,dir=join(import.meta.dirname,'..','runs');mkdirSync(dir,{recursive:true});const path=join(dir,`${runId}.jsonl`),trace=new TraceWriter(path,{runId,experiment:exp}),bus=new MessageBus({trace});
const walk=(dir:string):string[]=>readdirSync(dir).sort().flatMap(n=>{const p=join(dir,n);return statSync(p).isDirectory()?walk(p):[p];});
const files=[...walk(join(REPO,'packages/aegis/src')),...walk(join(REPO,'packages/aegis/dist')),join(REPO,'packages/aegis/package.json')].sort();
const manifest=files.map(file=>({file:relative(REPO,file),sha256:hash(readFileSync(file))}));
bus.publish({from:'moderator',to:'*',topic:'meta',body:{runId,evidenceVersion:1,experiment:exp,spec:'71-loaded-rule-ownership',seed,holdout:'reserved-unused-no-tuning',scenarios,scenarioSha256:hash(JSON.stringify(scenarios)),harnessSha256:hash(readFileSync(join(import.meta.dirname,'..','src/main.ts'))),aegis:{sha:execFileSync('git',['-C',REPO,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['-C',REPO,'status','--porcelain'],{encoding:'utf8'}),repo:REPO,distSha256:hash(readFileSync(DIST)),manifest,manifestSha256:hash(JSON.stringify(manifest)),mode:'real-built-public-api'}}});
for(const [arm,rows] of Object.entries(results)){for(const row of rows)bus.publish({from:arm,to:'moderator',topic:'scenario',body:row});}
trace.append({t:'score',ts:Date.now(),scores:summary});
const replay=await readRunRecord(path);if(!same(replay.events,trace.toRunRecord().events))throw new Error('full replay mismatch');
console.log(JSON.stringify({runId,summary,failed:results['real-aegis']!.filter(r=>!r.correct).map(r=>({id:r.id,checks:r.checks})),replayEvents:replay.events.length,trace:path},null,2));
if(summary.detachedControlAccuracy!==1)throw new Error('diagnostic failed; fixture not admissible');
