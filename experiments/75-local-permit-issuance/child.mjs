import {pathToFileURL} from 'node:url';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual as same} from 'node:util';
import {scenarios} from './scenarios.mjs';
const root=process.env.AEGIS_REPO;
const {evaluate,loadPack}=await import(pathToFileURL(`${root}/packages/aegis/dist/index.js`));
const h=await import(pathToFileURL(`${root}/packages/aegis-hook/dist/index.js`));
function mint(call,evaluation,id,dir){try{return {accepted:true,permit:h.createExecutionPermit(call,evaluation,id,dir)};}catch(e){return {accepted:false,error:String(e)};}}
if(process.argv.includes('--mint')){const x=JSON.parse(readFileSync(0,'utf8'));console.log(JSON.stringify(mint(x.call,x.evaluation,x.id,x.dir)));process.exit(0);}
const rules=loadPack({packId:'lab',version:'1',rules:[{id:'lab.review',category:'secrets',severity:'high',description:'control review',appliesTo:['*'],match:{kind:'substring',target:'content',pattern:'REVIEW'}}]});
const target={hostId:'host-A',sessionId:'session-1',generationId:'generation-1',verified:true};
function callFor(s){return {...(s.tool==='process'?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:'issuance',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
const decision=d=>({exitCode:d.exitCode,approval:d.approval??null});
function requestAndConsume(call,evaluation,dir){const requested=decision(h.decide(evaluation,{call,approvalDir:dir}));h.approvePending(requested.approval.id,dir);return {requested,consumed:decision(h.decide(evaluation,{call,approvalDir:dir}))};}
function files(dir){return readdirSync(dir).sort().map(name=>({name,body:JSON.parse(readFileSync(join(dir,name),'utf8'))}));}
function run(s,control=false){const dir=mkdtempSync(join(tmpdir(),'aegis-exp75-'));try{
 const call=callFor(s),evaluation=evaluate(call,rules),original=structuredClone({call,evaluation});
 const approval=requestAndConsume(call,evaluation,dir),id=approval.consumed.approval.id;
 const permit=h.createExecutionPermit(call,evaluation,id,dir);
 const current={approvalId:id,authorizationDigest:'epoch-1',effectiveConsumerId:'root',links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true,...(s.tool==='process'?{processTarget:structuredClone(target)}:{})};
 const before=files(dir);let first,second=null,stale=null,recreation=null,freshApproval=null,failedConsumption=null;
 if(control){first=h.finalizeExecutionPermit(permit,{...current,revoked:s.burn},dir);}
 else if(s.kind==='duplicate-ready'){recreation=mint(call,evaluation,id,dir);first=h.finalizeExecutionPermit(permit,current,dir);}
 else {
  first=h.finalizeExecutionPermit(permit,{...current,revoked:s.burn},dir);
  if(s.kind==='pending-remint'||s.kind==='approved-remint'||s.kind==='failed-consume-remint'){
   const pending=h.requestApproval(call,evaluation,dir);
   if(s.kind==='approved-remint')h.approvePending(pending.id,dir);
   if(s.kind==='failed-consume-remint')failedConsumption=h.consumeApproval(call,evaluation,dir);
  }
  if(s.fresh)freshApproval=requestAndConsume(call,evaluation,dir);
  recreation=s.kind==='restart-remint'?JSON.parse(execFileSync(process.execPath,[import.meta.filename,'--mint'],{input:JSON.stringify({call,evaluation,id,dir}),env:{PATH:process.env.PATH,HOME:process.env.HOME,AEGIS_REPO:root},encoding:'utf8',timeout:10000})):mint(call,evaluation,id,dir);
  if(s.kind==='old-handle-after-fresh')stale=h.finalizeExecutionPermit(permit,current,dir);
  second=recreation.accepted?h.finalizeExecutionPermit(recreation.permit,current,dir):false;
 }
 const replay=h.finalizeExecutionPermit(recreation?.accepted?recreation.permit:permit,current,dir);
 return {call,evaluation,approval,permit,current,before,after:files(dir),first,second,stale,recreation,freshApproval,failedConsumption,replay,ownership:same(original,{call,evaluation})};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push({id:s.id,status:'returned',response:{real:run(s),control:run(s,true)}});}catch(e){rows.push({id:s.id,status:'error',response:{error:String(e)}});}}
console.log(JSON.stringify(rows));
