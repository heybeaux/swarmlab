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
function callFor(s){return {...(s.tool==='process'?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:s.task??'lifecycle-transition-entry',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
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
const operationId='op_lifecycle',receiptDigest=`sha256:${'a'.repeat(64)}`,terminalRevision=3;
const hash=v=>`sha256:${createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const active=p=>({operationId,permitId:p.id,approvalId:p.approvalId});
const retired=(p,outcome)=>({...active(p),status:'retired',outcome,receiptDigest,terminalRevision});
const compact=(p,outcome)=>({operationId,status:'retirement_compacted',outcome,receiptDigest,terminalRevision,checkpointDigest:hash({approvalId:p.approvalId,operationId,outcome,permitId:p.id,receiptDigest,terminalRevision}),verified:true});
function terminal(p,record,outcome){return {operationId,permit:clone(record),state:outcome,claimed:true,revision:3,[outcome==='committed'?'successReceipt':'failureReceipt']:{...active(p),receiptDigest,verified:true,...(outcome==='failed'?{failureCode:'verified_failure'}:{})}};}
// Linearizable exact CAS and detached reads. Authentication is a host fixture fact.
function lifecycle(initial){
 let value=clone(initial);const operations=[];
 const cas=(op,expected,next,kind)=>{const before=clone(value),applied=op===operationId&&same(value,expected);if(applied)value=clone(next);operations.push({kind,op,expected:clone(expected),next:clone(next),before,applied,after:clone(value)});return applied;};
 const store={
  async bindStrictRosterPolicy(op,marker){if(value!==undefined)return false;value=clone(marker);return true;},
  async readStrictRosterPolicy(op){const result=op===operationId?clone(value):undefined;operations.push({kind:'read',op,result:result??null});return result;},
  async retireStrictRosterPolicy(op,expected,next){return cas(op,expected,next,'retire');},
  async compactStrictRosterPolicyRetirement(op,expected,next){return cas(op,expected,{...next,verified:true},'compact');},
 };
 return {store,operations,state:()=>clone(value)};
}
async function lifecycleFixture(p,q,outcome){
 const a=active(p),r=retired(p,outcome),c=compact(p,outcome),f=lifecycle(a);
 const foreign=await f.store.retireStrictRosterPolicy(operationId,active(q),retired(q,outcome)),afterForeign=f.state();
 const first=await f.store.retireStrictRosterPolicy(operationId,a,r);r.receiptDigest='caller-edit';
 const duplicate=await f.store.retireStrictRosterPolicy(operationId,a,retired(p,outcome));
 const read=await f.store.readStrictRosterPolicy(operationId);read.permitId='caller-edit';const afterRead=f.state();
 const compactFirst=await f.store.compactStrictRosterPolicyRetirement(operationId,retired(p,outcome),{...c,verified:false});
 const compactDuplicate=await f.store.compactStrictRosterPolicyRetirement(operationId,retired(p,outcome),{...c,verified:false});
 return {foreign,afterForeign,first,duplicate,afterRead,compactFirst,compactDuplicate,afterCompact:f.state()};
}
async function run(s){const dir=mkdtempSync(join(tmpdir(),'aegis-exp88-'));try{
 const a=await setup(s,join(dir,'a')),b=await setup({...s,task:'other-lifecycle'},join(dir,'b'),a.st,'issuance-2');
 const aRecord=a.st.state().ready.find(r=>r.id===a.permit.id),bRecord=b.st.state().ready.find(r=>r.id===b.permit.id);
 const journalTruth=terminal(s.mode==='foreign-journal'?b.permit:a.permit,s.mode==='foreign-journal'?bRecord:aRecord,s.outcome);
 const entryTarget=s.api==='retire'?retired(a.permit,s.outcome):compact(a.permit,s.outcome);
 const entryStart=s.api==='retire'?active(a.permit):retired(a.permit,s.outcome);
 const foreignTarget=s.api==='retire'?retired(b.permit,s.outcome):compact(b.permit,s.outcome);
 const before=s.mode==='foreign-journal'?active(b.permit):s.mode==='foreign-retained'?foreignTarget:s.mode==='duplicate'?entryTarget:entryStart;
 const f=lifecycle(before),permit=clone(a.permit),callbacks=[],journalReads=[];
 let expectedPermit=clone(permit);
 const boundary=async phase=>{await Promise.resolve();
  if(s.mode==='equivalent')Object.assign(permit,clone(permit));
  if(phase===s.phase||(s.phase==='cas-restore'&&phase==='cas'))Object.assign(permit,clone(b.permit));
  if(s.phase==='cas-restore'&&phase==='read')Object.assign(permit,clone(a.permit));
  expectedPermit=clone(permit);callbacks.push({phase,permit:clone(permit)});
 };
 const adapter={...f.store,
  async retireStrictRosterPolicy(...args){const result=await f.store.retireStrictRosterPolicy(...args);await boundary('cas');return result;},
  async compactStrictRosterPolicyRetirement(...args){const result=await f.store.compactStrictRosterPolicyRetirement(...args);await boundary('cas');return result;},
  async readStrictRosterPolicy(op){const result=await f.store.readStrictRosterPolicy(op);await boundary('read');return result;},
 };
 const journal={async readEffect(op){const result=op===operationId?clone(journalTruth):undefined;journalReads.push({op,result:result??null});await boundary('journal');return result;}};
 const invoke=(p,store,j)=>s.api==='retire'?h.retireDurableStrictRosterPolicy(p,operationId,s.outcome,receiptDigest,3,store,j):h.compactDurableStrictRosterPolicyRetirement(p,operationId,s.outcome,receiptDigest,3,store);
 const result=await invoke(permit,adapter,journal),after=f.state(),operations=clone(f.operations);
 const callerMutable=!Object.isFrozen(permit),callerUnchanged=same(permit,expectedPermit);
 const recovery=await invoke(clone(a.permit),f.store,{async readEffect(){return clone(journalTruth);}});
 const unrelated=lifecycle(entryStart);const control=await invoke(clone(a.permit),unrelated.store,{async readEffect(){return terminal(a.permit,aRecord,s.outcome);}});
 return {id:s.id,status:'returned',response:{a:{permit:a.permit,record:aRecord,approval:a.approval},b:{permit:b.permit,record:bRecord,approval:b.approval},journalTruth,entryTarget,entryStart,foreignTarget,before,after,result,operations,journalReads,callbacks,callerMutable,callerUnchanged,recovery,control,fixture:await fixture(),lifecycleFixture:await lifecycleFixture(a.permit,b.permit,s.outcome)}};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push(await run(s));}catch(e){rows.push({id:s.id,status:'infrastructure-error',response:{error:String(e),stack:e.stack}});}}console.log(JSON.stringify(rows));
