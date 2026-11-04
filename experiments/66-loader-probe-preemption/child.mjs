import {isDeepStrictEqual as same} from 'node:util';
import {pathToFileURL} from 'node:url';
const runtime=await import(pathToFileURL(process.env.AEGIS_DIST).href);
process.send({type:'ready',at:Date.now()});
process.once('message',({scenario:s})=>{
 const source=structuredClone(s.pack);let response;
 try{
  const compiled=runtime.loadPack(s.pack);
  const semantics=compiled.every(c=>!c.regex||['DANGER','safe','DANGER\n','DANGER','DANGERN'].every(value=>c.regex.test(value)===new RegExp(c.rule.match.pattern,c.rule.match.flags).test(value)));
  response={outcome:'loaded',synchronous:!compiled?.then,compiled:compiled.map(c=>({rule:c.rule,...(c.regex?{regex:{source:c.regex.source,flags:c.regex.flags}}:{})})),semantics};
 }catch(error){response={outcome:'error',error:{name:error.name,message:error.message,typed:error instanceof runtime.RulePackError,packId:error.packId,ruleId:error.ruleId}};}
 response.sourceUnchanged=same(s.pack,source);
 try{const p={packId:'recovery',version:'1',rules:[{id:'safe',category:'bash',severity:'critical',description:'safe',match:{kind:'regex',pattern:'^DANGER$',target:'command'},appliesTo:['Bash']}]};const c=runtime.loadPack(p);response.recovery=c.length===1&&c[0].regex.test('DANGER')&&!c[0].regex.test('safe');}catch{response.recovery=false;}
 process.send({type:'result',at:Date.now(),response},()=>process.disconnect());
});
