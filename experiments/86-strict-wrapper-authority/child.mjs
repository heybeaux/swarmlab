import {createHash} from 'node:crypto';
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
function callFor(s){return {...(s.tool==='process'?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:s.task??'strict-wrapper-authority',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
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

function authority(f){
 const {st}=f,op='op_strict';let revision=1,marker,hook=async()=>{};const observations=[];
 const digest=`sha256:${createHash('sha256').update(JSON.stringify({minimumRequiredAuthorities:2,operationId:op,requiredAuthorityIds:['witness-a','witness-b'],rosterEpoch:1})).digest('hex')}`;
 const store={...st.store,
  async readEffect(id){const e=await st.store.readEffect(id);return e&&{...e,revision};},
  async beginEffect(id){const result=await st.store.beginEffect(id);if(result)revision++;return result;},
  async burnEffect(id){const result=await st.store.burnEffect(id);if(result)revision++;return result;},
  async readEffectRevision(){return revision;},
  async readEffectRevisionCheckpoint(id){return {operationId:id,revision,verified:true};},
  async readEffectRevisionCheckpoints(id){return ['witness-a','witness-b'].map(authorityId=>({authorityId,operationId:id,revision,verified:true,historyDigest:digest}));},
  async readEffectRevisionWitnessSet(id){return {operationId:id,requiredAuthorityIds:['witness-a','witness-b'],minimumRequiredAuthorities:2,verified:true};},
  async readEffectRevisionWitnessRoster(id){await Promise.resolve();await hook('roster');observations.push({kind:'roster',revision});return {operationId:id,requiredAuthorityIds:['witness-a','witness-b'],minimumRequiredAuthorities:2,rosterEpoch:1,rosterDigest:digest,verified:true};},
 };
 const policyStore={async bindStrictRosterPolicy(id,value){if(marker)return same(marker,value);marker=structuredClone(value);return true;},async readStrictRosterPolicy(){await Promise.resolve();await hook('marker');observations.push({kind:'marker',revision});return marker&&structuredClone(marker);}};
 return {store,policyStore,observations,setHook:f=>{hook=f;},policy:()=>structuredClone(marker)};
}
async function prepared(s,dir){
 const f=await setup(s,dir);f.finalized=await h.finalizeExecutionPermitWithEffectJournal(f.permit,f.clean,'op_strict',f.st.store);
 f.a=authority(f);f.selected=await h.selectDurableStrictRosterPolicy(f.permit,f.clean,'op_strict',f.a.policyStore);f.a.observations.length=0;return f;
}
function invoke(s,f,current){
 if(s.api==='durable-resolve')return h.resolveDurableStrictRosterPolicyExecutionEffect(f.permit,current,'op_strict',f.a.store,f.a.policyStore);
 if(s.api==='durable-begin')return h.beginDurableStrictRosterPolicyExecutionEffect(f.permit,current,'op_strict',f.a.store,f.a.policyStore);
 return h.beginStrictRosterContinuityExecutionEffect(f.permit,current,'op_strict',f.a.store);
}
async function run(s){const dir=mkdtempSync(join(tmpdir(),'aegis-exp86-'));try{
 const f=await prepared(s,join(dir,'case')),current=structuredClone(f.clean);
 if(s.mode==='repair-revoked')current.revoked=true;
 if(s.mode==='repair-link')current.links[0].revoked=true;
 const entry=structuredClone({permit:f.permit,current}),before=f.st.state(),offset=f.st.operations.length;let markers=0,rosters=0,mutations=[];
 f.a.setHook(async kind=>{
  if(kind==='marker')markers++;else rosters++;
  const first=kind===(s.api.startsWith('durable')?'marker':'roster')&&(kind==='marker'?markers:rosters)===1;
  if(first&&s.mode.startsWith('repair'))Object.assign(current,structuredClone(f.clean));
  if(first&&s.mode==='equivalent')current.links=structuredClone(current.links);
  if(s.mode==='pre-revoke-restored'&&kind==='marker'&&markers===1)current.revoked=true;
  if(s.mode==='pre-revoke-restored'&&kind==='roster'&&rosters===1)current.revoked=false;
  if(s.mode==='post-revoke'&&kind==='roster'&&rosters===4)current.revoked=true;
  if(s.mode==='post-revoke-restored'&&kind==='marker'&&markers===2)current.revoked=true;
  if(s.mode==='post-revoke-restored'&&kind==='roster'&&rosters===4)current.revoked=false;
  mutations.push({kind,markers,rosters,current:structuredClone(current)});
 });
 const result=await invoke(s,f,current),after=f.st.state(),operations=structuredClone(f.st.operations.slice(offset)),observations=structuredClone(f.a.observations),live=structuredClone({permit:f.permit,current});
 f.a.setHook(async()=>{});
 const recovery=await h.beginExecutionEffect(entry.permit,structuredClone(f.clean),'op_strict',f.a.store),replay=await h.beginExecutionEffect(entry.permit,structuredClone(f.clean),'op_strict',f.a.store);
 const c=await prepared(s,join(dir,'control')),controlResult=await invoke({...s,mode:'unchanged'},c,structuredClone(c.clean));
 const controlBegin=s.api.endsWith('resolve')?await h.beginExecutionEffect(c.permit,c.clean,'op_strict',c.a.store):controlResult;
 const controlReplay=await h.beginExecutionEffect(c.permit,c.clean,'op_strict',c.a.store);
 return {approval:f.approval,finalized:f.finalized,selected:f.selected,entry,before,result,after,operations,observations,mutations,live,recovery,replay,afterRecovery:f.st.state(),control:{result:controlResult,begin:controlBegin,replay:controlReplay,state:c.st.state()},fixture:await fixture()};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push({id:s.id,status:'returned',response:await run(s)});}catch(e){rows.push({id:s.id,status:'error',response:{error:String(e)}});}}console.log(JSON.stringify(rows));
