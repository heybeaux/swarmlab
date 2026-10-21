import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
import {all} from './scenarios.mjs';
const scenario=all.find(s=>s.id===process.argv[2]);
const fail=(type,e)=>{process.send({type,at:Date.now(),error:String(e?.stack??e)});setTimeout(()=>process.exit(3),50);};
let api,compiled;
try{api=await import(pathToFileURL(process.env.AEGIS_DIST).href);}catch(e){fail('import-error',e);}
if(api){try{if(!scenario)throw Error('unknown scenario');compiled=api.loadPack({packId:'exp68',version:'1',rules:structuredClone(scenario.rules)});process.send({type:'ready',at:Date.now()});}catch(e){fail('load-error',e);}}
const view=rules=>rules.map(c=>({rule:structuredClone(c.rule),regex:c.regex?{source:c.regex.source,flags:c.regex.flags}:null}));
process.on('message',m=>{
  if(m?.type!=='start')return;
  const call=structuredClone(scenario.call),opts=structuredClone(scenario.opts);
  const before={call:structuredClone(call),rules:view(compiled),opts:structuredClone(opts),length:compiled.length};
  const startedAt=Date.now(),t0=performance.now();let evaluation,error;
  try{evaluation=api.evaluate(call,compiled,opts);}catch(e){error=String(e?.stack??e);}
  const elapsedMs=performance.now()-t0,endedAt=Date.now();
  const ownership=same(call,before.call)&&same(view(compiled),before.rules)&&same(opts,before.opts)&&compiled.length===before.length&&!Object.isFrozen(call)&&!Object.isFrozen(compiled)&&!Object.isFrozen(opts)&&compiled.every(c=>!Object.isFrozen(c.rule));
  let recovered=false,recovery;
  try{const safe=api.loadPack({packId:'exp68-recovery',version:'1',rules:[{id:'recovery.danger',category:'bash',severity:'critical',description:'recovery rule',match:{kind:'regex',pattern:'\\bdanger\\b',target:'command'},appliesTo:['*']}]});
    const a=api.evaluate({tool:'Bash',command:'danger'},safe),b=api.evaluate({tool:'Bash',command:'ok'},safe);
    recovery={deny:a.action,allow:b.action};recovered=a.action==='deny'&&b.action==='allow';}catch(e){recovery={error:String(e)};}
  process.send({type:'result',at:Date.now(),response:{evaluation:evaluation===undefined?undefined:JSON.parse(JSON.stringify(evaluation)),error,elapsedMs,startedAt,endedAt,ownership,recovered,recovery}},()=>process.disconnect());
});
