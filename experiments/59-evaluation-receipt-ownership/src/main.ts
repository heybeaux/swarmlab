import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { MessageBus, TraceWriter, readRunRecord } from '@swarmlab/core';

const EXP = '59-evaluation-receipt-ownership';
const SEED = 'evaluation-receipt-ownership-v1';
const REPO = process.env['AEGIS_REPO'];
if (!REPO) throw new Error('AEGIS_REPO required');
const DIST = process.env['AEGIS_DIST'] ?? `${REPO}/packages/aegis/dist/index.js`;
const hash = (v: string | Buffer) => `sha256:${createHash('sha256').update(v).digest('hex')}`;
const clone = <T>(v:T):T => structuredClone(v);
const snapshot = (v:unknown) => JSON.parse(JSON.stringify(v));
const same = (a:unknown,b:unknown) => isDeepStrictEqual(snapshot(a),snapshot(b));
type Action = 'allow'|'ask'|'deny';
type Prediction = {pFailure:number;confidence:number;source:'awm'|'prior'};
type Hit = {id:string;severity:string;category:string;target:string};
type Evaluation = {action:Action;decidedBy:string;reason:string;prediction?:Prediction|undefined;ruleVersions:string[];matches:Hit[]};
type Options = {prediction?:Prediction;ruleVersions?:string[]};
interface Runtime { evaluate(c:any,r:any[],o?:Options):Evaluation;loadPack(p:any):any[];evaluateWithSourcePolicyRosterCheckpoint(c:any,r:any[],h:any,o?:Options):Promise<Evaluation> }
const runtime = await import(pathToFileURL(DIST).href) as Runtime;
const rosterId='roster:deploy';const members=['authority:east','authority:west'];
const digest=hash(JSON.stringify({memberIds:members,rosterEpoch:2,rosterId}));
const checkpoint=()=>({rosterId,rosterEpoch:2,rosterDigest:digest,authenticated:true});
function call():Record<string,any> { return {tool:'ActOnRememberedFact',sourceFreshness:{
 risk:'high',checkStatus:'fresh',authenticated:true,sourceId:'source:deploy',expectedSourceId:'source:deploy',cachedSourceVersion:7,observedSourceVersion:7,checkedAtMs:1000,actionAtMs:1010,maxAgeMs:100,
 policyId:'policy:deploy',expectedPolicyId:'policy:deploy',policyVersion:5,expectedPolicyVersion:5,policyAuthenticated:true,sourceVersionNamespace:'deploy:v2',expectedSourceVersionNamespace:'deploy:v2',expectedMaxAgeMs:100,
 expectedPolicyAuthorityIds:[...members],policyAuthorities:members.map(authorityId=>({authorityId,authenticated:true,policyId:'policy:deploy',policyVersion:5,sourceVersionNamespace:'deploy:v2',maxAgeMs:100})),
 expectedPolicyAuthorityRosterId:rosterId,expectedPolicyAuthorityRosterEpoch:2,expectedPolicyAuthorityRosterDigest:digest,policyAuthorityRoster:{...checkpoint(),memberIds:[...members]}
}}; }
const modes = [
 {id:'pure-allow',p:.1,entry:'allow',next:'allow'},
 {id:'pure-ask',p:.5,entry:'ask',next:'ask'},
 {id:'pure-deny',p:.9,entry:'deny',next:'deny'},
 {id:'async-allow',p:.1,entry:'allow',next:'allow'},
 {id:'async-initial-deny',p:.9,entry:'deny',next:'deny'},
 {id:'async-offline',p:.1,entry:'ask',next:'allow'},
 {id:'async-no-roster',p:.1,entry:'ask',next:'allow'},
 {id:'async-input-change',p:.1,entry:'ask',next:'allow'},
] as const;
const scenarioPlan=[...modes.flatMap(m=>['producer','consumer'].map(direction=>({id:`${m.id}-${direction}`,mode:m.id,direction,p:m.p,entry:m.entry,next:m.next}))),...['defaults','frozen','matches','siblings','explicit-mutation'].map(id=>({id,control:true}))];
const options=(p=.1):Options=>({prediction:{pFailure:p,confidence:.8,source:'awm'},ruleVersions:['policy@1']});
function mutatePrediction(p:Prediction) {p.pFailure=p.pFailure>=.4?.01:.95;p.confidence=.2;p.source='prior';}
function mutateMetadata(v:{prediction?:Prediction|undefined;ruleVersions?:string[]}) {if(v.prediction)mutatePrediction(v.prediction);v.ruleVersions![0]='policy@2';v.ruleVersions!.push('overlay@2');}
class Host {reads=0;observes=0;constructor(readonly mode:string,readonly input:Record<string,any>){} async read(){this.reads++;if(this.mode==='async-offline')throw new Error('offline');if(this.mode==='async-input-change'&&this.reads===1)this.input.command='harmless changed text';return checkpoint();}async observe(){this.observes++;}}
function detach(r:Evaluation):Evaluation {return {...r,prediction:r.prediction?{...r.prediction}:undefined,ruleVersions:[...r.ruleVersions],matches:r.matches.map(h=>({...h}))};}
type Row={id:string;checks:Record<string,boolean>;correct:boolean;hazard?:'producer'|'consumer';entry?:Action;followup?:Action|undefined;before?:unknown;after?:unknown;caller?:unknown;receipt?:unknown;reads?:number;observes?:number};
const results:Record<string,Row[]>={};
const runId=`ero-${Date.now().toString(36)}`;const dir=join(import.meta.dirname,'..','runs');mkdirSync(dir,{recursive:true});const path=join(dir,`${runId}.jsonl`);
const trace=new TraceWriter(path,{runId,experiment:EXP});const bus=new MessageBus({trace});
const files=execFileSync('find',[join(REPO,'packages/aegis/dist'),'-type','f'],{encoding:'utf8'}).trim().split('\n').sort();
bus.publish({from:'moderator',to:'*',topic:'meta',body:{evidenceVersion:1,experiment:EXP,spec:'65-evaluation-receipt-ownership',seed:SEED,runId,scenarios:scenarioPlan,evidenceKind:'package_retest',holdout:'reserved-unused-no-tuning',harnessSha256:hash(readFileSync(join(import.meta.dirname,'..','src','main.ts'))),aegis:{sha:execFileSync('git',['-C',REPO,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['-C',REPO,'status','--porcelain'],{encoding:'utf8'}),repo:REPO,distSha256:hash(readFileSync(DIST)),sourceSha256:hash(readFileSync(join(REPO,'packages/aegis/src/eval/evaluate.ts'))),manifest:files.map(file=>({file:file.slice(REPO.length+1),sha256:hash(readFileSync(file))})),mode:'real-built-public-api'}}});
for(const arm of ['real-aegis','detached-receipt-control','ownership-oracle']) {
 const rows:Row[]=[];const prepare=(r:Evaluation)=>arm==='detached-receipt-control'?detach(r):r;
 for(const m of modes)for(const direction of ['producer','consumer'] as const){
  const opts=options(m.p),input=m.id==='async-no-roster'?{tool:'Bash',command:'echo safe'}:call();const clean=clone(input);const host=new Host(m.id,input);
  const raw=m.id.startsWith('pure')?runtime.evaluate(input,[],opts):await runtime.evaluateWithSourcePolicyRosterCheckpoint(input,[],host,opts);
  const r=prepare(raw);const before=snapshot(r);const caller=snapshot(opts);let followup:Evaluation|undefined;
  if(direction==='producer')mutateMetadata(opts);else {mutateMetadata(r);followup=runtime.evaluate(clean,[],opts);}
  const checks:Record<string,boolean>={entry:r.action===m.entry,ownership:!Object.isFrozen(opts)&&!Object.isFrozen(opts.prediction)&&!Object.isFrozen(opts.ruleVersions),
   provenance:direction==='producer'?same(r.ruleVersions,['policy@1']):same(opts.ruleVersions,['policy@1'])};
  if(direction==='producer')checks.receipt=same(before,r)&&same(r.prediction,caller.prediction);
  else {checks.caller=same(caller,opts);checks.followup=followup!.action===m.next&&same(followup!.prediction,caller.prediction)&&same(followup!.ruleVersions,caller.ruleVersions);}
  const row:Row={id:`${m.id}-${direction}`,hazard:direction,checks,correct:Object.values(checks).every(Boolean),entry:r.action,followup:followup?.action,before,after:snapshot(r),caller:snapshot(opts),reads:host.reads,observes:host.observes};
  if(arm==='ownership-oracle'){row.checks=Object.fromEntries(Object.keys(checks).map(k=>[k,true]));row.correct=true;}
  rows.push(row);
 }
 const add=(id:string,checks:Record<string,boolean>)=>rows.push({id,checks:arm==='ownership-oracle'?Object.fromEntries(Object.keys(checks).map(k=>[k,true])):checks,correct:arm==='ownership-oracle'||Object.values(checks).every(Boolean)});
 const plain={tool:'Bash',command:'echo safe'};
 {const a=prepare(runtime.evaluate(plain,[])),b=prepare(runtime.evaluate(plain,[]));a.ruleVersions.push('local');a.matches.push({id:'local',severity:'low',category:'bash',target:'command'});add('defaults',{defaults:a.prediction===undefined&&b.prediction===undefined&&b.ruleVersions.length===0&&b.matches.length===0&&a.action==='allow'&&b.action==='allow'});}
 {const opts=options();Object.freeze(opts.prediction);Object.freeze(opts.ruleVersions);Object.freeze(opts);const before=snapshot(opts),r=prepare(runtime.evaluate(plain,[],opts));let writable=true;try{mutateMetadata(r);}catch{writable=false;}add('frozen',{frozen:writable&&same(before,opts)&&r.action==='allow'});}
 {const rules=runtime.loadPack({packId:'ownership',version:'1',rules:[{id:'ownership.hit',severity:'low',category:'bash',description:'matched safe command',appliesTo:['Bash'],match:{target:'command',kind:'substring',pattern:'safe'}}]});const a=prepare(runtime.evaluate(plain,rules));a.matches[0]!.id='consumer.hit';const b=prepare(runtime.evaluate(plain,rules));rules[0].rule.id='producer.hit';add('matches',{matches:b.matches[0]!.id==='ownership.hit'&&a.matches[0]!.id==='consumer.hit'&&rules[0].rule.severity==='low'});}
 {const opts=options(),a=prepare(runtime.evaluate(plain,[],opts)),b=prepare(runtime.evaluate(plain,[],opts));const before=snapshot(b);mutateMetadata(a);add('siblings',{siblings:same(before,b)});}
 {const r=prepare(runtime.evaluate(plain,[],options()));let writable=true;try{r.action='deny';mutateMetadata(r);}catch{writable=false;}add('explicit-mutation',{explicit:writable&&r.action==='deny'&&r.prediction!.pFailure===.95&&r.ruleVersions.length===2});}
 results[arm]=rows;for(const row of rows)bus.publish({from:arm,to:'moderator',topic:'scenario',body:row});
}
function metrics(arm:string){const rows=results[arm]!;const producers=rows.filter(r=>r.hazard==='producer'),consumers=rows.filter(r=>r.hazard==='consumer');const control=(id:string)=>Number(rows.find(r=>r.id===id)!.correct);return {
 receiptDriftRate:producers.filter(r=>!r.checks['receipt']).length/producers.length,crossCallContaminationRate:consumers.filter(r=>!r.checks['caller']||!r.checks['followup']).length/consumers.length,resolutionAccuracy:rows.filter(r=>r.correct).length/rows.length,
 provenanceIsolationRate:rows.filter(r=>r.hazard&&r.checks['provenance']).length/16,matchesIsolation:control('matches'),defaultsCompatibility:control('defaults'),frozenCompatibility:control('frozen'),siblingIsolation:control('siblings'),callerOwnership:Number(rows.filter(r=>r.hazard).every(r=>r.checks['ownership'])),explicitMutationScopeControl:control('explicit-mutation'),entryActionAccuracy:Number(rows.filter(r=>r.hazard).every(r=>r.checks['entry']))};}
for(const arm of Object.keys(results)){console.log(arm,JSON.stringify(metrics(arm)));trace.append({t:'score',ts:Date.now(),scores:Object.fromEntries(Object.entries(metrics(arm)).map(([k,v])=>[`${arm.replaceAll('-','_')}_${k}`,v]))});}
const summary={controlAccuracy:metrics('detached-receipt-control').resolutionAccuracy,oracleAccuracy:metrics('ownership-oracle').resolutionAccuracy,...Object.fromEntries(Object.entries(metrics('real-aegis')).map(([k,v])=>[`aegis${k[0]!.toUpperCase()}${k.slice(1)}`,v]))};trace.append({t:'score',ts:Date.now(),scores:summary});
const replay=await readRunRecord(path);if(JSON.stringify(replay.events)!==JSON.stringify(trace.toRunRecord().events))throw new Error('full replay mismatch');if(summary.controlAccuracy!==1||summary.oracleAccuracy!==1)throw new Error('control/oracle failed');
console.log('summary:',JSON.stringify(summary));console.log(`replay verified: ${replay.events.length} events`);console.log(`trace: ${path}`);
