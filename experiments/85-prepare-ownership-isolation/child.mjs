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
function callFor(s){return {...(s.tool==='process'?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:s.task??'prepare-ownership-isolation',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
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
 const samePrepare=await s.prepareEffect('fixture','op_fixture'),beforeForeign=a.state(),foreignPrepare=await s.prepareEffect('other','op_fixture'),afterForeign=a.state();
 const burned=await s.burnEffect('op_fixture'),startAfterBurn=await s.beginEffect('op_fixture');
 const b=storage();await b.store.createOnce({id:'start'});await b.store.prepareEffect('start','op_start');await b.store.claimPreparedEffect('op_start');
 const start=await b.store.beginEffect('op_start'),startReplay=await b.store.beginEffect('op_start');
 return {first,duplicate,prepared,claimed,claimReplay,samePrepare,foreignPrepare,beforeForeign,afterForeign,burned,startAfterBurn,start,startReplay,state:a.state()};
}
async function setup(s,dir,st=storage(),issuance='issuance-1'){
 const call=callFor(s),evaluation=evaluate(call,rules),requested=decision(h.decide(evaluation,{call,approvalDir:dir}));
 h.approvePending(requested.approval.id,dir);
 const consumed=decision(h.decide(evaluation,{call,approvalDir:dir})),id=consumed.approval.id;
 const clean={approvalId:id,authorizationDigest:'epoch-1',effectiveConsumerId:'root',links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true,...(s.tool==='process'?{processTarget:structuredClone(target)}:{})};
 const permit=await h.createExecutionPermitWithStore(call,evaluation,id,st.store,{requireAtomicIssuance:true,issuanceId:issuance});

 return {call,evaluation,approval:{requested,consumed},clean,st,permit};
}
async function lifecycle(f,op){
 const finalized=await h.finalizeExecutionPermitWithEffectJournal(f.permit,structuredClone(f.clean),op,{...f.st.store});
 const resolved=await h.resolveExecutionEffect(f.permit,structuredClone(f.clean),op,{...f.st.store});
 const begin=await h.beginExecutionEffect(f.permit,structuredClone(f.clean),op,{...f.st.store});
 const replay=await h.beginExecutionEffect(f.permit,structuredClone(f.clean),op,{...f.st.store});
 return {finalized,resolved,begin,replay,state:f.st.state()};
}
async function run(s){const dir=mkdtempSync(join(tmpdir(),'aegis-exp85-'));try{
 const victim=await setup(s,join(dir,'victim'));
 const st=victim.st,op='op_shared';
 if(s.arm==='collision'){
  const contender=await setup({...s,task:s.binding==='same'?'prepare-ownership-isolation':'different-task'},join(dir,'contender'),st,'issuance-2');
  let initial;
  if(s.occupancy==='unclaimed')initial={prepared:await st.store.prepareEffect(victim.permit.id,op)};
  else initial={finalized:await h.finalizeExecutionPermitWithEffectJournal(victim.permit,victim.clean,op,st.store)};
  if(s.occupancy==='started')initial.begin=await h.beginExecutionEffect(victim.permit,victim.clean,op,st.store);
  const before=st.state(),offset=st.operations.length;let prepareValue;
  const adapter={...st.store,async prepareEffect(id,operationId){prepareValue=await st.store.prepareEffect(id,operationId);if(s.ack==='lost')throw Error('prepare response lost');return prepareValue;}};
  const result=await h.finalizeExecutionPermitWithEffectJournal(contender.permit,contender.clean,op,adapter);
  const after=st.state(),challengerOperations=structuredClone(st.operations.slice(offset));
  const ownerRecovery=await lifecycle(victim,op);
  const challengerRecovery=await lifecycle(contender,'op_contender');
  return {victim:{permit:victim.permit,approval:victim.approval},contender:{permit:contender.permit,approval:contender.approval},initial,prepareValue,before,result,after,challengerOperations,ownerRecovery,challengerRecovery,fixture:await fixture()};
 }
 let prepareValue;
 const offset=st.operations.length,adapter={...st.store,
  async prepareEffect(id,operationId){prepareValue=await st.store.prepareEffect(id,operationId);if(s.ack!=='normal')throw Error('successful prepare response lost');return prepareValue;},
  async readEffect(operationId){if(s.ack==='unavailable'){st.operations.push({op:'read-unavailable',operationId});throw Error('read unavailable');}return st.store.readEffect(operationId);}
 };
 const result=await h.finalizeExecutionPermitWithEffectJournal(victim.permit,victim.clean,op,adapter);
 const after=st.state(),initialOperations=structuredClone(st.operations.slice(offset));
 const recovery=await lifecycle(victim,op);
 return {approval:victim.approval,permit:victim.permit,prepareValue,result,after,initialOperations,recovery,fixture:await fixture()};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push({id:s.id,status:'returned',response:await run(s)});}catch(e){rows.push({id:s.id,status:'error',response:{error:String(e)}});}}console.log(JSON.stringify(rows));
