import {pathToFileURL} from 'node:url';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {scenarios} from './scenarios.mjs';
const root=process.env.AEGIS_REPO;
const {evaluate,loadPack}=await import(pathToFileURL(`${root}/packages/aegis/dist/index.js`));
const h=await import(pathToFileURL(`${root}/packages/aegis-hook/dist/index.js`));
const rules=loadPack({packId:'lab',version:'1',rules:[{id:'lab.review',category:'secrets',severity:'high',description:'control review',appliesTo:['*'],match:{kind:'substring',target:'content',pattern:'REVIEW'}}]});
const target={hostId:'host-A',sessionId:'session-1',generationId:'generation-1',verified:true};
const clone=v=>v===undefined?undefined:structuredClone(v);
const decision=d=>({exitCode:d.exitCode,approval:d.approval??null});
function callFor(s){return {...(s.tool==='process'?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:'strict-journal',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
// Storage transaction simulator only; no Aegis authorization or identity policy.
function storage(){
 const ready=new Map(),effects=new Map(),issued=new Set(),operations=[];let losePrepare=false;
 const store={
  async create(r){operations.push({op:'create',record:clone(r)});if(ready.has(r.id))return false;ready.set(r.id,clone(r));return true;},
  async createOnce(r){operations.push({op:'createOnce',record:clone(r)});if(issued.has(r.id)||ready.has(r.id))return false;issued.add(r.id);ready.set(r.id,clone(r));return true;},
  async readIssuedPermit(id){operations.push({op:'readIssued',id});return issued.has(id)?clone(ready.get(id)):undefined;},
  async take(id){operations.push({op:'take',id});const r=ready.get(id);ready.delete(id);return clone(r);},
  async prepareEffect(id,operationId){operations.push({op:'prepare',id,operationId});const e=effects.get(operationId);if(e)return e.permit.id===id;const r=ready.get(id);if(!r)return false;ready.delete(id);effects.set(operationId,{operationId,permit:clone(r),state:'authorized',claimed:false});if(losePrepare){losePrepare=false;throw Error('single prepare acknowledgement lost');}return true;},
  async claimPreparedEffect(operationId){operations.push({op:'claim',operationId});const e=effects.get(operationId);if(!e||e.claimed||e.state!=='authorized')return;e.claimed=true;return clone(e.permit);},
  async readEffect(operationId){operations.push({op:'read',operationId});return clone(effects.get(operationId));},
  async burnEffect(operationId){operations.push({op:'burn',operationId});const e=effects.get(operationId);if(!e||e.state!=='authorized')return false;e.state='burned';return true;},
  async beginEffect(operationId){operations.push({op:'begin',operationId});const e=effects.get(operationId);if(!e||!e.claimed||e.state!=='authorized')return false;e.state='started';return true;},
  async commitEffect(){throw Error('receipt required');},
  async completeEffect(op,receipt){operations.push({op:'complete',operationId:op,receipt:clone(receipt)});const e=effects.get(op);if(!e)return 'not_started';if(e.state==='committed')return same(e.successReceipt,receipt)?'already_committed':'conflict';if(e.state!=='started')return 'not_started';e.state='committed';e.successReceipt=clone(receipt);return 'committed';},
  async failEffect(op,receipt){operations.push({op:'fail',operationId:op,receipt:clone(receipt)});const e=effects.get(op);if(!e)return 'not_started';if(e.state==='failed')return same(e.failureReceipt,receipt)?'already_failed':'conflict';if(e.state==='committed')return 'conflict';if(e.state!=='started')return 'not_started';e.state='failed';e.failureReceipt=clone(receipt);return 'failed';},
 };
 return {store,ready,effects,operations,loseAck:()=>{losePrepare=true;},state:()=>({ready:[...ready.values()].map(clone),effects:[...effects.values()].map(clone),issued:[...issued].sort()})};
}
async function fixture(){const a=storage(),s=a.store,r={id:'fixture',signature:'original'};const first=await s.createOnce(r),duplicate=await s.createOnce(r);r.signature='changed';const prepared=await s.prepareEffect('fixture','op'),claimed=await s.claimPreparedEffect('op'),claimReplay=await s.claimPreparedEffect('op')??null,start=await s.beginEffect('op'),startReplay=await s.beginEffect('op'),remint=await s.createOnce(r);return {first,duplicate,prepared,claimed,claimReplay,start,startReplay,remint,state:a.state()};}
async function lifecycle(permit,current,st,op,fail=false){
 const store={...st.store};const finalized=await h.finalizeExecutionPermitWithEffectJournal(permit,clone(current),op,store);
 const beforeStart=await h.resolveExecutionEffect(permit,clone(current),op,store);
 const begin=await h.beginExecutionEffect(permit,clone(current),op,store),beginReplay=await h.beginExecutionEffect(permit,clone(current),op,store);
 const receipt={permitId:permit.id,approvalId:permit.approvalId,operationId:op,receiptDigest:`sha256:${'a'.repeat(64)}`,verified:true,...(fail?{failureCode:'effect_rejected'}:{})};
 const terminal=fail?await h.failExecutionEffect(permit,op,receipt,store):await h.completeExecutionEffect(permit,op,receipt,store);
 const resolved=await h.resolveExecutionEffect(permit,clone(current),op,store),terminalBegin=await h.beginExecutionEffect(permit,clone(current),op,store),finalizeReplay=await h.finalizeExecutionPermitWithEffectJournal(permit,clone(current),op,store);
 return {finalized,beforeStart,begin,beginReplay,receipt,terminal,resolved,terminalBegin,finalizeReplay,state:st.state()};
}
async function run(s){const dir=mkdtempSync(join(tmpdir(),'aegis-exp80-'));try{
 const call=callFor(s),evaluation=evaluate(call,rules),approvals=[];
 function consume(){const requested=decision(h.decide(evaluation,{call,approvalDir:dir}));h.approvePending(requested.approval.id,dir);const consumed=decision(h.decide(evaluation,{call,approvalDir:dir}));approvals.push({requested,consumed});return consumed.approval.id;}
 const id=consume(),current={approvalId:id,authorizationDigest:'epoch-1',effectiveConsumerId:'root',links:clone(call.approvalDelegation.links),revoked:false,revocationChecked:true,structurallyValid:true,...(s.tool==='process'?{processTarget:clone(target)}:{})};
 const st=storage(),options=s.kind==='legacy-success'?undefined:{issuanceId:'grant-1'};
 let permit=await h.createExecutionPermitWithStore(call,evaluation,id,st.store,options);const original=clone(permit),minted=clone(st.ready.get(permit.id));let recovery=null,second=null,oldHandle=null,output;
 if(s.kind==='strict-recovered-handle'){recovery=await h.createExecutionPermitWithStore(call,evaluation,id,st.store,{issuanceId:'grant-1',recoverExisting:true});permit=recovery;}
 if(s.kind==='strict-prepare-ack-loss')st.loseAck();
 if(s.positive){
  output=await lifecycle(permit,current,st,'op_main',s.kind==='strict-failure');
  if(s.kind==='strict-fresh-grant'){
   const freshId=consume(),fresh=await h.createExecutionPermitWithStore(call,evaluation,freshId,st.store,{issuanceId:'grant-2'});
   second={permit:fresh,output:await lifecycle(fresh,current,st,'op_fresh')};
   oldHandle={resolved:await h.resolveExecutionEffect(original,current,'op_fresh',st.store),begin:await h.beginExecutionEffect(original,current,'op_fresh',st.store)};
  }
 }else{
  let r=st.ready.get(permit.id);
  if(s.kind==='cross-grant-record'){const freshId=consume(),fresh=await h.createExecutionPermitWithStore(call,evaluation,freshId,st.store,{issuanceId:'grant-2'});const other=clone(st.ready.get(fresh.id));other.id=permit.id;st.ready.set(permit.id,other);r=other;}
  if(s.kind.startsWith('read-')){await st.store.prepareEffect(permit.id,'op_main');await st.store.claimPreparedEffect('op_main');r=st.effects.get('op_main').permit;}
  if(s.kind.endsWith('signature-change'))r.signature+='corruption';
  if(s.kind.endsWith('issuance-change'))r.issuanceId='another-grant';
  if(s.kind==='issuance-remove')delete r.issuanceId;
  if(s.kind==='issuance-invalid')r.issuanceId=17;
  const corruptRecord=clone(r);const snap=clone(current);if(s.kind==='revoked')snap.revoked=true;
  const finalized=s.kind.startsWith('read-')?null:await h.finalizeExecutionPermitWithEffectJournal(permit,snap,'op_main',st.store);
  const resolved=await h.resolveExecutionEffect(original,clone(current),'op_main',{...st.store});
  const begin=await h.beginExecutionEffect(original,clone(current),'op_main',{...st.store});
  output={corruptRecord,finalized,resolved,begin,state:st.state()};
 }
 const legacy=storage(),lp=await h.createExecutionPermitWithStore(call,evaluation,id,legacy.store),legacyControl=await lifecycle(lp,current,legacy,'op_control');
 const simple=storage(),sp=await h.createExecutionPermitWithStore(call,evaluation,id,simple.store,{issuanceId:'control-grant'}),simpleControl={first:await h.finalizeExecutionPermitWithStore(sp,clone(current),simple.store),replay:await h.finalizeExecutionPermitWithStore(sp,clone(current),simple.store)};
 return {call,evaluation,approvals,current,permit,original,minted,recovery,output,second,oldHandle,operations:st.operations,legacyControl,simpleControl,fixture:await fixture()};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push({id:s.id,status:'returned',response:await run(s)});}catch(e){rows.push({id:s.id,status:'error',response:{error:String(e)}});}}console.log(JSON.stringify(rows));
