import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
import {scenarios,fixture} from './scenarios.mjs';
const api=await import(pathToFileURL(process.env.AEGIS_DIST).href);
const s=scenarios.find(s=>s.id===process.argv[2]);const {call,rules,opts}=fixture(s);
const compiled=api.loadPack({packId:'exp92',version:'1',rules});const before=structuredClone({call,rules,opts});
const view=cs=>cs.map(c=>({rule:c.rule,regex:c.regex?{source:c.regex.source,flags:c.regex.flags}:null}));const cb=structuredClone(view(compiled));
process.on('message',m=>{if(m?.type!=='start')return;let evaluation,error;const t=performance.now();try{evaluation=api.evaluate(call,compiled,opts);}catch(e){error=String(e?.stack??e);}const elapsedMs=performance.now()-t;
 const ownership=same({call,rules,opts},before)&&same(view(compiled),cb)&&!Object.isFrozen(call)&&!Object.isFrozen(opts)&&!Object.isFrozen(compiled);
 let recovery,recovered=false;try{const cp=api.loadPack({packId:'recovery',version:'1',rules:[{id:'recovery',category:'bash',severity:'critical',description:'marker',match:{kind:'regex',target:'command',pattern:'^DANGER$'},appliesTo:['*']}]});recovery={deny:api.evaluate({tool:'Bash',command:'DANGER'},cp).action,allow:api.evaluate({tool:'Bash',command:'safe'},cp).action};recovered=recovery.deny==='deny'&&recovery.allow==='allow';}catch(e){recovery={error:String(e)};}
 process.send({type:'result',response:{evaluation,error,elapsedMs,ownership,recovered,recovery}},()=>process.disconnect());});
process.send({type:'ready'});
