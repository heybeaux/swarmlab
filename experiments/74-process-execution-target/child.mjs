import {pathToFileURL} from 'node:url';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,target} from './scenarios.mjs';
const root=process.env.AEGIS_REPO;
const {evaluate,loadPack}=await import(pathToFileURL(`${root}/packages/aegis/dist/index.js`));
const h=await import(pathToFileURL(`${root}/packages/aegis-hook/dist/index.js`));
const rules=loadPack({packId:'lab',version:'1',rules:[{id:'lab.review',category:'secrets',severity:'high',description:'control review',appliesTo:['*'],match:{kind:'substring',target:'content',pattern:'REVIEW'}}]});
function callFor(s){return {...(s.process?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target()}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:'process-input',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
function snapshot(id,s){return {approvalId:id,authorizationDigest:'epoch-1',effectiveConsumerId:'root',links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true,...(s.process?{processTarget:target()}:{})};}
function transition(current,kind){switch(kind){case 'generation':current.processTarget.generationId='generation-2';break;case 'host':current.processTarget.hostId='host-B';break;case 'session':current.processTarget.sessionId='session-2';break;case 'missing':delete current.processTarget;break;case 'unverified':current.processTarget.verified=false;break;case 'blank':current.processTarget.generationId=' ';break;case 'array':current.processTarget=[];break;case 'params-only':current.params={processTarget:current.processTarget};delete current.processTarget;break;case 'reordered':current.processTarget={verified:true,generationId:'generation-1',sessionId:'session-1',hostId:'host-A'};break;case 'extra':current.processTarget.note='irrelevant';break;}return current;}
async function run(s,stale=false){const dir=mkdtempSync(join(tmpdir(),'aegis-exp74-'));try{
 const call=callFor(s),original=structuredClone(call),evaluation=evaluate(call,rules);
 const requested=h.decide(evaluation,{call,approvalDir:dir});h.approvePending(requested.approval.id,dir);
 const consumed=h.decide(evaluation,{call,approvalDir:dir});
 let stored;const store={async create(r){if(stored)return false;stored=structuredClone(r);return true;},async take(id){if(stored?.id!==id)return undefined;const r=stored;stored=undefined;return r;}};
 const permit=s.storage==='local'?h.createExecutionPermit(call,evaluation,consumed.approval.id,dir):await h.createExecutionPermitWithStore(call,evaluation,consumed.approval.id,store);
 const record=()=>s.storage==='local'?JSON.parse(readFileSync(join(dir,`${permit.id}.ready.json`),'utf8')):structuredClone(stored);
 const before=record(),unchanged=same(call,original);if(call.processTarget)call.processTarget.generationId='producer-mutated';const after=record();
 const originalSnapshot=snapshot(permit.approvalId,s),current=transition(structuredClone(originalSnapshot),s.kind),submitted=stale?structuredClone(originalSnapshot):current,submittedBefore=structuredClone(submitted);
 const finalize=c=>s.storage==='local'?h.finalizeExecutionPermit(permit,c,dir):h.finalizeExecutionPermitWithStore(permit,c,store);
 const executed=await finalize(submitted),replayed=await finalize(originalSnapshot);
 return {call:original,evaluation,requested:{exitCode:requested.exitCode,approval:requested.approval},consumed:{exitCode:consumed.exitCode,approval:consumed.approval},permit,record:before,current,submitted,executed,replayed,ownership:unchanged&&same(before,after)&&same(submitted,submittedBefore)};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push({id:s.id,status:'returned',response:{real:await run(s),diagnostic:s.diagnostic?await run(s,true):null}});}catch(e){rows.push({id:s.id,status:'error',response:{error:String(e)}});}}
console.log(JSON.stringify(rows));
