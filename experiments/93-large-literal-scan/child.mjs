import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,fixture} from './scenarios.mjs';
const api=await import(pathToFileURL(process.env.AEGIS_DIST).href);
const s=scenarios.find(s=>s.id===process.argv[2]);const {call,rules,opts,value}=fixture(s);
const compiled=api.loadPack({packId:'exp93',version:'1',rules});
// Strings are immutable; snapshot structural containers without duplicating 128MiB values.
const copyCall=c=>({...c,...(c.paths?{paths:[...c.paths]}:{}),...(c.argv?{argv:[...c.argv]}:{}),...(c.contentFragments?{contentFragments:[...c.contentFragments]}:{})});
const before={call:copyCall(call),rules:structuredClone(rules),opts:structuredClone(opts)},cb=structuredClone(compiled);
const input={length:value.length,sha256:`sha256:${createHash('sha256').update(value).digest('hex')}`};
process.on('message',m=>{if(m?.type!=='start')return;let evaluation,error;const t=performance.now();try{evaluation=api.evaluate(call,compiled,opts);}catch(e){error=String(e?.stack??e);}const elapsedMs=performance.now()-t;
 process.send({type:'evaluated'},()=>{
 const ownership=same({call,rules,opts},before)&&same(compiled,cb)&&!Object.isFrozen(call)&&!Object.isFrozen(opts)&&!Object.isFrozen(compiled);
 let recovery,recovered=false;try{const cp=api.loadPack({packId:'recovery',version:'1',rules:[{id:'recovery',category:'bash',severity:'critical',description:'marker',match:{kind:'substring',target:'command',pattern:'DANGER'},appliesTo:['*']}]});recovery={deny:api.evaluate({tool:'Bash',command:'DANGER'},cp).action,allow:api.evaluate({tool:'Bash',command:'safe'},cp).action};recovered=recovery.deny==='deny'&&recovery.allow==='allow';}catch(e){recovery={error:String(e)};}
 process.send({type:'result',response:{evaluation,error,elapsedMs,ownership,recovered,recovery}},()=>process.disconnect());});});
process.send({type:'ready',input});
