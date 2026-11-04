import {pathToFileURL} from 'node:url';
import {mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {scenarios} from './scenarios.mjs';
const root=process.env.AEGIS_REPO;
const {evaluate,loadPack}=await import(pathToFileURL(`${root}/packages/aegis/dist/index.js`));
const {openClawToolCall,approvalSignature,actionKeyFor,requestApproval,approvePending,approvalPaths,decide}=await import(pathToFileURL(`${root}/packages/aegis-hook/dist/index.js`));
const base=()=>({toolName:'process',toolCallId:'call-1',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:{hostId:'host-A',sessionId:'session-1',generationId:'generation-1',verified:true}});
const high=loadPack({packId:'lab',version:'1',rules:[{id:'lab.review',category:'secrets',severity:'high',description:'explicit review control',appliesTo:['*'],match:{kind:'substring',target:'content',pattern:'REVIEW'}}]});
const critical=loadPack({packId:'lab-deny',version:'1',rules:[{id:'lab.deny',category:'secrets',severity:'critical',description:'independent deny',appliesTo:['process'],match:{kind:'substring',target:'content',pattern:'LAB_DENY'}}]});
function events(s){const origin=base(),retry=base();switch(s.id){
 case 'changed-generation':retry.processTarget.generationId='generation-2';break;
 case 'changed-host':retry.processTarget.hostId='host-B';break;
 case 'missing-retry-target':delete retry.processTarget;break;
 case 'unverified-retry-target':retry.processTarget.verified=false;break;
 case 'mismatched-session':retry.processTarget.sessionId='different';break;
 case 'empty-generation':retry.processTarget.generationId='';break;
 case 'params-only-retry':retry.params.processTarget=retry.processTarget;delete retry.processTarget;break;
 case 'params-old-top-level-new':retry.params.processTarget=structuredClone(origin.processTarget);retry.processTarget.generationId='generation-2';break;
 case 'both-absent':delete origin.processTarget;delete retry.processTarget;break;
 case 'both-unverified':origin.processTarget.verified=false;retry.processTarget.verified=false;break;
 case 'both-empty':origin.processTarget.generationId='';retry.processTarget.generationId='';break;
 case 'both-params-only':for(const e of [origin,retry]){e.params.processTarget=e.processTarget;delete e.processTarget;}break;
 case 'reordered-target':retry.processTarget={verified:true,generationId:'generation-1',sessionId:'session-1',hostId:'host-A'};break;
 case 'changed-toolcall-id':retry.toolCallId='call-2';break;
 case 'irrelevant-param-target':retry.params.processTarget={...retry.processTarget,generationId:'fake'};break;
 case 'legacy-bash':for(const e of [origin,retry]){e.toolName='exec';e.params={command:'pwd',content:'REVIEW'};}retry.processTarget.generationId='irrelevant';break;
 case 'process-poll':for(const e of [origin,retry]){e.params={action:'poll',sessionId:'session-1',content:'REVIEW'};}retry.processTarget.generationId='irrelevant';break;
 }return {origin,retry};}
const outcome=d=>({exitCode:d.exitCode,event:d.approval?.event??null});
function run(s,arm){const dir=mkdtempSync(join(tmpdir(),'aegis-exp73-'));try{
 const {origin,retry}=events(s);if(arm==='session-only'){delete origin.processTarget;delete retry.processTarget;}
 const original=structuredClone({origin,retry});const call=openClawToolCall(origin),next=openClawToolCall(retry),ev=evaluate(call,high),nextEv=evaluate(next,high);
 const id=approvalSignature(call,ev),key=actionKeyFor(call);
 const pending=requestApproval(call,ev,dir);approvePending(pending.id,dir);
 const first=decide(nextEv,{call:next,approvalDir:dir});const retained=existsSync(approvalPaths(pending.id,dir).approvedPath);
 let recovery=null,repeat=null;
 if(s.kind==='hazard'&&s.validOrigin){recovery=outcome(decide(ev,{call,approvalDir:dir}));repeat=outcome(decide(ev,{call,approvalDir:dir}));}
 else if(s.kind==='control'){repeat=outcome(decide(nextEv,{call:next,approvalDir:dir}));}
 const changed=base();if(s.id==='host-identity')changed.processTarget.hostId='host-B';else changed.processTarget.generationId='generation-2';if(arm==='session-only')delete changed.processTarget;
 const other=openClawToolCall(changed),otherEv=evaluate(other,high);
 const clone=openClawToolCall(structuredClone(origin));
 const identity={changedSignature:approvalSignature(other,otherEv)!==id,changedKey:actionKeyFor(other)!==key,cloneSignature:approvalSignature(clone,evaluate(clone,high))===id,cloneKey:actionKeyFor(clone)===key};
 const unchanged=same({origin,retry},original),snapshot=structuredClone(call);if(origin.processTarget)origin.processTarget.generationId='producer-mutated';
 const denyEvent=base();denyEvent.params.text='LAB_DENY';const denyCall=openClawToolCall(denyEvent),denied=evaluate(denyCall,critical);
 return {sameRetryIdentity:approvalSignature(next,nextEv)===id&&actionKeyFor(next)===key,first:outcome(first),retained,recovery,repeat,identity,ownership:unchanged&&same(call,snapshot),deny:{action:denied.action,hits:denied.matches.map(m=>m.id),exitCode:decide(denied,{call:denyCall,approvalDir:dir}).exitCode},benignRecovery:evaluate({tool:'Bash',command:'pwd'},[]).action,initialAction:ev.action,retryAction:nextEv.action};
 }finally{rmSync(dir,{recursive:true,force:true});}}
console.log(JSON.stringify(scenarios.map(s=>{try{return {id:s.id,status:'returned',response:{real:run(s,'real-aegis'),sessionOnly:run(s,'session-only')}};}catch(e){return {id:s.id,status:'error',response:{error:String(e)}};}})));
