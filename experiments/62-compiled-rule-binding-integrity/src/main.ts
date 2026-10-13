import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { MessageBus, TraceWriter, readRunRecord } from '@swarmlab/core';
const EXP='62-compiled-rule-binding-integrity', SEED='compiled-rule-binding-v1';
const REPO=process.env['AEGIS_REPO']; if(!REPO)throw new Error('AEGIS_REPO required');
const DIST=process.env['AEGIS_DIST']??`${REPO}/packages/aegis/dist/index.js`;
const runtime=await import(pathToFileURL(DIST).href);
const hash=(v:string|Buffer)=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const DIAG='swarmlab.rt52.compiled-rule-requires-bound-stateless-matcher';
const hazards=['declared-pattern','declared-flags','cache-source','cache-flags','cache-global','cache-sticky','cache-missing','declared-disallowed'];
const controls=['valid-hit','valid-miss','flag-i','flag-m','flag-s','flag-u','flag-order','lastIndex','disabled','foreign','substring','multi-target','empty-target','prediction'];
const modes=['pure','strict'];
const rosterId='roster:binding', memberIds=['authority:east','authority:west'];
const digest=hash(JSON.stringify({memberIds,rosterEpoch:2,rosterId}));
const checkpoint=()=>({rosterId,rosterEpoch:2,rosterDigest:digest,authenticated:true});
function call():Record<string,any>{return {tool:'Bash',command:'BLOCK',sourceFreshness:{risk:'high',checkStatus:'fresh',authenticated:true,sourceId:'source:binding',expectedSourceId:'source:binding',cachedSourceVersion:7,observedSourceVersion:7,checkedAtMs:1000,actionAtMs:1010,maxAgeMs:100,policyId:'policy:binding',expectedPolicyId:'policy:binding',policyVersion:5,expectedPolicyVersion:5,policyAuthenticated:true,sourceVersionNamespace:'binding:v2',expectedSourceVersionNamespace:'binding:v2',expectedMaxAgeMs:100,expectedPolicyAuthorityIds:memberIds,policyAuthorities:memberIds.map(authorityId=>({authorityId,authenticated:true,policyId:'policy:binding',policyVersion:5,sourceVersionNamespace:'binding:v2',maxAgeMs:100})),expectedPolicyAuthorityRosterId:rosterId,expectedPolicyAuthorityRosterEpoch:2,expectedPolicyAuthorityRosterDigest:digest,policyAuthorityRoster:{...checkpoint(),memberIds}}};}
function rules(pattern='BLOCK',flags='i',target='command',kind='regex',severity='critical',id='binding.guard'):any[]{return runtime.loadPack({packId:'binding',version:'1',rules:[{id,category:'bash',severity,description:'binding guard',appliesTo:['Bash'],match:{kind,pattern,flags,target}}]});}
function state(r:any[]){return r.map(c=>({rule:structuredClone(c.rule),regex:c.regex?{source:c.regex.source,flags:c.regex.flags,lastIndex:c.regex.lastIndex}:null}));}
class Host {reads=0;observes=0;async read(){this.reads++;return checkpoint();}async observe(){this.observes++;}}
type Row={id:string;hazard:boolean;mixed:boolean;mode:string;checks:Record<string,boolean>;correct:boolean;action:string;expected:string;ids:string[];reads:number;observes:number;before:unknown;after:unknown};
const runId=`crbi-${Date.now().toString(36)}`,dir=join(import.meta.dirname,'..','runs');mkdirSync(dir,{recursive:true});const path=join(dir,`${runId}.jsonl`);
const trace=new TraceWriter(path,{runId,experiment:EXP}),bus=new MessageBus({trace});
const manifest=execFileSync('find',[join(REPO,'packages/aegis/dist'),'-type','f'],{encoding:'utf8'}).trim().split('\n').sort().map(p=>({file:p.slice(REPO.length+1),sha256:hash(readFileSync(p))}));
bus.publish({from:'moderator',to:'*',topic:'meta',body:{evidenceVersion:1,experiment:EXP,spec:68,seed:SEED,runId,hazards,controls,modes,holdout:'reserved-unused-no-tuning',harnessSha256:hash(readFileSync(join(import.meta.dirname,'..','src/main.ts'))),aegis:{sha:execFileSync('git',['-C',REPO,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['-C',REPO,'status','--porcelain'],{encoding:'utf8'}),distSha256:hash(readFileSync(DIST)),manifest,mode:'real-built-public-api'}}});
const results:Record<string,Row[]>={};
for(const arm of ['real-aegis','producer-repair-control']){
 const rows:Row[]=[];
 for(const mode of modes){
  for(const name of [...hazards,...controls])for(const mixed of hazards.includes(name)?[false,true]:[false]){
   const hazard=hazards.includes(name);let rr=rules(),input=call(),opts:Record<string,unknown>={monotonicNowMs:()=>100};let expected='deny';
   switch(name){
    case 'declared-pattern':rr[0].rule.match.pattern='OTHER';break;
    case 'declared-flags':rr[0].rule.match.flags=undefined;break;
    case 'cache-source':rr[0].regex.compile('OTHER','i');break;
    case 'cache-flags':rr[0].regex.compile('BLOCK','');break;
    case 'cache-global':rr[0].regex.compile('BLOCK','gi');rr[0].regex.lastIndex=99;break;
    case 'cache-sticky':rr[0].regex.compile('BLOCK','iy');rr[0].regex.lastIndex=99;break;
    case 'cache-missing':rr[0].regex=undefined;break;
    case 'declared-disallowed':rr[0].rule.match.flags='gi';break;
    case 'valid-miss':input.command='OTHER';expected='allow';break;
    case 'flag-i':rr=rules('block','i');break;
    case 'flag-m':rr=rules('^BLOCK$','m');input.command='safe\nBLOCK\nsafe';break;
    case 'flag-s':rr=rules('B.*K','s');input.command='B\nK';break;
    case 'flag-u':rr=rules('\\u{1F600}','u');input.command='😀';break;
    case 'flag-order':rr=rules('^BLOCK$','mi');break;
    case 'lastIndex':rr[0].regex.lastIndex=99;break;
    case 'disabled':rr[0].regex.compile('OTHER','g');rr[0].rule.enabled=false;expected='allow';break;
    case 'foreign':rr[0].regex.compile('OTHER','g');rr[0].rule.appliesTo=['OtherTool'];expected='allow';break;
    case 'substring':rr=rules('BLOCK','','command','substring','low');rr[0].regex=/OTHER/g;expected='allow';break;
    case 'multi-target':rr=rules('BLOCK','i','path');input.paths=['safe','BLOCK','BLOCK'];break;
    case 'empty-target':input.command='';expected='allow';break;
    case 'prediction':rr=rules('OTHER');opts.prediction={pFailure:.9,confidence:.8,source:'awm'};break;
   }
   if(hazard){
    expected=mixed?'deny':'ask';
    if(arm==='producer-repair-control'){
     const data=structuredClone(rr[0].rule);if(name==='declared-disallowed')data.match.flags='i';
     rr=runtime.loadPack({packId:'repaired',version:'1',rules:[data]});
     expected=name==='declared-pattern'?'allow':'deny';
    }
    if(mixed){rr.push(...rules('BLOCK','i','command','regex','critical','binding.independent'));expected='deny';}
   }
   const before=state(rr),host=new Host();
   const result=mode==='pure'?runtime.evaluate(input,rr,opts):await runtime.evaluateWithSourcePolicyRosterCheckpoint(input,rr,host,opts);
   const ids=result.matches.map((h:any)=>h.id) as string[],diagnostic=ids.includes(DIAG);
   const wantsDiagnostic=hazard&&arm==='real-aegis';
   const wantsIO=mode==='strict'&&expected==='allow';
   const checks={action:result.action===expected,diagnostic:diagnostic===wantsDiagnostic,ownership:isDeepStrictEqual(before,state(rr)),dedup:new Set(ids).size===ids.length,io:host.reads===(wantsIO?2:0)&&host.observes===(wantsIO?1:0),independent:!mixed||ids.includes('binding.independent')};
   const row:Row={id:`${mode}-${name}${mixed?'-independent-deny':''}`,hazard,mixed,mode,checks,correct:Object.values(checks).every(Boolean),action:result.action,expected,ids,reads:host.reads,observes:host.observes,before,after:state(rr)};
   rows.push(row);bus.publish({from:arm,to:'moderator',topic:'scenario',body:row});
  }
 }
 results[arm]=rows;
}
const real=results['real-aegis']!,repair=results['producer-repair-control']!;
const rate=(rows:Row[],p:(r:Row)=>boolean)=>rows.filter(p).length/rows.length;
const hs=real.filter(r=>r.hazard),unmixed=hs.filter(r=>!r.mixed),mixed=hs.filter(r=>r.mixed),strict=hs.filter(r=>r.mode==='strict');
const summary={controlAccuracy:rate(repair,r=>r.correct),aegisUnsafeInvalidAllowRate:rate(unmixed,r=>r.action==='allow'),aegisInvalidBindingDetectionRate:rate(hs,r=>r.ids.includes(DIAG)),aegisResolutionAccuracy:rate(real,r=>r.correct),aegisDenyPreservation:rate(mixed,r=>r.action==='deny'&&r.ids.includes('binding.independent')),aegisEarlyNoIO:rate(strict,r=>r.reads===0&&r.observes===0),aegisValidCompatibility:rate(real.filter(r=>!r.hazard),r=>r.correct),aegisCallerOwnership:rate(real,r=>r.checks['ownership']!),aegisHitDedup:rate(real,r=>r.checks['dedup']!)};
trace.append({t:'score',ts:Date.now(),scores:summary});
const replay=await readRunRecord(path);if(JSON.stringify(replay.events)!==JSON.stringify(trace.toRunRecord().events))throw new Error('full replay mismatch');
console.log('summary:',JSON.stringify(summary));console.log('rows:',real.length,'replay verified:',replay.events.length);console.log(`trace: ${path}`);
if(summary.controlAccuracy!==1)throw new Error('producer repair control failed');
