import {pathToFileURL} from 'node:url';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {createHash} from 'node:crypto';
import {scenarios} from './scenarios.mjs';
const root=process.env.AEGIS_REPO;
const {evaluate,loadPack}=await import(pathToFileURL(`${root}/packages/aegis/dist/index.js`));
const h=await import(pathToFileURL(`${root}/packages/aegis-hook/dist/index.js`));
const rules=loadPack({packId:'lab',version:'1',rules:[{id:'lab.review',category:'secrets',severity:'high',description:'control review',appliesTo:['*'],match:{kind:'substring',target:'content',pattern:'REVIEW'}}]});
const target={hostId:'host-A',sessionId:'session-1',generationId:'generation-1',verified:true};
function callFor(s){return {...(s.tool==='process'?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:s.task??'late-lifecycle-resolution',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
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
const clone=v=>v===undefined?undefined:structuredClone(v);
const operationId='op_late_resolution',receiptDigest=`sha256:${'a'.repeat(64)}`;
const digest=v=>`sha256:${createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
function proof(p,outcome,route){return route==='retired'
 ? {operationId,permitId:p.id,approvalId:p.approvalId,status:'retired',outcome,receiptDigest,terminalRevision:3}
 : {operationId,status:'retirement_compacted',outcome,receiptDigest,terminalRevision:3,checkpointDigest:digest({approvalId:p.approvalId,operationId,outcome,permitId:p.id,receiptDigest,terminalRevision:3}),verified:true};}
function authorities(record){const {status,...fields}=record;return ['authority-A','authority-B'].map(authorityId=>({authorityId,...fields}));}
const names={retired:'Retired',legacy:'Compacted',auto:'Compacted',explicit:'MultiAuthorityCompacted'};
async function invoke(s,entry,other,record,authorityRecords,verb='resolve',clean=false){
 const permit=clone(entry),before=clone(record),calls=[];let expected=clone(entry);
 async function boundary(phase){await Promise.resolve();
  if(!clean){
   if(s.mode==='equivalent')Object.assign(permit,clone(entry));
   if(phase==='read'&&['foreign-switch','local-drift','read-restore'].includes(s.mode))Object.assign(permit,other);
   if(phase==='authority'&&s.mode==='authority-drift')Object.assign(permit,other);
   if(phase==='authority'&&s.mode==='read-restore')Object.assign(permit,entry);
  }
  expected=clone(permit);calls.push({phase,permit:clone(permit)});
  if(!clean&&s.mode==='outage'&&phase==='read')throw Error('read unavailable');
 }
 const store={async readStrictRosterPolicy(op){const result=op===operationId?clone(record):undefined;await boundary('read');return result;}};
 if(['auto','explicit'].includes(s.route))store.readCompactRetirementCheckpointAuthorities=async op=>{const result=op===operationId?clone(authorityRecords):undefined;await boundary('authority');return result;};
 const result=await h[`${verb}${names[s.route]}DurableStrictRosterPolicyExecutionEffect`](permit,operationId,store);
 return {result,calls,before,after:clone(record),callerMutable:!Object.isFrozen(permit),callerUnchanged:same(permit,expected)};
}
async function run(s){const dir=mkdtempSync(join(tmpdir(),'aegis-exp89-'));try{
 const a=await setup(s,join(dir,'a')),b=await setup({...s,task:'foreign-lifecycle'},join(dir,'b'),a.st,'issuance-2');
 const foreign=s.mode.startsWith('foreign'),record=proof(foreign?b.permit:a.permit,s.outcome,s.route),auth=s.route==='retired'?[]:authorities(record);
 const observed=await invoke(s,a.permit,b.permit,record,auth),begin=await invoke(s,a.permit,b.permit,record,auth,'begin');
 const recovery=await invoke(s,a.permit,b.permit,record,auth,'resolve',true);
 const local=proof(a.permit,s.outcome,s.route),control=await invoke(s,a.permit,b.permit,local,s.route==='retired'?[]:authorities(local),'resolve',true);
 const detached=clone(record);detached.outcome='tampered';const detachedAuthorities=clone(auth);if(detachedAuthorities[0])detachedAuthorities[0].outcome='tampered';
 return {id:s.id,status:'returned',response:{a:{permit:a.permit,approval:a.approval,record:a.st.state().ready.find(r=>r.id===a.permit.id)},b:{permit:b.permit,approval:b.approval,record:a.st.state().ready.find(r=>r.id===b.permit.id)},record,authorities:auth,observed,begin,recovery,control,fixture:await fixture(),detachedRead:detached.outcome!==record.outcome&&(auth.length===0||detachedAuthorities[0].outcome!==auth[0].outcome)}};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push(await run(s));}catch(e){rows.push({id:s.id,status:'infrastructure-error',response:{error:String(e),stack:e.stack}});}}console.log(JSON.stringify(rows));
