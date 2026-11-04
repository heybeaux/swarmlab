import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { MessageBus, TraceWriter, readRunRecord } from '@swarmlab/core';

const EXP='61-package-default-policy-isolation',SEED='package-default-policy-isolation-v1';
const REPO=process.env['AEGIS_REPO']!;const DIST=process.env['AEGIS_DIST']!;
if(!REPO||!DIST)throw new Error('Explicit real Aegis repo/dist required');
const hash=(v:string|Buffer)=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
type Action='allow'|'ask'|'deny';
interface Runtime {DEFAULT_SEVERITY_TABLE:Record<string,Action>;DEFAULT_PREDICTION_THRESHOLDS:{askAtOrAbove:number;denyAtOrAbove:number};DEFAULT_SAFE:Set<string>;evaluate(c:any,r:any[],o?:any):any;loadPack(p:any):any[];isSafeCommand(c:string,s?:ReadonlySet<string>):boolean;evaluateWithSourcePolicyRosterCheckpoint(c:any,r:any[],h:any,o?:any):Promise<any>}
type Scenario={id:string;mutation?:'severity'|'deny-threshold'|'ask-threshold'|'safe-add'|'safe-delete'|'safe-clear';severity?:string;p?:number;expected:Action;edited?:Action;command?:string;safe:boolean;editedSafe?:boolean;custom?:'severity'|'thresholds'|'safe';weakening?:boolean};
const scenarios:Scenario[]=[
{id:'critical-template',mutation:'severity',severity:'critical',expected:'deny',edited:'allow',safe:true,weakening:true},
{id:'high-template',mutation:'severity',severity:'high',expected:'ask',edited:'allow',safe:true,weakening:true},
{id:'medium-template',mutation:'severity',severity:'medium',expected:'ask',edited:'allow',safe:true,weakening:true},
{id:'low-template',mutation:'severity',severity:'low',expected:'allow',edited:'deny',safe:true},
{id:'deny-template',mutation:'deny-threshold',p:.9,expected:'deny',edited:'ask',safe:true,weakening:true},
{id:'ask-template',mutation:'ask-threshold',p:.5,expected:'ask',edited:'allow',safe:true,weakening:true},
{id:'safe-add',mutation:'safe-add',expected:'allow',command:'dangerous-op',safe:false,editedSafe:true,weakening:true},
{id:'safe-delete',mutation:'safe-delete',expected:'allow',command:'ls',safe:true,editedSafe:false},
{id:'safe-clear',mutation:'safe-clear',expected:'allow',command:'echo safe',safe:true,editedSafe:false},
{id:'unchanged',severity:'critical',expected:'deny',safe:true},
{id:'custom-severity',custom:'severity',severity:'critical',expected:'allow',safe:true},
{id:'custom-thresholds',custom:'thresholds',p:.3,expected:'ask',safe:true},
{id:'custom-safe',custom:'safe',expected:'allow',command:'dangerous-op',safe:true},
{id:'empty',expected:'allow',command:'',safe:false},
{id:'combinator',expected:'allow',command:'ls; dangerous-op',safe:false},
{id:'word-boundary',expected:'allow',command:'catastrophe',safe:false},
];
const rosterId='roster:deploy',members=['authority:east','authority:west'];
const digest=hash(JSON.stringify({memberIds:members,rosterEpoch:2,rosterId}));
const cp=()=>({rosterId,rosterEpoch:2,rosterDigest:digest,authenticated:true});
const call=()=>({tool:'Bash',command:'classified-operation',sourceFreshness:{risk:'high',checkStatus:'fresh',authenticated:true,sourceId:'source:deploy',expectedSourceId:'source:deploy',cachedSourceVersion:7,observedSourceVersion:7,checkedAtMs:1000,actionAtMs:1010,maxAgeMs:100,policyId:'policy:deploy',expectedPolicyId:'policy:deploy',policyVersion:5,expectedPolicyVersion:5,policyAuthenticated:true,sourceVersionNamespace:'deploy:v2',expectedSourceVersionNamespace:'deploy:v2',expectedMaxAgeMs:100,expectedPolicyAuthorityIds:[...members],policyAuthorities:members.map(authorityId=>({authorityId,authenticated:true,policyId:'policy:deploy',policyVersion:5,sourceVersionNamespace:'deploy:v2',maxAgeMs:100})),expectedPolicyAuthorityRosterId:rosterId,expectedPolicyAuthorityRosterEpoch:2,expectedPolicyAuthorityRosterDigest:digest,policyAuthorityRoster:{...cp(),memberIds:[...members]}}});
function mutate(rt:Runtime,s:Scenario){switch(s.mutation){case 'severity':rt.DEFAULT_SEVERITY_TABLE[s.severity!]=s.severity==='low'?'deny':'allow';break;case 'deny-threshold':rt.DEFAULT_PREDICTION_THRESHOLDS.denyAtOrAbove=1;break;case 'ask-threshold':rt.DEFAULT_PREDICTION_THRESHOLDS.askAtOrAbove=.7;break;case 'safe-add':rt.DEFAULT_SAFE.add('dangerous-op');break;case 'safe-delete':rt.DEFAULT_SAFE.delete('ls');break;case 'safe-clear':rt.DEFAULT_SAFE.clear();break;}}
const clone=<T>(v:T):T=>structuredClone(v);
const runId=`dpi-${Date.now().toString(36)}`,dir=join(import.meta.dirname,'..','runs');mkdirSync(dir,{recursive:true});const path=join(dir,`${runId}.jsonl`);const trace=new TraceWriter(path,{runId,experiment:EXP}),bus=new MessageBus({trace});
const files=execFileSync('find',[join(REPO,'packages/aegis/dist'),'-type','f'],{encoding:'utf8'}).trim().split('\n').sort();
bus.publish({from:'moderator',to:'*',topic:'meta',body:{evidenceVersion:1,experiment:EXP,spec:'67-package-default-policy-isolation',seed:SEED,holdout:'reserved-unused-no-tuning',scenarios,runId,harnessSha256:hash(readFileSync(join(import.meta.dirname,'..','src/main.ts'))),aegis:{sha:execFileSync('git',['-C',REPO,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['-C',REPO,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),repo:REPO,distSha256:hash(readFileSync(DIST)),sourceHashes:['evaluate.ts','safe-command.ts','source-policy-checkpoint.ts'].map(file=>({file,hash:hash(readFileSync(join(REPO,'packages/aegis/src/eval',file)))})),manifest:files.map(file=>({file:file.slice(REPO.length+1),sha256:hash(readFileSync(file))})),mode:'real-built-public-api'}}});
type Row={id:string;hazard:boolean;weakening:boolean;pure:Action;strict:Action;safe:boolean;expected:Action;expectedSafe:boolean;reads:number;observes:number;checks:Record<string,boolean>;correct:boolean};const all:Record<string,Row[]>={};
for(const arm of ['real-aegis','captured-host-control','explicit-template-control']){
 const rows:Row[]=[];
 for(const s of scenarios){
  // tsup emits a single artifact; cache-busted URL gives an isolated module instance, no local policy copy.
  const rt=await import(`${pathToFileURL(DIST).href}?instance=${runId}-${arm}-${s.id}`) as Runtime;
  const captured={severity:{...rt.DEFAULT_SEVERITY_TABLE},thresholds:{...rt.DEFAULT_PREDICTION_THRESHOLDS},safe:new Set(rt.DEFAULT_SAFE)};
  let editable=true;try{mutate(rt,s);}catch{editable=false;}
  const edited={severity:{...rt.DEFAULT_SEVERITY_TABLE},thresholds:{...rt.DEFAULT_PREDICTION_THRESHOLDS},safe:[...rt.DEFAULT_SAFE].sort()};
  const options:any={};let allowlist:ReadonlySet<string>|undefined;
  if(arm==='captured-host-control'){options.severityTable=captured.severity;options.predictionThresholds=captured.thresholds;allowlist=captured.safe;}
  if(arm==='explicit-template-control'){options.severityTable=rt.DEFAULT_SEVERITY_TABLE;options.predictionThresholds=rt.DEFAULT_PREDICTION_THRESHOLDS;allowlist=rt.DEFAULT_SAFE;}
  if(s.custom==='severity')options.severityTable={...captured.severity,critical:'allow'};
  if(s.custom==='thresholds')options.predictionThresholds={askAtOrAbove:.2,denyAtOrAbove:.6};
  if(s.custom==='safe')allowlist=new Set(['dangerous-op']);
  if(s.p!==undefined)options.prediction={pFailure:s.p,confidence:.8,source:'awm'};
  const rules=s.severity?rt.loadPack({packId:'exp61',version:'1',rules:[{id:'classified-rule',description:'rule-floor fixture',severity:s.severity,category:'bash',appliesTo:['Bash'],match:{target:'command',kind:'substring',pattern:'classified-operation'}}]}):[];
  const input=call(),before=clone({options,rules,input}),safeBefore=allowlist?[...allowlist].sort():undefined;
  const pure=rt.evaluate(input,rules,options);let reads=0,observes=0;
  const strict=await rt.evaluateWithSourcePolicyRosterCheckpoint(input,rules,{async read(){reads++;return cp();},async observe(){observes++;}}, {...options,monotonicNowMs:()=>0});
  const safe=rt.isSafeCommand(s.command??'ls',allowlist);
  const expected=arm==='explicit-template-control'?(s.edited??s.expected):s.expected;
  const expectedSafe=arm==='explicit-template-control'?(s.editedSafe??s.safe):s.safe;
  const checks={pure:pure.action===expected,strict:strict.action===expected,safe:safe===expectedSafe,io:reads===(expected==='allow'?2:0)&&observes===(expected==='allow'?1:0),ownership:isDeepStrictEqual(before,{options,rules,input})&&isDeepStrictEqual(safeBefore,allowlist?[...allowlist].sort():undefined),editable:editable&&isDeepStrictEqual(edited,{severity:{...rt.DEFAULT_SEVERITY_TABLE},thresholds:{...rt.DEFAULT_PREDICTION_THRESHOLDS},safe:[...rt.DEFAULT_SAFE].sort()})};
  const row:Row={id:s.id,hazard:!!s.mutation,weakening:!!s.weakening,pure:pure.action,strict:strict.action,safe,expected,expectedSafe,reads,observes,checks,correct:Object.values(checks).every(Boolean)};
  rows.push(row);bus.publish({from:arm,to:'moderator',topic:'scenario',body:{...row,pureReceipt:pure,strictReceipt:strict,templates:edited}});
 }all[arm]=rows;
}
function metrics(arm:string){const rows=all[arm]!,hazards=rows.filter(r=>r.hazard),weak=rows.filter(r=>r.weakening);const rate=(key:string)=>rows.filter(r=>r.checks[key]).length/rows.length;return {globalDefaultInfluenceRate:hazards.filter(r=>!r.checks['pure']||!r.checks['strict']||!r.checks['safe']).length/hazards.length,resolutionAccuracy:rows.filter(r=>r.correct).length/rows.length,unsafeImplicitAuthorizationRate:weak.filter(r=>!r.checks['pure']||!r.checks['strict']||!r.checks['safe']).length/weak.length,pureActionAccuracy:rate('pure'),strictActionAccuracy:rate('strict'),safeClassificationAccuracy:rate('safe'),strictIOAccuracy:rate('io'),callerOwnership:rate('ownership'),templateEditCompatibility:rate('editable'),customOverrideCompatibility:Number(rows.filter(r=>r.id.startsWith('custom')).every(r=>r.correct))};}
for(const arm of Object.keys(all)){console.log(arm,JSON.stringify(metrics(arm)));trace.append({t:'score',ts:Date.now(),scores:Object.fromEntries(Object.entries(metrics(arm)).map(([k,v])=>[`${arm.replaceAll('-','_')}_${k}`,v]))});}
const summary={capturedControlAccuracy:metrics('captured-host-control').resolutionAccuracy,explicitControlAccuracy:metrics('explicit-template-control').resolutionAccuracy,...Object.fromEntries(Object.entries(metrics('real-aegis')).map(([k,v])=>[`aegis${k[0]!.toUpperCase()}${k.slice(1)}`,v]))};trace.append({t:'score',ts:Date.now(),scores:summary});
const replay=await readRunRecord(path);if(JSON.stringify(replay.events)!==JSON.stringify(trace.toRunRecord().events))throw new Error('full replay mismatch');if(summary.capturedControlAccuracy!==1||summary.explicitControlAccuracy!==1)throw new Error('broken controls');
console.log('summary:',JSON.stringify(summary));console.log(`replay verified: ${replay.events.length} events`);console.log(`trace: ${path}`);
