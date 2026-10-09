import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord } from '@swarmlab/core';

const EXP = '58-async-evaluator-config-integrity';
const SEED = 'async-evaluator-config-integrity-v1';
const REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-10-08-exp58-baseline';
const DIST = process.env['AEGIS_DIST'] ?? `${REPO}/packages/aegis/dist/index.js`;
const sha256 = (data: string | Buffer) => `sha256:${createHash('sha256').update(data).digest('hex')}`;
const ID = 'roster:deploy';
const members = ['authority:east', 'authority:west'];
const digest = (epoch: number, ids = members) => sha256(JSON.stringify({ memberIds: [...ids].sort(), rosterEpoch: epoch, rosterId: ID }));
type Checkpoint = { rosterId: string; rosterEpoch: number; rosterDigest: string; authenticated: boolean };
const cp = (epoch: number, ids = members): Checkpoint => ({ rosterId: ID, rosterEpoch: epoch, rosterDigest: digest(epoch, ids), authenticated: true });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const call = (epoch = 2, ids = members): Record<string, any> => ({
  tool: 'ActOnRememberedFact',
  factLifecycle: { factClass: 'deployment_target', usageKind: 'deploy', basisStatus: 'supported', latestStatus: 'supported', superseded: false },
  sourceFreshness: {
    risk: 'high', checkStatus: 'fresh', authenticated: true, sourceId: 'source:deploy', expectedSourceId: 'source:deploy',
    cachedSourceVersion: 7, observedSourceVersion: 7, checkedAtMs: 1000, actionAtMs: 1010, maxAgeMs: 100,
    policyId: 'policy:deploy', expectedPolicyId: 'policy:deploy', policyVersion: 5, expectedPolicyVersion: 5,
    policyAuthenticated: true, sourceVersionNamespace: 'deploy:v2', expectedSourceVersionNamespace: 'deploy:v2', expectedMaxAgeMs: 100,
    expectedPolicyAuthorityIds: ids,
    policyAuthorities: ids.map(authorityId => ({ authorityId, authenticated: true, policyId: 'policy:deploy', policyVersion: 5, sourceVersionNamespace: 'deploy:v2', maxAgeMs: 100 })),
    expectedPolicyAuthorityRosterId: ID, expectedPolicyAuthorityRosterEpoch: epoch, expectedPolicyAuthorityRosterDigest: digest(epoch, ids),
    policyAuthorityRoster: { ...cp(epoch, ids), memberIds: ids },
  },
});

type Mode = 'add-critical-rule'|'enable-critical-rule'|'severity-tighten'|'prediction-tighten'|'weaken-entry-rule';
type Scenario = {id:string;phase:'first'|'observe'|'last'|'none';mode?:Mode;expected:'allow'|'ask'|'deny';control?:'equivalent'|'initial-deny'|'initial-ask'|'offline'|'legacy'|'aba'};
const modes:Mode[]=['add-critical-rule','enable-critical-rule','severity-tighten','prediction-tighten'];
const scenarios:Scenario[]=[
 {id:'unchanged',phase:'none',expected:'allow'},
 ...(['first','observe','last'] as const).flatMap(phase=>modes.map(mode=>({id:`${phase}-${mode}`,phase,mode,expected:'deny' as const}))),
 ...(['first','last'] as const).map(phase=>({id:`${phase}-weaken-entry-rule`,phase,mode:'weaken-entry-rule' as const,expected:'deny' as const})),
 {id:'equivalent-config',phase:'first',control:'equivalent',expected:'allow'},
 {id:'initial-deny',phase:'none',control:'initial-deny',expected:'deny'},
 {id:'initial-ask',phase:'none',control:'initial-ask',expected:'ask'},
 {id:'offline',phase:'first',control:'offline',expected:'ask'},
 {id:'legacy',phase:'none',control:'legacy',expected:'allow'},
 {id:'transient-aba',phase:'first',control:'aba',expected:'allow'},
];
interface Evaluation {action:'allow'|'ask'|'deny';matches:{id:string}[]}
interface Runtime {evaluate(c:any,r:any[],o?:any):Evaluation;loadPack(p:any):any[];evaluateWithSourcePolicyRosterCheckpoint(c:any,r:any[],h:any,o?:any):Promise<Evaluation>}
const runtime=await import(pathToFileURL(DIST).href) as Runtime;
if(typeof runtime.evaluateWithSourcePolicyRosterCheckpoint!=='function') throw new Error('baseline async API unavailable');
const rule=(id:string,pattern:string,severity='critical',enabled=true)=>({id,description:'configuration integrity fixture rule',severity,enabled,category:'bash',appliesTo:['*'],match:{target:'command',kind:'substring',pattern}});
function setup(s:Scenario){
 const input=call();input.command='safe';
 const rules=runtime.loadPack({packId:'exp58',version:'1',rules:[rule('entry-critical','danger'),rule('disabled-critical','safe','critical',false),rule('low','safe','low')]});
 const options={severityTable:{critical:'deny',high:'ask',medium:'ask',low:'allow'},prediction:{pFailure:.1},predictionThresholds:{denyAtOrAbove:.8,askAtOrAbove:.4},ruleVersions:['v1']};
 if(s.control==='initial-deny')input.command='danger';if(s.control==='initial-ask')options.prediction.pFailure=.5;
 return {input,rules,options};
}
type Context=ReturnType<typeof setup>;
function change(c:Context,s:Scenario){
 switch(s.mode){
 case 'add-critical-rule':c.rules.push(...runtime.loadPack({packId:'added',version:'1',rules:[rule('added-critical','safe')]}));break;
 case 'enable-critical-rule':c.rules[1]!.rule.enabled=true;break;
 case 'severity-tighten':c.options.severityTable.low='deny';break;
 case 'prediction-tighten':c.options.prediction.pFailure=.9;break;
 case 'weaken-entry-rule':c.rules[0]!.rule.enabled=false;c.input.command='danger';break;
 }
 if(s.control==='equivalent'){for(const r of c.rules)r.rule=clone(r.rule);c.options.prediction=clone(c.options.prediction);c.options.severityTable=clone(c.options.severityTable);}
 if(s.control==='aba'){c.rules[1]!.rule.enabled=true;c.rules[1]!.rule.enabled=false;}
}
class Host{
 state=cp(2);reads=0;observes=0;
 constructor(readonly s:Scenario,readonly c:Context){}
 async read(){this.reads++;if(this.s.control==='offline')throw new Error('unavailable');if(this.s.phase===(this.reads===1?'first':'last'))change(this.c,this.s);return clone(this.state);}
 async observe(p:Checkpoint){this.observes++;if(this.s.phase==='observe')change(this.c,this.s);if(p.rosterEpoch>this.state.rosterEpoch)this.state={...p,authenticated:true};}
}
const runId=`aci-${Date.now().toString(36)}`;const dir=join(import.meta.dirname,'..','runs');mkdirSync(dir,{recursive:true});const path=join(dir,`${runId}.jsonl`);
const trace=new TraceWriter(path,{runId,experiment:EXP});const bus=new MessageBus({trace});
const manifest=execFileSync('find',[join(REPO,'packages/aegis/dist'),'-type','f'],{encoding:'utf8'}).trim().split('\n').sort().map(p=>({file:p.slice(REPO.length+1),sha256:sha256(readFileSync(p))}));
bus.publish({from:'moderator',to:'*',topic:'meta',body:{evidenceVersion:1,experiment:EXP,spec:'64-async-evaluator-config-integrity',runId,seed:SEED,scenarios,aegis:{repo:REPO,sha:execFileSync('git',['-C',REPO,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['-C',REPO,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),distSha256:sha256(readFileSync(DIST)),manifest,mode:'real-built-public-api'},harnessSha256:sha256(readFileSync(join(import.meta.dirname,'..','src','main.ts')))}});
type Row={id:string;expected:string;action:string;correct:boolean;hazard:boolean;phase:string;reads:number;observes:number;ownership:boolean;noRegression:boolean;matches:string[];liveConfig:unknown};const all:Record<string,Row[]>={};
for(const arm of ['entry-only-control','config-integrity-fixture','aegis-wrapped']){
 const rows:Row[]=[];
 for(const s of scenarios){
  const c=setup(s);const h=new Host(s,c);let result:Evaluation;
  if(arm==='config-integrity-fixture'){result={action:s.mode?'deny':s.control==='initial-deny'?'deny':s.control==='offline'||s.control==='initial-ask'?'ask':'allow',matches:[]};if(s.mode){h.reads=s.phase==='last'?2:1;h.observes=s.phase==='first'?0:1;}}
  else if(s.control==='legacy')result=runtime.evaluate(c.input,c.rules,c.options);
  else if(arm==='aegis-wrapped')result=await runtime.evaluateWithSourcePolicyRosterCheckpoint(c.input,c.rules,h,c.options);
  else{result=runtime.evaluate(c.input,c.rules,c.options);if(result.action==='allow'){try{await h.read();await h.observe({...cp(2),authenticated:false});await h.read();}catch{result={action:'ask',matches:[]};}}}
  // Assign after return to assert Aegis did not freeze caller-owned objects.
  let ownership=true;try{c.options.ruleVersions.push('ownership-probe');c.rules[0]!.rule.description='owner can still write';}catch{ownership=false;}
  const row:Row={id:s.id,expected:s.expected,action:result.action,correct:result.action===s.expected,hazard:!!s.mode,phase:s.phase,reads:h.reads,observes:h.observes,ownership,noRegression:h.state.rosterEpoch===2&&h.state.rosterDigest===digest(2),matches:result.matches.map(m=>m.id),liveConfig:clone(c)};
  rows.push(row);bus.publish({from:arm,to:'moderator',topic:'scenario',body:row});
 }all[arm]=rows;
}
function metrics(arm:string){const rows=all[arm]!;const hazards=rows.filter(r=>r.hazard);const correct=(ids:string[])=>Number(ids.every(id=>rows.find(r=>r.id===id)!.correct));return {
 unsafeConfigAllowRate:hazards.filter(r=>r.action==='allow').length/hazards.length,configFailureDetectionRate:hazards.filter(r=>r.action!=='allow').length/hazards.length,resolutionAccuracy:rows.filter(r=>r.correct).length/rows.length,
 currentDenyPreservation:Number(hazards.filter(r=>!r.id.includes('weaken-entry')).every(r=>r.action==='deny')),entryDenyPreservation:Number(hazards.filter(r=>r.id.includes('weaken-entry')).every(r=>r.action==='deny')),
 earlyNoObserve:Number(hazards.filter(r=>r.phase==='first').every(r=>r.observes===0)),postObserveNoRead:Number(hazards.filter(r=>r.phase==='observe').every(r=>r.reads===1)),
 unchangedAllowance:correct(['unchanged']),equivalentAllowance:correct(['equivalent-config']),initialFloorPreservation:correct(['initial-deny','initial-ask']),legacyPreservation:correct(['legacy']),unavailableSafety:correct(['offline']),transientAbaScopeControl:correct(['transient-aba']),callerOwnership:Number(rows.every(r=>r.ownership)),noCheckpointRegression:Number(rows.every(r=>r.noRegression))};}
const fixture=metrics('config-integrity-fixture');if(fixture.resolutionAccuracy!==1)throw new Error('broken fixture');
for(const arm of Object.keys(all)){console.log(arm,JSON.stringify(metrics(arm)));trace.append({t:'score',ts:Date.now(),scores:Object.fromEntries(Object.entries(metrics(arm)).map(([k,v])=>[`${arm.replaceAll('-','_')}_${k}`,v]))});}
const summary={fixtureAccuracy:fixture.resolutionAccuracy,...Object.fromEntries(Object.entries(metrics('aegis-wrapped')).map(([k,v])=>[`aegisWrapped${k[0]!.toUpperCase()}${k.slice(1)}`,v]))};trace.append({t:'score',ts:Date.now(),scores:summary});
const replay=await readRunRecord(path);if(JSON.stringify(replay.events)!==JSON.stringify(trace.toRunRecord().events))throw new Error('full replay mismatch');
console.log('summary:',JSON.stringify(summary));console.log(`replay verified: ${replay.events.length} events`);console.log(`trace: ${path}`);
