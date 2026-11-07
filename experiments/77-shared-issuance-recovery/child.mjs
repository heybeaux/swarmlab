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
function callFor(s){return {...(s.tool==='process'?h.openClawToolCall({toolName:'process',params:{action:'write',sessionId:'session-1',data:'safe'},processTarget:target}):{tool:'Bash',command:'pwd',content:'REVIEW'}),approvalProvenance:{actorId:'root',sessionId:'agent-session',workspaceId:'lab',taskIntentId:'shared-recovery',authorizationDigest:'epoch-1',grantScope:'exact_session'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};}
const decision=d=>({exitCode:d.exitCode,approval:d.approval??null});
function consume(call,evaluation,dir){const requested=decision(h.decide(evaluation,{call,approvalDir:dir}));h.approvePending(requested.approval.id,dir);return {requested,consumed:decision(h.decide(evaluation,{call,approvalDir:dir}))};}
// Storage mechanics only. All permit identity/validation/finalization belongs to Aegis.
function storage(){const ready=new Map(),issued=new Set(),log=[];let fault='',readFault='';
 const snapshot=()=>({ready:[...ready.values()].map(v=>structuredClone(v)),issued:[...issued].sort()});
 function adapter(host,read=true){return {
  async create(r){log.push({host,op:'create',record:structuredClone(r)});if(ready.has(r.id))return false;ready.set(r.id,structuredClone(r));return true;},
  async createOnce(r){log.push({host,op:'createOnce',record:structuredClone(r)});if(fault==='before')throw Error('before commit');if(issued.has(r.id)||ready.has(r.id))return false;issued.add(r.id);ready.set(r.id,structuredClone(r));if(fault==='after')throw Error('ack lost');return true;},
  ...(read?{async readIssuedPermit(id){let r=issued.has(id)?ready.get(id):undefined;r=r?structuredClone(r):undefined;
   if(readFault==='absent')r=undefined;if(r&&readFault==='signature')r.signature='wrong-signature';if(r&&readFault==='authority')r.authorizationDigest='wrong-epoch';
   log.push({host,op:'readIssuedPermit',id,record:r??null,error:readFault==='throw'});if(readFault==='throw')throw Error('read unavailable');return r;}}:{}),
  async take(id){const r=ready.get(id);ready.delete(id);log.push({host,op:'take',id,record:r?structuredClone(r):null});return r?structuredClone(r):undefined;}
 };}
 return {adapter,snapshot,log,ready,issued,fault:x=>{fault=x;},readFault:x=>{readFault=x;}};
}
async function fixtureControl(){const st=storage(),a=st.adapter('fixture-A'),b=st.adapter('fixture-B');st.ready.set('unmarked',{id:'unmarked'});
 const unmarked=await a.readIssuedPermit('unmarked')??null;st.ready.delete('unmarked');const first=await a.createOnce({id:'fixture'}),read=await b.readIssuedPermit('fixture'),taken=await b.take('fixture'),spent=await a.readIssuedPermit('fixture')??null,reissue=await a.createOnce({id:'fixture'});
 return {unmarked,first,read,taken,spent,reissue,after:st.snapshot()};}
async function run(s){const dir=mkdtempSync(join(tmpdir(),'aegis-exp77-'));try{
 const call=callFor(s),evaluation=evaluate(call,rules),options={issuanceId:'grant-1',recoverExisting:true},original=structuredClone({call,evaluation,options});
 const approval=consume(call,evaluation,dir),id=approval.consumed.approval.id;
 const current={approvalId:id,authorizationDigest:'epoch-1',effectiveConsumerId:'root',links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true,...(s.tool==='process'?{processTarget:structuredClone(target)}:{})};
 const st=storage(),a=st.adapter('A'),b=st.adapter('B'),creations=[],executions=[],replays=[];let freshApproval=null,stale=null,originalRecord=null;
 const mint=async(store,opts=options)=>{try{return {accepted:true,permit:await h.createExecutionPermitWithStore(call,evaluation,id,store,opts)};}catch(e){return {accepted:false,error:String(e)};}};
 const create=async(store,opts=options)=>{const c=await mint(store,opts);creations.push(c);return c;};
 const finish=(p,snap=current,store=b)=>h.finalizeExecutionPermitWithStore(p,snap,store);
 const execute=async(c,snap=current)=>{if(c.accepted)executions.push(await finish(c.permit,snap));};
 const lost=async()=>{st.fault('after');await create(a,{issuanceId:'grant-1'});st.fault('');originalRecord=st.snapshot().ready[0]??null;};
 if(s.kind==='normal-control'){await execute(await create(a));}
 else if(s.kind==='precommit-retry'){st.fault('before');await create(a);st.fault('');await execute(await create(b));}
 else if(s.kind==='ack-loss'){st.fault('after');const c=await create(a);st.fault('');originalRecord=st.snapshot().ready[0]??null;await execute(c);}
 else if(s.kind==='missing-capability'){await create(st.adapter('incapable',false));}
 else if(s.kind==='spent-recovery'){await execute(await create(a));await create(b);}
 else {await lost();
  if(s.kind==='concurrent-recovery'){const cs=await Promise.all([mint(b),mint(st.adapter('C'))]);creations.push(...cs);executions.push(...await Promise.all(cs.filter(c=>c.accepted).map(c=>finish(c.permit))));}
  else if(s.readHazard){st.readFault({'unavailable-read':'throw','absent-read':'absent','mismatched-signature':'signature','mismatched-authority':'authority'}[s.kind]);await create(b);}
  else if(s.kind==='default-no-recovery'){await create(b,{issuanceId:'grant-1'});}
  else {const c=await create(st.adapter('C'));await execute(c,s.kind==='revoked-recovery'?{...current,revoked:true}:current);
   if(s.kind==='revoked-recovery')await create(b);
   if(s.kind==='stale-handle-fresh'){freshApproval=consume(call,evaluation,dir);const fresh=await create(b,{issuanceId:'grant-2',recoverExisting:true});if(c.accepted)stale=await finish(c.permit);await execute(fresh);}
  }
 }
 const beforeReplay=st.snapshot();for(const c of creations)if(c.accepted)replays.push(await finish(c.permit));
 // Frozen no-recovery arm: lost acknowledgement, same default strict retry.
 const controlStore=storage();controlStore.fault('after');const controlFirst=await mint(controlStore.adapter('control-A'),{issuanceId:'grant-1'});controlStore.fault('');const controlRetry=await mint(controlStore.adapter('control-B'),{issuanceId:'grant-1'});
 return {call,evaluation,options,approval,current,creations,executions,stale,freshApproval,originalRecord,beforeReplay,after:st.snapshot(),operations:st.log,replays,ownership:same(original,{call,evaluation,options}),control:{first:controlFirst,retry:controlRetry,after:controlStore.snapshot(),operations:controlStore.log},fixture:await fixtureControl()};
 }finally{rmSync(dir,{recursive:true,force:true});}}
const rows=[];for(const s of scenarios){try{rows.push({id:s.id,status:'returned',response:await run(s)});}catch(e){rows.push({id:s.id,status:'error',response:{error:String(e)}});}}
console.log(JSON.stringify(rows));
