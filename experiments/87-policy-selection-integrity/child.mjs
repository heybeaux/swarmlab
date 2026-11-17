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
function callFor(s){return {...(s.tool==='process'?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:s.task??'policy-selection-integrity',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
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
function policyStorage(){
 const records=new Map(),operations=[];
 const store={
  async bindStrictRosterPolicy(operationId,marker){const inserted=!records.has(operationId);if(inserted)records.set(operationId,clone(marker));operations.push({op:'bind',operationId,marker:clone(marker),inserted});return inserted;},
  async readStrictRosterPolicy(operationId){const marker=clone(records.get(operationId));operations.push({op:'read',operationId,marker:marker??null});return marker;}
 };
 return {store,records,operations,state:()=>[...records.values()].map(clone)};
}
async function policyFixture(){
 const p=policyStorage(),marker={operationId:'op_probe',permitId:'permit_probe',approvalId:'approval_probe'};
 const first=await p.store.bindStrictRosterPolicy('op_probe',marker);marker.permitId='caller';
 const duplicate=await p.store.bindStrictRosterPolicy('op_probe',marker);
 const read=await p.store.readStrictRosterPolicy('op_probe'),original=clone(read);read.permitId='reader';
 const retained=await p.store.readStrictRosterPolicy('op_probe');
 return {first,duplicate,original,retained};
}
async function run(s){const dir=mkdtempSync(join(tmpdir(),'aegis-exp87-'));try{
 const a=await setup(s,join(dir,'a'));
 const b=await setup({...s,task:s.binding==='same'?'policy-selection-integrity':'other-selection'},join(dir,'b'),a.st,'issuance-2');
 const operationId='op_select',entry={operationId,permitId:a.permit.id,approvalId:a.permit.approvalId};
 const foreign={operationId,permitId:b.permit.id,approvalId:b.permit.approvalId};
 const p=policyStorage();
 let initial=null;
 if(s.mode==='foreign')initial=await h.selectDurableStrictRosterPolicy(b.permit,b.clean,operationId,p.store)??null;
 if(s.mode==='duplicate')initial=await h.selectDurableStrictRosterPolicy(a.permit,a.clean,operationId,p.store)??null;
 const before=p.state(),offset=p.operations.length,permit=clone(a.permit),current=clone(a.clean);
 let expectedPermit=clone(permit),expectedCurrent=clone(current);const callbacks=[];
 const mutate=()=>{if(s.mode==='foreign'){permit.id=b.permit.id;permit.approvalId=b.permit.approvalId;current.approvalId=b.clean.approvalId;}
  else if(s.mode==='current')current.approvalId='aegis_ffffffffffffffff';
  else if(s.mode==='permit')permit.id=b.permit.id;
 };
 const boundary=async phase=>{
  await Promise.resolve();
  if(s.mode==='equivalent'){current.links=clone(current.links);if(current.processTarget)current.processTarget=clone(current.processTarget);}
  if(s.phase===phase||(s.phase==='bind-restore'&&phase==='bind'))mutate();
  if(s.phase==='bind-restore'&&phase==='read'){Object.assign(permit,clone(a.permit));Object.assign(current,clone(a.clean));}
  expectedPermit=clone(permit);expectedCurrent=clone(current);
  callbacks.push({phase,permit:clone(permit),current:clone(current)});
 };
 const adapter={async bindStrictRosterPolicy(op,marker){const v=await p.store.bindStrictRosterPolicy(op,marker);await boundary('bind');return v;},async readStrictRosterPolicy(op){const v=await p.store.readStrictRosterPolicy(op);await boundary('read');return v;}};
 const result=await h.selectDurableStrictRosterPolicy(permit,current,operationId,adapter)??null;
 const after=p.state(),selectionOperations=clone(p.operations.slice(offset));
 const callerMutable=!Object.isFrozen(permit)&&!Object.isFrozen(current)&&!Object.isFrozen(current.links);
 const callerUnchanged=same(permit,expectedPermit)&&same(current,expectedCurrent);
 const returned=clone(result);if(result)result.permitId='mutated-result';
 const detached=same(p.state(),after)&&same(permit,expectedPermit)&&same(current,expectedCurrent);
 const recovery=await h.selectDurableStrictRosterPolicy(clone(a.permit),clone(a.clean),operationId,p.store)??null;
 const unrelated=await h.selectDurableStrictRosterPolicy(clone(a.permit),clone(a.clean),'op_unrelated',p.store)??null;
 return {id:s.id,status:'returned',response:{a:{permit:a.permit,approval:a.approval},b:{permit:b.permit,approval:b.approval},entry,foreign,initial,before,after,result:returned,selectionOperations,callbacks,callerMutable,callerUnchanged,detached,recovery,unrelated,fixture:await fixture(),policyFixture:await policyFixture()}};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push(await run(s));}catch(e){rows.push({id:s.id,status:'infrastructure-error',response:{error:String(e),stack:e.stack}});}}console.log(JSON.stringify(rows));
