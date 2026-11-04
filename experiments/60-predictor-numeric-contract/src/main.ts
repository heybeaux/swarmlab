import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { MessageBus, TraceWriter, readRunRecord } from '@swarmlab/core';
const EXP='60-predictor-numeric-contract',SEED='predictor-numeric-contract-v1';
const REPO=process.env['AEGIS_REPO'];if(!REPO)throw new Error('AEGIS_REPO required');
const DIST=process.env['AEGIS_DIST']??`${REPO}/packages/aegis/dist/index.js`;
const runtime=await import(pathToFileURL(DIST).href);
const hash=(v:string|Buffer)=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
// Preserve invalid values explicitly: ordinary JSON conflates NaN/Infinity with null.
function tagged(v:any):any {if(v===undefined)return {$type:'undefined'};if(typeof v==='number'&&!Number.isFinite(v))return {$type:'number',value:String(v)};if(Array.isArray(v))return v.map(tagged);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,tagged(x)]));return v;}
const prediction=()=>({pFailure:.1,confidence:.8,source:'awm'});
const thresholds=()=>({askAtOrAbove:.4,denyAtOrAbove:.8});
type Scenario={id:string;opts:any;hazard:boolean;expected:'allow'|'ask'|'deny';rule?:'medium'|'critical'};
const scenarios:Scenario[]=[];
function add(id:string,opts:any,hazard=true,expected:Scenario['expected']='ask',rule?:Scenario['rule']){scenarios.push({id,opts,hazard,expected,...(rule?{rule}:{})});}
for(const field of ['pFailure','confidence'])for(const [label,v]of [['nan',NaN],['infinity',Infinity],['negative-infinity',-Infinity],['negative',-.01],['above-one',1.01],['string',field==='pFailure'?'0.1':'0.8'],['null',null],['missing',undefined]] as const){const p:any=prediction();if(label==='missing')delete p[field];else p[field]=v;add(`${field}-${label}`,{prediction:p});}
add('source-unknown',{prediction:{...prediction(),source:'unknown'}});
for(const [label,v]of [['null',null],['array',[]],['string','bad'],['empty',{}]] as const)add(`prediction-${label}`,{prediction:v});
for(const [id,changes]of [['ask-nan',{askAtOrAbove:NaN}],['deny-nan',{denyAtOrAbove:NaN}],['ask-infinity',{askAtOrAbove:Infinity}],['deny-infinity',{denyAtOrAbove:Infinity}],['ask-negative',{askAtOrAbove:-.01}],['deny-above-one',{denyAtOrAbove:1.01}],['reversed',{askAtOrAbove:.8,denyAtOrAbove:.4}],['ask-string',{askAtOrAbove:'0.4'}],['deny-missing',{denyAtOrAbove:undefined}]] as const)add(`threshold-${id}`,{prediction:prediction(),predictionThresholds:{...thresholds(),...changes}});
for(const [label,v]of [['null',null],['array',[]],['string','bad']] as const)add(`threshold-${label}`,{prediction:prediction(),predictionThresholds:v});
add('threshold-without-prediction',{predictionThresholds:{...thresholds(),askAtOrAbove:NaN}});
add('custom-medium-allow',{prediction:{...prediction(),pFailure:NaN},severityTable:{low:'allow',medium:'allow',high:'ask',critical:'deny'}},true,'ask','medium');
add('invalid-prediction-critical',{prediction:{...prediction(),pFailure:NaN}},true,'deny','critical');
add('invalid-threshold-critical',{prediction:prediction(),predictionThresholds:{...thresholds(),askAtOrAbove:NaN}},true,'deny','critical');
add('absent',{},false,'allow');
for(const [p,action]of [[0,'allow'],[.399,'allow'],[.4,'ask'],[.799,'ask'],[.8,'deny'],[1,'deny']] as const)add(`valid-probability-${p}`,{prediction:{...prediction(),pFailure:p}},false,action);
for(const confidence of [0,1])add(`valid-confidence-${confidence}`,{prediction:{...prediction(),confidence}},false,'allow');
add('valid-prior',{prediction:{...prediction(),pFailure:.5,source:'prior'}},false,'ask');
add('custom-thresholds',{prediction:{...prediction(),pFailure:.3},predictionThresholds:{askAtOrAbove:.2,denyAtOrAbove:.6}},false,'ask');
add('equal-thresholds',{prediction:{...prediction(),pFailure:.5},predictionThresholds:{askAtOrAbove:.5,denyAtOrAbove:.5}},false,'deny');
add('endpoint-thresholds',{prediction:{...prediction(),pFailure:0},predictionThresholds:{askAtOrAbove:0,denyAtOrAbove:1}},false,'ask');
add('valid-critical-floor',{prediction:{...prediction(),pFailure:0}},false,'deny','critical');
add('valid-medium-floor',{prediction:{...prediction(),pFailure:0}},false,'ask','medium');
const rosterId='roster:numeric',members=['east','west'];const digest=hash(JSON.stringify({memberIds:members,rosterEpoch:2,rosterId}));
const checkpoint=()=>({rosterId,rosterEpoch:2,rosterDigest:digest,authenticated:true});
function call():any{return {tool:'Bash',command:'echo safe',sourceFreshness:{risk:'high',checkStatus:'fresh',authenticated:true,sourceId:'s',expectedSourceId:'s',cachedSourceVersion:7,observedSourceVersion:7,checkedAtMs:1000,actionAtMs:1010,maxAgeMs:100,policyId:'p',expectedPolicyId:'p',policyVersion:5,expectedPolicyVersion:5,policyAuthenticated:true,sourceVersionNamespace:'v',expectedSourceVersionNamespace:'v',expectedMaxAgeMs:100,expectedPolicyAuthorityIds:[...members],policyAuthorities:members.map(authorityId=>({authorityId,authenticated:true,policyId:'p',policyVersion:5,sourceVersionNamespace:'v',maxAgeMs:100})),expectedPolicyAuthorityRosterId:rosterId,expectedPolicyAuthorityRosterEpoch:2,expectedPolicyAuthorityRosterDigest:digest,policyAuthorityRoster:{...checkpoint(),memberIds:[...members]}}};}
function rules(s:Scenario):any[]{return s.rule?runtime.loadPack({packId:'numeric',version:'1',rules:[{id:`numeric.${s.rule}`,severity:s.rule,category:'bash',description:`${s.rule} floor`,appliesTo:['Bash'],match:{target:'command',kind:'substring',pattern:'safe'}}]}):[];}
const runId=`pnc-${Date.now().toString(36)}`,dir=join(import.meta.dirname,'..','runs');mkdirSync(dir,{recursive:true});const path=join(dir,`${runId}.jsonl`);
const trace=new TraceWriter(path,{runId,experiment:EXP});const bus=new MessageBus({trace});
const files=execFileSync('find',[join(REPO,'packages/aegis/dist'),'-type','f'],{encoding:'utf8'}).trim().split('\n').sort();
bus.publish({from:'moderator',to:'*',topic:'meta',body:{evidenceVersion:1,experiment:EXP,spec:'66-predictor-numeric-contract',seed:SEED,runId,scenarios:tagged(scenarios),holdout:'reserved-unused-no-tuning',evidenceKind:'package_retest',harnessSha256:hash(readFileSync(join(import.meta.dirname,'..','src/main.ts'))),aegis:{sha:execFileSync('git',['-C',REPO,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['-C',REPO,'status','--porcelain'],{encoding:'utf8'}),distSha256:hash(readFileSync(DIST)),sourceSha256:hash(readFileSync(join(REPO,'packages/aegis/src/eval/evaluate.ts'))),manifest:files.map(file=>({file:file.slice(REPO.length+1),sha256:hash(readFileSync(file))})),mode:'real-built-public-api'}}});
const results:Record<string,any[]>={};
const HIT='swarmlab.rt50.predictor-requires-valid-numeric-contract';
for(const arm of ['real-aegis','producer-validation-control']){const rows:any[]=[];for(const entry of ['pure','strict'])for(const s of scenarios){const opts=structuredClone(s.opts),input=call(),compiled=rules(s);const before=structuredClone({opts,input,compiled});let reads=0,observes=0,result:any,error:string|undefined;
try{if(arm==='producer-validation-control'&&s.hazard){result={action:s.rule==='critical'?'deny':'ask',matches:[{id:HIT},...(s.rule?[{id:`numeric.${s.rule}`}]:[])],reason:s.rule==='critical'?'critical floor':'Producer control RT-50 invalid contract'};}else {const host={async read(){reads++;return checkpoint();},async observe(){observes++;}};result=entry==='pure'?runtime.evaluate(input,compiled,opts):await runtime.evaluateWithSourcePolicyRosterCheckpoint(input,compiled,host,{...opts,monotonicNowMs:()=>0});}}catch(e){error=String(e);}
const diagnostic=!!result?.matches?.some((h:any)=>h.id===HIT);
const expectedIO=entry==='strict'&&!s.hazard&&s.expected==='allow';
const checks={action:result?.action===s.expected,diagnostic:s.hazard?diagnostic&&!(!result?.reason?.includes('RT-50')&&s.expected!=='deny'):!diagnostic,noException:error===undefined,io:reads===(expectedIO?2:0)&&observes===(expectedIO?1:0),ownership:isDeepStrictEqual({opts,input,compiled},before)&&!Object.isFrozen(opts)&&!Object.isFrozen(input),critical:s.rule!=='critical'||result?.action==='deny'&&result?.reason==='critical floor'&&result?.matches?.some((h:any)=>h.id==='numeric.critical')};
const row={id:`${entry}:${s.id}`,entry,hazard:s.hazard,expected:s.expected,rule:s.rule??null,input:tagged(s.opts),actual:tagged(result),error:error??null,reads,observes,checks,correct:Object.values(checks).every(Boolean)};rows.push(row);bus.publish({from:arm,to:'moderator',topic:'scenario',body:row});}
results[arm]=rows;}
function metrics(rows:any[]){const hazards=rows.filter(r=>r.hazard),valid=rows.filter(r=>!r.hazard),strict=hazards.filter(r=>r.entry==='strict'),critical=rows.filter(r=>r.rule==='critical');const rate=(rs:any[],p:(r:any)=>boolean)=>rs.filter(p).length/rs.length;return {unsafeMalformedAllowRate:rate(hazards,r=>r.actual?.action==='allow'),invalidContractDetectionRate:rate(hazards,r=>r.checks.diagnostic),resolutionAccuracy:rate(rows,r=>r.correct),crashRate:rate(rows,r=>!r.checks.noException),validCompatibility:rate(valid,r=>r.correct),criticalDenyPreservation:rate(critical,r=>r.checks.critical),strictInvalidNoIO:rate(strict,r=>r.reads===0&&r.observes===0),callerOwnership:rate(rows,r=>r.checks.ownership)};}
const summary={controlAccuracy:metrics(results['producer-validation-control']!).resolutionAccuracy,...Object.fromEntries(Object.entries(metrics(results['real-aegis']!)).map(([k,v])=>[`aegis${k[0]!.toUpperCase()}${k.slice(1)}`,v]))};trace.append({t:'score',ts:Date.now(),scores:summary});
const replay=await readRunRecord(path);if(JSON.stringify(replay.events)!==JSON.stringify(trace.toRunRecord().events))throw new Error('full replay mismatch');if(summary.controlAccuracy!==1)throw new Error('producer control failed');console.log('summary:',JSON.stringify(summary));console.log(`scenario count: ${scenarios.length}; replay verified: ${replay.events.length} events`);console.log(`trace: ${path}`);
