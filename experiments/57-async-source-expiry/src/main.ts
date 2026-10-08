import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { MessageBus, TraceWriter, readRunRecord } from '@swarmlab/core';
const EXP = '57-async-source-expiry';
const SEED = 'async-source-expiry-v1';
const REPO = process.env['AEGIS_REPO'] ?? '/Users/beauxwalton/projects/worktrees/aegis-2026-10-07-exp57-baseline';
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

type Tick = number | 'nan' | 'infinity' | 'throw';
type Scenario = { id: string; ticks: Tick[]; expected: 'allow' | 'ask' | 'deny'; hazard?: boolean; age?: number; maxAge?: number; version?: number; mode?: 'deny' | 'legacy' | 'offline' | 'ack-loss'; entry?: Tick; expectedReads: number; expectedObserves: number };
const scenario = (id: string, ticks: Tick[], expected: 'allow' | 'ask', reads=2, observes=1, hazard=false): Scenario => ({id,ticks,expected,expectedReads:reads,expectedObserves:observes,hazard});
const scenarios: Scenario[] = [
 scenario('unchanged-clock',[0,0,0],'allow'),
 scenario('first-read-inclusive',[90,90,90],'allow'),
 scenario('first-read-expired',[91,91,91],'ask',1,0,true),
 scenario('observe-expired',[0,91,91],'ask',1,1,true),
 scenario('final-read-expired',[0,0,91],'ask',2,1,true),
 scenario('cumulative-expiry',[30,60,91],'ask',2,1,true),
 scenario('final-read-inclusive',[0,0,90],'allow'),
 {...scenario('initial-boundary-then-expired',[1,1,1],'ask',1,0,true),age:100},
 {...scenario('zero-budget-zero-elapsed',[0,0,0],'allow'),age:0,maxAge:0},
 {...scenario('zero-budget-expired',[1,1,1],'ask',1,0,true),age:0,maxAge:0},
 {...scenario('fresh-adopted-version',[20,20,20],'allow'),version:8},
 scenario('clock-regressed',[-1,-1,-1],'ask',1,0,true),
 scenario('clock-nan',['nan','nan','nan'],'ask',1,0,true),
 scenario('clock-infinite',['infinity','infinity','infinity'],'ask',1,0,true),
 scenario('clock-throws',['throw','throw','throw'],'ask',1,0,true),
 {...scenario('entry-clock-nan',[0,0,0],'ask',0,0,true),entry:'nan'},
 {id:'initial-critical-deny',ticks:[1000,1000,1000],expected:'deny',mode:'deny',expectedReads:0,expectedObserves:0},
 {...scenario('pure-evaluate-legacy',[1000,1000,1000],'allow',0,0),mode:'legacy'},
 {...scenario('first-store-read-unavailable',[0,0,0],'ask',1,0),mode:'offline'},
 {...scenario('expired-ack-loss',[0,91,91],'ask',1,1,true),mode:'ack-loss'},
];
class Host {
 state=cp(2); reads=0; observes=0; tick:Tick; clockReads=0;
 constructor(readonly s:Scenario){ this.tick=s.entry ?? 0; }
 now=()=>{ this.clockReads++; if(this.tick==='throw')throw new Error('clock unavailable');return this.tick==='nan'?NaN:this.tick==='infinity'?Infinity:10000+this.tick; };
 async read(){this.reads++;this.tick=this.s.ticks[this.reads===1?0:2]!;if(this.s.mode==='offline')throw new Error('store unavailable');return clone(this.state);}
 async observe(p:Checkpoint){this.observes++;this.tick=this.s.ticks[1]!;if(p.rosterEpoch>this.state.rosterEpoch)this.state={...p,authenticated:true};if(this.s.mode==='ack-loss')throw new Error('commit succeeded, ack lost');}
}
interface Evaluation {action:'allow'|'ask'|'deny';matches:{id:string}[]}
interface Runtime {evaluate(c:any,r:any[],o?:any):Evaluation;loadPack(p:any):any[];evaluateWithSourcePolicyRosterCheckpoint(c:any,r:any[],h:any,o?:any):Promise<Evaluation>}
const runtime=await import(pathToFileURL(DIST).href) as Runtime;
if(typeof runtime.evaluateWithSourcePolicyRosterCheckpoint!=='function')throw new Error('baseline public API missing');
const rules=runtime.loadPack({packId:'exp57',version:'1',rules:[{id:'exp57.critical',description:'critical floor',severity:'critical',category:'destructive',appliesTo:['*'],match:{target:'command',kind:'substring',pattern:'exp57-danger'}}]});
const runId=`ase-${Date.now().toString(36)}`;const dir=join(import.meta.dirname,'..','runs');mkdirSync(dir,{recursive:true});const path=join(dir,`${runId}.jsonl`);
const trace=new TraceWriter(path,{runId,experiment:EXP});const bus=new MessageBus({trace});
const manifest=execFileSync('find',[join(REPO,'packages/aegis/dist'),'-type','f'],{encoding:'utf8'}).trim().split('\n').sort().map(p=>({file:p.slice(REPO.length+1),sha256:sha256(readFileSync(p))}));
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim();
bus.publish({from:'moderator',to:'*',topic:'meta',body:{evidenceVersion:1,experiment:EXP,spec:'63-async-source-expiry',runId,timestamp:new Date().toISOString(),seed:SEED,scenarios,evidenceKind:'package_retest',command:`AEGIS_REPO=${REPO} AEGIS_DIST=${DIST} node experiments/${EXP}/dist/main.js`,repo:{commit:git('rev-parse','HEAD'),trackedDirty:git('diff','--name-only','HEAD')!==''},aegis:{repo:REPO,sha:git('-C',REPO,'rev-parse','HEAD'),trackedDirty:git('-C',REPO,'diff','--name-only','HEAD')!=='',distSha256:sha256(readFileSync(DIST)),manifest,mode:'real-built-public-api'},harnessSha256:sha256(readFileSync(join(import.meta.dirname,'..','src','main.ts')))}});
// Independent integer-budget oracle. Not Aegis policy: baseline's initial source shape is valid,
// this only scores elapsed lifetime and explicitly scripted infrastructure faults.
async function fixture(s:Scenario,h:Host):Promise<Evaluation>{
 const result=(action:Evaluation['action']):Evaluation=>({action,matches:[]});
 if(s.mode==='deny')return result('deny');if(s.mode==='legacy')return result('allow');
 let start:number,last:number;
 try{start=h.now();last=start;if(!Number.isFinite(start)||start<0)return result('ask');}catch{return result('ask');}
 const usable=()=>{try{const n=h.now();if(!Number.isFinite(n)||n<last||n<start)return false;last=n;return (s.age??10)+n-start<=(s.maxAge??100);}catch{return false;}};
 try{await h.read();}catch{return result('ask');}if(!usable())return result('ask');
 try{await h.observe({...cp(2),authenticated:false});}catch{/* truthful ack-loss allowed only while fresh */}if(!usable())return result('ask');
 await h.read();return result(usable()?'allow':'ask');
}
type Row={id:string;action:string;expected:string;correct:boolean;countsCorrect:boolean;hazard:boolean;reads:number;observes:number;clockReads:number;clockValue:string;state:Checkpoint;unchanged:boolean;matches:string[]};
const all:Record<string,Row[]>={};
for(const arm of ['entry-only-control','elapsed-fixture','aegis-wrapped']){
 const rows:Row[]=[];
 for(const s of scenarios){const input=call();const f=input.sourceFreshness;f.actionAtMs=1000+(s.age??10);f.maxAgeMs=s.maxAge??100;f.expectedMaxAgeMs=f.maxAgeMs;f.policyAuthorities.forEach((a:any)=>a.maxAgeMs=f.maxAgeMs);f.cachedSourceVersion=s.version??7;f.observedSourceVersion=s.version??7;if(s.mode==='deny')input.command='exp57-danger';const before=clone(input);const host=new Host(s);let result:Evaluation;
 if(arm==='elapsed-fixture')result=await fixture(s,host);else if(arm==='entry-only-control'||s.mode==='legacy')result=runtime.evaluate(input,rules);else result=await runtime.evaluateWithSourcePolicyRosterCheckpoint(input,rules,host,{monotonicNowMs:host.now});
 const row:Row={id:s.id,action:result.action,expected:s.expected,correct:result.action===s.expected,countsCorrect:host.reads===s.expectedReads&&host.observes===s.expectedObserves,hazard:!!s.hazard,reads:host.reads,observes:host.observes,clockReads:host.clockReads,clockValue:String(host.tick),state:clone(host.state),unchanged:isDeepStrictEqual(before,input),matches:result.matches.map(m=>m.id)};rows.push(row);bus.publish({from:arm,to:'moderator',topic:'scenario',body:row});
 }all[arm]=rows;
}
function metrics(arm:string){const rows=all[arm]!;const bad=rows.filter(r=>r.hazard);const correct=(ids:string[])=>Number(ids.every(id=>{const r=rows.find(r=>r.id===id)!;return r.correct&&r.countsCorrect;}));return{
 unsafeExpiredAllowRate:bad.filter(r=>r.action==='allow').length/bad.length,failureDetectionRate:bad.filter(r=>r.action!=='allow').length/bad.length,resolutionAccuracy:rows.filter(r=>r.correct).length/rows.length,
 inclusiveBoundaryAllowance:correct(['first-read-inclusive','final-read-inclusive','zero-budget-zero-elapsed']),earlyExpiryNoObserve:correct(['first-read-expired','initial-boundary-then-expired','zero-budget-expired']),postObserveExpiryNoRead:correct(['observe-expired','expired-ack-loss']),clockFailureSafety:correct(['clock-regressed','clock-nan','clock-infinite','clock-throws','entry-clock-nan']),criticalDenyPreservation:correct(['initial-critical-deny']),legacyPreservation:correct(['pure-evaluate-legacy']),unavailableSafety:correct(['first-store-read-unavailable']),unchangedInput:Number(rows.every(r=>r.unchanged)),noCheckpointRegression:Number(rows.every(r=>r.state.rosterEpoch===2&&r.state.rosterDigest===digest(2)))
};}
const f=metrics('elapsed-fixture');if(Object.values(f).some((v,i)=>v!==(i===0?0:1)))throw new Error(`fixture red: ${JSON.stringify(f)}`);
for(const arm of Object.keys(all)){console.log(arm,JSON.stringify(metrics(arm)));trace.append({t:'score',ts:Date.now(),scores:Object.fromEntries(Object.entries(metrics(arm)).map(([k,v])=>[`${arm.replaceAll('-','_')}_${k}`,v]))});}
const summary={fixtureAccuracy:f.resolutionAccuracy,...Object.fromEntries(Object.entries(metrics('aegis-wrapped')).map(([k,v])=>[`aegisWrapped${k[0]!.toUpperCase()}${k.slice(1)}`,v]))};trace.append({t:'score',ts:Date.now(),scores:summary});
const replay=await readRunRecord(path);if(JSON.stringify(replay.events)!==JSON.stringify(trace.toRunRecord().events))throw new Error('full replay mismatch');
console.log('summary:',JSON.stringify(summary));console.log(`replay verified: ${replay.events.length} events`);console.log(`trace: ${path}`);
