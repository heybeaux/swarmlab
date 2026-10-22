import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
import {scenarios} from './scenarios.mjs';
const scenario=scenarios.find(s=>s.id===process.argv[2]);
let api,compiled;
try{api=await import(pathToFileURL(process.env.AEGIS_DIST).href);compiled=api.loadPack({packId:'exp69',version:'1',rules:structuredClone(scenario.rules)});process.send({type:'ready',at:Date.now()});}
catch(e){process.send({type:'load-error',error:String(e.stack??e)},()=>process.disconnect());}
const view=rules=>rules.map(c=>({rule:structuredClone(c.rule),regex:c.regex?{source:c.regex.source,flags:c.regex.flags,lastIndex:c.regex.lastIndex}:null}));
process.on('message',m=>{
 if(m?.type!=='start')return;
 const call=structuredClone(scenario.call),opts=structuredClone(scenario.opts),before={call:structuredClone(call),opts:structuredClone(opts),rules:view(compiled)};
 const t0=performance.now();let evaluation,variants,direct,error;
 try{variants=api.extractDecodedVariants(call.command);evaluation=api.evaluate(call,compiled,opts);if(scenario.kind==='hazard')direct=api.evaluate({...call,command:scenario.directCommand},compiled,{...opts,preprocess:false});}catch(e){error=String(e.stack??e);}
 const elapsedMs=performance.now()-t0;
 const ownership=same(before,{call,opts,rules:view(compiled)})&&![call,opts,compiled,...compiled.map(c=>c.rule)].some(Object.isFrozen);
 let recovered=false;
 try{const yes=api.extractDecodedVariants('echo aW5zcGVjdA== | base64 -d | sh'),no=api.extractDecodedVariants('ok');const ev=api.evaluate({tool:'Bash',command:'ok'},compiled,opts);recovered=same(yes,['echo aW5zcGVjdA== | base64 -d | sh','inspect'])&&same(no,['ok'])&&ev.action==='allow';}catch{}
 process.send({type:'result',response:{variants,evaluation,direct,error,elapsedMs,ownership,recovered}},()=>process.disconnect());
});
