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
function callFor(s){return {...(s.tool==='process'?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:'shared-issuance',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
const decision=d=>({exitCode:d.exitCode,approval:d.approval??null});
function consume(call,evaluation,dir){const requested=decision(h.decide(evaluation,{call,approvalDir:dir}));h.approvePending(requested.approval.id,dir);return {requested,consumed:decision(h.decide(evaluation,{call,approvalDir:dir}))};}
// Storage-only fixture: no authorization, issuance-ID generation or Aegis policy.
function storage(){const ready=new Map(),issued=new Set(),log=[];let fault=null;
 const snapshot=()=>({ready:[...ready.values()].map(v=>structuredClone(v)),issued:[...issued].sort()});
 function adapter(host,strict=true){return {
  async create(record){log.push({host,op:'create',record:structuredClone(record)});if(ready.has(record.id))return false;ready.set(record.id,structuredClone(record));return true;},
  ...(strict?{async createOnce(record){log.push({host,op:'createOnce',record:structuredClone(record)});if(fault==='before')throw Error('storage before commit');if(issued.has(record.id)||ready.has(record.id))return false;issued.add(record.id);ready.set(record.id,structuredClone(record));if(fault==='after')throw Error('storage acknowledgement lost');return true;}}:{}),
  async take(id){const record=ready.get(id);ready.delete(id);log.push({host,op:'take',id,record:record?structuredClone(record):null});return record?structuredClone(record):undefined;}
 };}
 return {adapter,snapshot,log,setFault:value=>{fault=value;}};
}
async function fixtureControl(){const s=storage(),a=s.adapter('A'),b=s.adapter('B');const r={id:'fixture-one'},q={id:'fixture-two'};
 return {first:await a.createOnce(r),taken:(await b.take(r.id))?.id??null,reissue:await s.adapter('C').createOnce(r),fresh:await b.createOnce(q),legacyFirst:await a.create({id:'legacy'}),legacyTaken:(await b.take('legacy'))?.id??null,legacyAgain:await b.create({id:'legacy'}),state:s.snapshot()};}
async function run(s){const dir=mkdtempSync(join(tmpdir(),'aegis-exp76-'));try{
 const call=callFor(s),evaluation=evaluate(call,rules),options={issuanceId:'grant-1'},original=structuredClone({call,evaluation,options});
 const approval=consume(call,evaluation,dir),id=approval.consumed.approval.id;
 const current={approvalId:id,authorizationDigest:'epoch-1',effectiveConsumerId:'root',links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true,...(s.tool==='process'?{processTarget:structuredClone(target)}:{})};
 const st=storage(),a=st.adapter('host-A'),b=st.adapter('host-B');
 const mint=async(store,opts=options)=>{try{return {accepted:true,permit:await h.createExecutionPermitWithStore(call,evaluation,id,store,opts)};}catch(e){return {accepted:false,error:String(e)};}};
 const finish=(p,snapshot=current,store=b)=>h.finalizeExecutionPermitWithStore(p,snapshot,store);
 let creations=[],first=null,executions=[],stale=null,freshApproval=null,before=null;
 if(s.refusal){const store=s.kind==='missing-capability'?st.adapter('incapable',false):a;
  creations=[await mint(store,s.kind==='missing-issuance'?{}:s.kind==='blank-issuance'?{issuanceId:'   '}:options)];
  before=st.snapshot();for(const c of creations)if(c.accepted)executions.push(await finish(c.permit));
 }else if(s.failure){
  st.setFault(s.kind==='create-before-failure'?'before':'after');creations.push(await mint(a));before=st.snapshot();st.setFault(null);creations.push(await mint(b));
  for(const c of creations)if(c.accepted)executions.push(await finish(c.permit));
 }else if(s.kind==='concurrent-initial'){
  creations=await Promise.all([mint(a),mint(b)]);before=st.snapshot();for(const c of creations)if(c.accepted)executions.push(await finish(c.permit));
 }else {
  const initial=s.kind==='legacy-control'?{accepted:true,permit:await h.createExecutionPermitWithStore(call,evaluation,id,st.adapter('legacy-A',false))}:await mint(a);
  creations.push(initial);if(!initial.accepted)throw Error('initial creation unexpectedly rejected');before=st.snapshot();first=await finish(initial.permit,{...current,revoked:s.burn});
  if(s.remint){const stores=s.kind==='concurrent-remint'?[a,b]:[s.kind==='reconnect-remint'?st.adapter('host-C'):b];const retries=await Promise.all(stores.map(store=>mint(store)));creations.push(...retries);for(const c of retries)if(c.accepted)executions.push(await finish(c.permit));}
  if(s.fresh){freshApproval=consume(call,evaluation,dir);const next=await mint(b,{issuanceId:'grant-2'});creations.push(next);if(s.kind==='stale-handle-after-fresh')stale=await finish(initial.permit);if(next.accepted)executions.push(await finish(next.permit));}
 }
 const replays=[];for(const c of creations)if(c.accepted)replays.push(await finish(c.permit));
 return {call,evaluation,options,approval,current,creations,first,executions,stale,freshApproval,before,after:st.snapshot(),operations:st.log,replays,ownership:same(original,{call,evaluation,options}),fixture:await fixtureControl()};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push({id:s.id,status:'returned',response:await run(s)});}catch(e){rows.push({id:s.id,status:'error',response:{error:String(e)}});}}
console.log(JSON.stringify(rows));
