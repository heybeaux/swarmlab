import {pathToFileURL} from 'node:url';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {scenarios} from './scenarios.mjs';
const root=process.env.AEGIS_REPO;
const {evaluate,loadPack}=await import(pathToFileURL(`${root}/packages/aegis/dist/index.js`));
const h=await import(pathToFileURL(`${root}/packages/aegis-hook/dist/index.js`));
const rules=loadPack({packId:'lease-lab',version:'1',rules:[{id:'lab.review',category:'secrets',severity:'high',description:'review control',appliesTo:['*'],match:{kind:'substring',target:'content',pattern:'REVIEW'}}]});
const clone=v=>v===undefined?undefined:structuredClone(v);
// Only atomic data movement; no expiry, authority or acceptance policy in adapter.
function storage(callback=()=>{}) {
  const ready=new Map(),prepared=new Map(),issued=new Set(),operations=[];
  const state=()=>({ready:[...ready.values()].map(clone),prepared:[...prepared.entries()].map(([id,record])=>({id,record:clone(record)})),issued:[...issued]});
  const store={
    async create(record){if(ready.has(record.id))return false;ready.set(record.id,clone(record));return true;},
    async createOnce(record){if(issued.has(record.id))return false;issued.add(record.id);ready.set(record.id,clone(record));return true;},
    async take(id){operations.push('take');await callback('take');const r=ready.get(id);ready.delete(id);return clone(r);},
    async prepareTake(id,op){operations.push('prepare');if(prepared.has(op))return true;const r=ready.get(id);if(!r)return false;ready.delete(id);prepared.set(op,clone(r));await callback('prepare');return true;},
    async claimPreparedTake(op){operations.push('claim');await callback('claim');const r=prepared.get(op);prepared.delete(op);return clone(r);},
  };
  return {store,state,operations};
}
async function fixtureCheck(){const s=storage(),r={id:'fixture'};return {first:await s.store.createOnce(r),duplicate:await s.store.createOnce(r),taken:await s.store.take(r.id),replay:await s.store.take(r.id)??null,remint:await s.store.createOnce(r),state:s.state()};}
async function run(s){
 const dir=mkdtempSync(join(tmpdir(),'aegis-exp94-'));
 try {
  const call={tool:'Bash',command:'pwd',content:'REVIEW',approvalProvenance:{actorId:'root',authorizationDigest:'epoch-1'},approvalDelegation:{effectiveConsumerId:'root',declaredScope:'none',maxDepth:0,links:[{actorId:'root',authorityLevel:1,verified:true,revoked:false}],revoked:false,revocationChecked:true,structurallyValid:true}};
  const evaluation=evaluate(call,rules),requested=h.decide(evaluation,{call,approvalDir:dir});
  h.approvePending(requested.approval.id,dir);const consumed=h.decide(evaluation,{call,approvalDir:dir});
  const clean={approvalId:consumed.approval.id,authorizationDigest:'epoch-1',effectiveConsumerId:'root',links:clone(call.approvalDelegation.links),revoked:false,revocationChecked:true,structurallyValid:true};
  const current=clone(clean);if(s.kind==='revoked')current.revoked=true;
  let clock=s.kind==='expired-entry'?201:s.kind==='clock-invalid-entry'?NaN:100;
  let throwClock=false,unavailable=s.kind==='store-unavailable',stage='entry';const clockReads=[],transitions=[];
  const now=()=>{clockReads.push({stage,value:throwClock?'throws':Number.isFinite(clock)?clock:String(clock)});if(throwClock)throw Error('clock unavailable');return clock;};
  const options=s.kind==='legacy'?undefined:{validUntilMs:s.kind==='deadline-nan'?NaN:s.kind==='deadline-fraction'?200.5:200,nowMs:now};
  let expectedDeadline=options?.validUntilMs,expectedClock=options?.nowMs;
  const st=storage(async op=>{
   stage=op;
   if(op==='prepare'){
    if(s.kind.startsWith('prepare-expired'))clock=201;
    transitions.push({op,clock:Number.isFinite(clock)?clock:String(clock)});
    if(s.kind==='prepare-expired-ack-loss')throw Error('lost committed prepare acknowledgement');
    return;
   }
   const end={fresh:150,boundary:200,'clock-regressed':99,'clock-nan':NaN,'clock-infinite':Infinity,'clock-invalid-entry':NaN,'prepare-expired-restore':100}[s.kind];
   clock=end===undefined?201:end;
   if(s.kind==='clock-throws')throwClock=true;
   if(s.kind==='deadline-expanded'){options.validUntilMs=1000;expectedDeadline=1000;}
   if(s.kind==='clock-replaced'){options.nowMs=()=>0;expectedClock=options.nowMs;}
   transitions.push({op,clock:Number.isFinite(clock)?clock:String(clock)});
   if(unavailable)throw Error('store unavailable before take/claim');
  });
  const permit=await h.createExecutionPermitWithStore(call,evaluation,clean.approvalId,st.store,{issuanceId:'lease-grant'});
  const entry=clone({permit,current});
  const finish=(p,c,store,opts)=>s.api==='simple'?h.finalizeExecutionPermitWithStore(p,c,store,opts):h.finalizeExecutionPermitWithReconciliation(p,c,'op_lease',store,opts);
  const result=await finish(permit,current,st.store,options),after=st.state();
  const ownership=same(entry,{permit,current})&&!Object.isFrozen(current)&&!Object.isFrozen(permit)&&(!options||(!Object.isFrozen(options)&&Object.is(options.validUntilMs,expectedDeadline)&&options.nowMs===expectedClock));
  unavailable=false;let recovery=null;
  if(s.kind==='store-unavailable')recovery=await finish(permit,current,st.store,options);
  const replay=await finish(permit,current,st.store,options),afterReplay=st.state();
  const control=storage(),controlPermit=await h.createExecutionPermitWithStore(call,evaluation,clean.approvalId,control.store,{issuanceId:'paired-control'});
  const controlResult=await finish(controlPermit,clone(clean),control.store,undefined),controlReplay=await finish(controlPermit,clone(clean),control.store,undefined);
  return {call,evaluation,approval:{requested:{exitCode:requested.exitCode,approval:requested.approval},consumed:{exitCode:consumed.exitCode,approval:consumed.approval}},entry,result,after,replay,afterReplay,recovery,ownership,clockReads,transitions,operations:st.operations,control:{result:controlResult,replay:controlReplay,after:control.state()},fixture:await fixtureCheck()};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
const rows=[];
for(const s of scenarios){try{rows.push({id:s.id,status:'returned',response:await run(s)});}catch(error){rows.push({id:s.id,status:'infrastructure-error',response:{error:String(error)}});}}
console.log(JSON.stringify(rows));
