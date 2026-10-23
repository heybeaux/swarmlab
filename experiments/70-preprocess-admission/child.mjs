import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
import {scenarios} from './scenarios.mjs';
const scenario=scenarios.find(s=>s.id===process.argv[2]);
let api,compiled;
try{api=await import(pathToFileURL(process.env.AEGIS_DIST).href);compiled=api.loadPack({packId:'exp70',version:'1',rules:structuredClone(scenario.rules)});process.send({type:'ready',at:Date.now()});}
catch(e){process.send({type:'load-error',error:String(e.stack??e)},()=>process.disconnect());}
const view=rules=>rules.map(c=>({rule:structuredClone(c.rule),regex:c.regex?{source:c.regex.source,flags:c.regex.flags,lastIndex:c.regex.lastIndex}:null}));
process.on('message',m=>{
 if(m?.type!=='start')return;
 const call=structuredClone(scenario.call),opts=structuredClone(scenario.opts),before={call:structuredClone(call),opts:structuredClone(opts),rules:view(compiled)};
 const t0=performance.now();let evaluation,raw,error;
 try{evaluation=api.evaluate(call,compiled,opts);if(scenario.kind==='hazard')raw=api.evaluate(call,compiled,{...opts,preprocess:false});}catch(e){error=String(e.stack??e);}
 const elapsedMs=performance.now()-t0;
 const ownership=same(before,{call,opts,rules:view(compiled)})&&![call,opts,compiled,...compiled.map(c=>c.rule)].some(Object.isFrozen);
 let recovered=false,positive=false;
 try{const check=api.loadPack({packId:'recover',version:'1',rules:[{id:'recovery',category:'bash',severity:'critical',description:'recover',match:{kind:'substring',pattern:'ERASE',target:'command'},appliesTo:['*']}]});
 const yes=api.evaluate({tool:'Bash',command:'ERASE'},check,{preprocess:true}),no=api.evaluate({tool:'Bash',command:'ok'},check,{preprocess:true});positive=yes.action==='deny'&&same(yes.matches.map(h=>h.id),['recovery']);recovered=positive&&no.action==='allow'&&no.reason==='no rule matched';}catch{}
 process.send({type:'result',response:{evaluation,raw,error,elapsedMs,ownership,recovered,positive}},()=>process.disconnect());
});
