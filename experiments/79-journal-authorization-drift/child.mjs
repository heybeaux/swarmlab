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
function callFor(s){return {...(s.tool==='process'?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:'journal-drift',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
const decision=d=>({exitCode:d.exitCode,approval:d.approval??null});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
// Storage mechanics only: no authorization validation or Aegis policy.
function storage(){
 const ready=new Map(),effects=new Map(),issued=new Set(),operations=[];
 let hook=async()=>{},claimFails=false,burnFailure=null,ackLoss=false;
 const clone=v=>v===undefined?undefined:structuredClone(v);
 const state=()=>({ready:[...ready.values()].map(clone),effects:[...effects.values()].map(clone),issued:[...issued].sort()});
 const store={
  async create(r){if(ready.has(r.id))return false;ready.set(r.id,clone(r));return true;},
  async createOnce(r){operations.push({op:'createOnce',record:clone(r)});if(issued.has(r.id))return false;issued.add(r.id);ready.set(r.id,clone(r));return true;},
  async take(id){const r=ready.get(id);ready.delete(id);return clone(r);},
  async prepareEffect(id,operationId){operations.push({op:'prepare',id,operationId});await hook('prepare');const existing=effects.get(operationId);if(existing)return existing.permit.id===id;const r=ready.get(id);if(!r)return false;ready.delete(id);effects.set(operationId,{operationId,permit:clone(r),state:'authorized',claimed:false});if(ackLoss)throw Error('ack lost after commit');return true;},
  async claimPreparedEffect(operationId){operations.push({op:'claim',operationId});await hook('claim');if(claimFails)throw Error('claim unavailable before commit');const e=effects.get(operationId);if(!e||e.claimed||e.state!=='authorized')return; e.claimed=true;return clone(e.permit);},
  async readEffect(operationId){operations.push({op:'read',operationId});return clone(effects.get(operationId));},
  async burnEffect(operationId){operations.push({op:'burn',operationId});if(burnFailure==='throws')throw Error('burn unavailable');if(burnFailure==='false')return false;const e=effects.get(operationId);if(!e||e.state==='committed'||e.state==='started')return false;e.state='burned';return true;},
  async beginEffect(operationId){operations.push({op:'begin',operationId});const e=effects.get(operationId);if(!e||!e.claimed||e.state!=='authorized')return false;e.state='started';return true;},
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
function invalidate(s,c){
 if(s.kind.includes('repair-digest'))c.authorizationDigest='wrong';
 else if(s.kind.includes('repair-link'))c.links[0].revoked=true;
 else if(s.kind.includes('repair-generation'))c.processTarget.generationId='wrong';
 else if(s.kind.includes('repair')||s.uncertain)c.revoked=true;
}
function mutate(s,stage,c,clean){
 if(s.kind.includes('drift-restored')){c.revoked=stage==='prepare';return;}
 if(stage!==(s.kind.startsWith('prepare-')?'prepare':'claim'))return;
 if(s.kind.includes('repair'))Object.assign(c,structuredClone(clean));
 else if(s.kind.includes('valid-revoked'))c.revoked=true;
 else if(s.kind==='equivalent'){c.links=structuredClone(c.links);if(c.processTarget)c.processTarget=structuredClone(c.processTarget);}
}
async function run(s){const dir=mkdtempSync(join(tmpdir(),'aegis-exp79-'));try{
 const call=callFor(s),evaluation=evaluate(call,rules),requested=decision(h.decide(evaluation,{call,approvalDir:dir}));
 h.approvePending(requested.approval.id,dir);const consumed=decision(h.decide(evaluation,{call,approvalDir:dir})),id=consumed.approval.id;
 const clean={approvalId:id,authorizationDigest:'epoch-1',effectiveConsumerId:'root',links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true,...(s.tool==='process'?{processTarget:structuredClone(target)}:{})};
 const st=storage(),permit=await h.createExecutionPermitWithStore(call,evaluation,id,st.store,{issuanceId:'grant-1'}),current=structuredClone(clean);invalidate(s,current);
 const entry=structuredClone({permit,current});let expected=structuredClone(entry);
 const gates={prepare:{entered:deferred(),release:deferred()},claim:{entered:deferred(),release:deferred()}};
 st.setHook(async stage=>{gates[stage].entered.resolve();await gates[stage].release.promise;});
 st.configure({claimFails:s.kind==='claim-unavailable',burnFailure:s.uncertain?s.kind.slice(5):null,ackLoss:s.kind.startsWith('ack-loss')});
 const finish=(p,c,store)=>h.finalizeExecutionPermitWithEffectJournal(p,c,'op_drift',store);
 const pending=finish(permit,current,st.store);
 for(const stage of ['prepare','claim']){await gates[stage].entered.promise;mutate(s,stage,current,clean);expected=structuredClone({permit,current});gates[stage].release.resolve();}
 const result=await pending,after=st.state(),live=structuredClone({permit,current});st.setHook(async()=>{});st.configure({});
 let recovery=null;if(s.kind==='claim-unavailable')recovery=await finish(permit,structuredClone(clean),st.store);
 const beforeResume=st.state();let resolved=null,started=null,startReplay=null;
 // Fresh adapter, original handle and clean authority; no host execution when storage burn is uncertain.
 const other={...st.store};
 if(!s.uncertain){resolved=await h.resolveExecutionEffect(entry.permit,structuredClone(clean),'op_drift',other);started=await h.beginExecutionEffect(entry.permit,structuredClone(clean),'op_drift',other);startReplay=await h.beginExecutionEffect(entry.permit,structuredClone(clean),'op_drift',other);}
 const replay=await finish(entry.permit,structuredClone(clean),other),afterResume=st.state();
 const control=storage(),cp=await h.createExecutionPermitWithStore(call,evaluation,id,control.store,{issuanceId:'grant-control'});
 const cr=await finish(cp,structuredClone(clean),control.store),cres=await h.resolveExecutionEffect(cp,structuredClone(clean),'op_drift',control.store),cs=await h.beginExecutionEffect(cp,structuredClone(clean),'op_drift',control.store),csr=await h.beginExecutionEffect(cp,structuredClone(clean),'op_drift',control.store),creplay=await finish(cp,structuredClone(clean),control.store);
 return {call,evaluation,approval:{requested,consumed},entry,live,result,after,recovery,beforeResume,resolved,started,startReplay,replay,afterResume,operations:st.operations,ownership:same(live,expected),control:{result:cr,resolved:cres,started:cs,startReplay:csr,replay:creplay,state:control.state()},fixture:await fixture()};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push({id:s.id,status:'returned',response:await run(s)});}catch(e){rows.push({id:s.id,status:'error',response:{error:String(e)}});}}console.log(JSON.stringify(rows));
