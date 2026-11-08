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
function callFor(s){return {...(s.tool==='process'?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:'finalization-input',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
const decision=d=>({exitCode:d.exitCode,approval:d.approval??null});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
// No authority policy here: only atomic records and deterministic transport suspension.
function storage(){const ready=new Map(),prepared=new Map(),issued=new Set(),operations=[];let pause=null,fail=false;
 const state=()=>({ready:[...ready.values()].map(v=>structuredClone(v)),prepared:[...prepared.entries()].map(([id,v])=>({id,record:structuredClone(v)})),issued:[...issued].sort()});
 const clone=v=>v===undefined?undefined:structuredClone(v);
 const wait=async()=>{if(pause){pause.entered.resolve();await pause.release.promise;}if(fail)throw Error('fixture unavailable');};
 const store={async create(r){operations.push({op:'create',record:clone(r)});if(ready.has(r.id))return false;ready.set(r.id,clone(r));return true;},
 async createOnce(r){operations.push({op:'createOnce',record:clone(r)});if(issued.has(r.id))return false;issued.add(r.id);ready.set(r.id,clone(r));return true;},
 async take(id){operations.push({op:'take',id});await wait();const r=ready.get(id);ready.delete(id);return clone(r);},
 async prepareTake(id,operationId){operations.push({op:'prepare',id,operationId});if(prepared.has(operationId))return true;const r=ready.get(id);if(!r)return false;ready.delete(id);prepared.set(operationId,clone(r));return true;},
 async claimPreparedTake(operationId){operations.push({op:'claim',operationId});await wait();const r=prepared.get(operationId);prepared.delete(operationId);return clone(r);}};
 return {store,state,operations,pause:p=>{pause=p;},fail:f=>{fail=f;}};
}
function initial(s,snap){switch(s.kind){case 'revoked-repaired':snap.revoked=true;break;case 'unchecked-repaired':snap.revocationChecked=false;break;case 'structure-repaired':snap.structurallyValid=false;break;case 'digest-repaired':snap.authorizationDigest='wrong-epoch';break;case 'link-repaired':snap.links[0].revoked=true;break;case 'process-generation-repaired':snap.processTarget.generationId='wrong-generation';break;}}
function mutate(s,snap){switch(s.kind){case 'revoked-repaired':snap.revoked=false;break;case 'unchecked-repaired':snap.revocationChecked=true;break;case 'structure-repaired':snap.structurallyValid=true;break;case 'digest-repaired':snap.authorizationDigest='epoch-1';break;case 'link-repaired':snap.links[0].revoked=false;break;case 'process-generation-repaired':snap.processTarget.generationId='generation-1';break;case 'valid-revoked':snap.revoked=true;break;case 'valid-link-revoked':snap.links[0].revoked=true;break;case 'equivalent':snap.links=structuredClone(snap.links);if(snap.processTarget)snap.processTarget=structuredClone(snap.processTarget);break;case 'transient-ABA':snap.revoked=true;snap.revoked=false;break;}}
async function fixture(){const st=storage(),a=st.store,record={id:'fixture'};const first=await a.createOnce(record),duplicate=await a.createOnce(record),taken=await a.take(record.id),replay=await a.take(record.id)??null;await a.create({id:'prepared'});const prepare=await a.prepareTake('prepared','op_fixture'),claim=await a.claimPreparedTake('op_fixture'),claimReplay=await a.claimPreparedTake('op_fixture')??null;return {first,duplicate,taken,replay,prepare,claim,claimReplay,state:st.state()};}
async function run(s){const dir=mkdtempSync(join(tmpdir(),'aegis-exp78-'));try{
 const call=callFor(s),evaluation=evaluate(call,rules);const requested=decision(h.decide(evaluation,{call,approvalDir:dir}));h.approvePending(requested.approval.id,dir);const consumed=decision(h.decide(evaluation,{call,approvalDir:dir}));const id=consumed.approval.id;
 const clean={approvalId:id,authorizationDigest:'epoch-1',effectiveConsumerId:'root',links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true,...(s.tool==='process'?{processTarget:structuredClone(target)}:{})};
 const st=storage(),permit=await h.createExecutionPermitWithStore(call,evaluation,id,st.store,{issuanceId:'grant-1'}),current=structuredClone(clean);initial(s,current);
 const entry=structuredClone({permit,current}),barrier={entered:deferred(),release:deferred()};st.pause(barrier);st.fail(s.kind==='unavailable');
 const finish=(p,c,store,op='op_finalization')=>s.api==='simple'?h.finalizeExecutionPermitWithStore(p,c,store):h.finalizeExecutionPermitWithReconciliation(p,c,op,store);
 const pending=finish(permit,current,st.store);await barrier.entered.promise;mutate(s,current);const expectedCaller=structuredClone({permit,current});barrier.release.resolve();const result=await pending;
 const after=st.state(),live=structuredClone({permit,current});st.pause(null);st.fail(false);let recovery=null;if(s.kind==='unavailable')recovery=await finish(permit,structuredClone(clean),st.store);
 const replay=await finish(permit,structuredClone(clean),st.store),afterReplay=st.state();
 const control=storage(),controlPermit=await h.createExecutionPermitWithStore(call,evaluation,id,control.store,{issuanceId:'grant-control'});const controlResult=await finish(controlPermit,structuredClone(clean),control.store),controlReplay=await finish(controlPermit,structuredClone(clean),control.store);
 return {call,evaluation,approval:{requested,consumed},entry,live,result,after,recovery,replay,afterReplay,operations:st.operations,ownership:same(live,expectedCaller),control:{result:controlResult,replay:controlReplay,state:control.state()},fixture:await fixture()};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push({id:s.id,status:'returned',response:await run(s)});}catch(e){rows.push({id:s.id,status:'error',response:{error:String(e)}});}}console.log(JSON.stringify(rows));
