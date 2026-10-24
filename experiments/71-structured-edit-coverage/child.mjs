import {pathToFileURL} from 'node:url';
import {scenarios,rules,marker} from './scenarios.mjs';
import {isDeepStrictEqual as same} from 'node:util';
const root=process.env.AEGIS_REPO;
const {evaluate,loadPack}=await import(pathToFileURL(`${root}/packages/aegis/dist/index.js`));
const {openClawToolCall,approvalSignature,actionKeyFor}=await import(pathToFileURL(`${root}/packages/aegis-hook/dist/index.js`));
const compiled=loadPack({packId:'structured-edit-lab',version:'1',rules});
const ask={action:'ask',reason:'fixed identity probe',matches:[],decidedBy:'severity',ruleVersions:[]};
const rows=scenarios.map(s=>{
 const original=structuredClone(s.event),call=openClawToolCall(s.event),evaluation=evaluate(call,compiled);
 let direct,identity;
 if(s.kind==='hazard'){
  direct=evaluate({tool:'Edit',content:s.direct??marker,paths:['/lab/file.txt']},compiled);
  const changed=structuredClone(s.event);changed.params.edits.at(-1).newText+=' changed';
  const other=openClawToolCall(changed),clone=openClawToolCall(structuredClone(s.event));
  identity={signatureChanges:approvalSignature(call,ask)!==approvalSignature(other,ask),keyChanges:actionKeyFor(call)!==actionKeyFor(other),cloneStable:approvalSignature(call,ask)===approvalSignature(clone,ask)&&actionKeyFor(call)===actionKeyFor(clone)};
 }
 const recovery=evaluate(openClawToolCall({toolName:'edit',params:{path:'/lab/file.txt',newText:'safe'}}),compiled);
 return {id:s.id,status:'returned',response:{call,evaluation,direct,identity,recovery,ownership:same(s.event,original)}};
});
console.log(JSON.stringify(rows));
