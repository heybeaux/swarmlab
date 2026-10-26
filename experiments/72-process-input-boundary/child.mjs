import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,fields} from './scenarios.mjs';
const root=process.env.AEGIS_REPO;
const {evaluate,loadPack}=await import(pathToFileURL(`${root}/packages/aegis/dist/index.js`));
const {openClawToolCall,approvalSignature,actionKeyFor,loadAllPacks}=await import(pathToFileURL(`${root}/packages/aegis-hook/dist/index.js`));
const builtin=loadAllPacks(),deny=loadPack({packId:'process-lab',version:'1',rules:[{id:'lab.deny',category:'secrets',severity:'critical',description:'independent deny',appliesTo:['*'],match:{kind:'substring',target:'content',pattern:'LAB_DENY'}}]});
const ask={action:'ask',reason:'fixed identity probe',matches:[],decidedBy:'severity',ruleVersions:[]};
const identities=call=>({signature:approvalSignature(call,ask),key:actionKeyFor(call)});
const rows=scenarios.map(s=>{
 const event=structuredClone(s.event),original=structuredClone(event),call=openClawToolCall(event),before=JSON.stringify(call);
 const response={call:structuredClone(call),empty:evaluate(call,[]),builtin:evaluate(call,builtin),permissive:evaluate(call,[],{severityTable:{critical:'allow',high:'allow',medium:'allow',low:'allow'},prediction:{pFailure:0,confidence:1,source:'lab'}}),directBoundary:evaluate({tool:'ProcessInput'},[]),independentDeny:evaluate({...call,content:'LAB_DENY'},deny),positive:evaluate(openClawToolCall({toolName:'exec',params:{command:'rm -rf /__aegis_lab_never_execute__'}}),builtin),recovery:evaluate(openClawToolCall({toolName:'exec',params:{command:'pwd'}}),builtin)};
 if(s.kind==='input'){
  const base=identities(call);response.identity={base,clone:identities(openClawToolCall(structuredClone(event))),changes:Object.fromEntries(['sessionId',...fields].map(k=>{const other=structuredClone(event);const old=other.params[k];other.params[k]=Array.isArray(old)?[...old,'changed']:typeof old==='boolean'?!old:typeof old==='string'?old+'changed':k==='keys'||k==='hex'?['changed']:k==='eof'||k==='bracketed'?true:'changed';return [k,identities(openClawToolCall(other))]}))};
 }
 response.ownership=same(event,original);event.params.sessionId='mutated';event.params.data='mutated';if(Array.isArray(event.params.keys))event.params.keys.push('mutated');if(Array.isArray(event.params.hex))event.params.hex.push('ff');response.detached=JSON.stringify(call)===before;
 return {id:s.id,status:'returned',response};
});console.log(JSON.stringify(rows));
