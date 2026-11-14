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
function callFor(s){return {...(s.tool==='process'?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:'claim-contention-invalidation',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
const decision=d=>({exitCode:d.exitCode,approval:d.approval??null});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
// Storage mechanics only: no authorization validation or Aegis policy.
function storage(){
 const ready=new Map(),effects=new Map(),issued=new Set(),operations=[];
 let hook=async()=>{},claimFails=false,burnFailure=null,ackLoss=false;
 const clone=v=>v===undefined?undefined:structuredClone(v);
 const state=()=>({ready:[...ready.values()].map(clone),effects:[...effects.values()].map(clone),issued:[...issued].sort()});
 const store={
  async create(r){operations.push({op:'create',record:clone(r)});if(ready.has(r.id))return false;issued.add(r.id);ready.set(r.id,clone(r));return true;},
  async createOnce(r){operations.push({op:'createOnce',record:clone(r)});if(issued.has(r.id))return false;issued.add(r.id);ready.set(r.id,clone(r));return true;},
  async take(id){const r=ready.get(id);ready.delete(id);return clone(r);},
  async prepareEffect(id,operationId){operations.push({op:'prepare',id,operationId});await hook('prepare');const existing=effects.get(operationId);if(existing)return existing.permit.id===id;const r=ready.get(id);if(!r)return false;ready.delete(id);effects.set(operationId,{operationId,permit:clone(r),state:'authorized',claimed:false});if(ackLoss)throw Error('ack lost after commit');return true;},
  async claimPreparedEffect(operationId){operations.push({op:'claim',operationId});await hook('claim');if(claimFails)throw Error('claim unavailable before commit');const e=effects.get(operationId);if(!e||e.claimed||e.state!=='authorized')return; e.claimed=true;return clone(e.permit);},
  async readEffect(operationId){operations.push({op:'read',operationId});await hook('read');return clone(effects.get(operationId));},
  async burnEffect(operationId){operations.push({op:'burn',operationId});await hook('burn');if(burnFailure==='throws')throw Error('burn unavailable');if(burnFailure==='false')return false;const e=effects.get(operationId);if(!e||e.state==='committed'||e.state==='started')return false;e.state='burned';return true;},
  async beginEffect(operationId){operations.push({op:'begin',operationId});await hook('begin');const e=effects.get(operationId);if(!e||!e.claimed||e.state!=='authorized')return false;e.state='started';return true;},
  async commitEffect(operationId){const e=effects.get(operationId);if(!e||e.state!=='started')return false;e.state='committed';return true;},
 };
 return {store,state,operations,setHook:f=>{hook=f;},configure:o=>{claimFails=o.claimFails??false;burnFailure=o.burnFailure??null;ackLoss=o.ackLoss??false;}};
}
async function fixture(){
 const a=storage(),r={id:'fixture',signature:'fixture'},s=a.store;
 const first=await s.createOnce(r),duplicate=await s.createOnce(r);r.signature='caller-change';
 const prepared=await s.prepareEffect('fixture','op_fixture'),claimed=await s.claimPreparedEffect('op_fixture'),claimReplay=await s.claimPreparedEffect('op_fixture')??null;
 const burned=await s.burnEffect('op_fixture'),startAfterBurn=await s.beginEffect('op_fixture');
 const b=storage();await b.store.createOnce({id:'start'});await b.store.prepareEffect('start','op_start');await b.store.claimPreparedEffect('op_start');
 const start=await b.store.beginEffect('op_start'),startReplay=await b.store.beginEffect('op_start');
 return {first,duplicate,prepared,claimed,claimReplay,burned,startAfterBurn,start,startReplay,state:a.state()};
}
async function setup(s,dir){
 const call=callFor(s),evaluation=evaluate(call,rules),requested=decision(h.decide(evaluation,{call,approvalDir:dir}));
 h.approvePending(requested.approval.id,dir);
 const consumed=decision(h.decide(evaluation,{call,approvalDir:dir})),id=consumed.approval.id;
 const clean={approvalId:id,authorizationDigest:'epoch-1',effectiveConsumerId:'root',links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true,...(s.tool==='process'?{processTarget:structuredClone(target)}:{})};
 const st=storage(),permit=await h.createExecutionPermitWithStore(call,evaluation,id,st.store,{requireAtomicIssuance:true,issuanceId:'claim-contention-consumption-1'});

 return {call,evaluation,approval:{requested,consumed},clean,st,permit};
}
async function run(s){const dir=mkdtempSync(join(tmpdir(),'aegis-exp84-'));try{
 const {call,evaluation,approval,clean,st,permit}=await setup(s,dir);
 const original=structuredClone(permit),current=structuredClone(clean);
 if(s.mode==='repair-revoked')current.revoked=true;
 const entry=structuredClone({permit,current}),before=st.state();
 st.configure({burnFailure:s.burn==='false'?'false':s.burn==='throws'?'throws':null});
 let rival,rivalBegin=null,losingClaim=null;
 const adapter={...st.store,
  async prepareEffect(id,op){
   const prepared=await st.store.prepareEffect(id,op);
   if(s.mode==='prepare-drift-restored')current.revoked=true;
   if(s.prepare==='lost')throw Error('outer prepare acknowledgement lost');
   return prepared;
  },
  async claimPreparedEffect(op){
   // A separate real finalizer wins the claim while the outer caller awaits I/O.
   rival=await h.finalizeExecutionPermitWithEffectJournal(original,structuredClone(clean),op,{...st.store});
   if(s.burn==='started')rivalBegin=await h.beginExecutionEffect(original,structuredClone(clean),op,{...st.store});
   if(s.mode==='prepare-drift-restored'||s.mode==='repair-revoked')current.revoked=false;
   if(s.mode==='claim-revoke')current.revoked=true;
   if(s.mode==='handle-change')permit.id='permit_changed';
   if(s.mode==='equivalent')current.links=structuredClone(current.links);
   const claimed=await st.store.claimPreparedEffect(op);
   losingClaim=claimed??null;
   return claimed;
  }
 };
 const result=await h.finalizeExecutionPermitWithEffectJournal(permit,current,'op_resume',adapter);
 const after=st.state(),operationsAtReturn=structuredClone(st.operations),live=structuredClone({permit,current});
 st.configure({});st.setHook(async()=>{});
 const recovered=await h.finalizeExecutionPermitWithEffectJournal(original,structuredClone(clean),'op_resume',{...st.store});
 const afterRecovery=st.state();
 const resolved=await h.resolveExecutionEffect(original,structuredClone(clean),'op_resume',{...st.store});
 const probe=await h.beginExecutionEffect(original,structuredClone(clean),'op_resume',{...st.store});
 const probeAgain=await h.beginExecutionEffect(original,structuredClone(clean),'op_resume',{...st.store});
 const c=await setup(s,join(dir,'control'));
 const cf=await h.finalizeExecutionPermitWithEffectJournal(c.permit,c.clean,'op_resume',c.st.store);
 const cr=await h.resolveExecutionEffect(c.permit,c.clean,'op_resume',c.st.store);
 const cb=await h.beginExecutionEffect(c.permit,c.clean,'op_resume',c.st.store);
 const cbr=await h.beginExecutionEffect(c.permit,c.clean,'op_resume',c.st.store);
 return {call,evaluation,approval,entry,before,rival,rivalBegin,losingClaim,result,after,live,recovered,afterRecovery,resolved,probe,probeAgain,afterProbe:st.state(),operationsAtReturn,operations:st.operations,control:{finalized:cf,resolved:cr,begin:cb,replay:cbr,state:c.st.state()},fixture:await fixture()};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push({id:s.id,status:'returned',response:await run(s)});}catch(e){rows.push({id:s.id,status:'error',response:{error:String(e)}});}}console.log(JSON.stringify(rows));
