export const experiment='93-large-literal-scan',seed='large-literal-scan-v1',holdoutSeed='large-literal-scan-holdout-v1';
export const thresholds={stressAccuracy:1,pairedControlAccuracy:1,controlAccuracy:1,scenarioAccuracy:1,runtimeFailureRate:0,infrastructureFailures:0};
const huge=134217728;
const stress=[...['command','path','argv','content','fragment'].map(target=>({id:`large-${target}`,target})),{id:'large-all-allow',target:'command',allAllow:true},{id:'large-independent-deny',target:'path',critical:true}];
const expected=s=>({action:s.critical||s.prediction||s.hit?'deny':'allow',hits:s.critical?['critical']:s.hit?['target.0']:[],mayAdmit:s.length===huge&&!s.disabled&&!s.wrongTool&&!s.empty});
export const scenarios=[...stress.map(s=>({...s,kind:'stress',length:huge})),...stress.map(s=>({...s,id:`paired-${s.id}`,kind:'paired',length:4096})),...[
 {id:'huge-disabled',target:'command',length:huge,disabled:true},
 {id:'huge-wrong-tool',target:'command',length:huge,wrongTool:true},
 {id:'huge-empty',target:'command',length:huge,empty:true},
 {id:'ordinary-hit',target:'command',length:256,hit:true,simple:true},
 {id:'ordinary-miss',target:'command',length:4096},
 {id:'fragments-separate',target:'fragment',length:1,split:true},
 {id:'huge-predictor-deny',target:'path',length:huge,prediction:true},
 {id:'tail-hit',target:'command',length:4096,hit:true},
].map(s=>({...s,kind:'control'}))].map(s=>({...s,expected:expected(s)}));
export function fixture(s){
 let value='q'.repeat(s.length);if(s.hit)value=value.slice(0,-257)+'q'.repeat(255)+'Z0';
 // Force flattening before ready: input allocation is the host's responsibility.
 value.charCodeAt(value.length-1);
 const call={tool:'Bash',command:s.critical?'DANGER':'safe',...(s.target==='command'?{command:value}:s.target==='path'?{paths:[value]}:s.target==='argv'?{argv:[value]}:s.target==='content'?{content:value}:{contentFragments:s.split?['q','Z']:[value]})};
 const rules=s.empty?[]:Array.from({length:s.simple||s.split?1:64},(_,i)=>({id:`target.${i}`,category:'bash',severity:'critical',description:'literal marker',appliesTo:[s.wrongTool?'Other':'*'],enabled:!s.disabled,match:{kind:'substring',target:s.target==='fragment'?'content':s.target,pattern:s.split?'qZ':'q'.repeat(255)+'Z'+i}}));
 if(s.critical)rules.push({id:'critical',category:'bash',severity:'critical',description:'independent deny',appliesTo:['*'],match:{kind:'substring',target:'command',pattern:'DANGER'}});
 const opts={preprocess:false,...(s.allAllow?{severityTable:{critical:'allow',high:'allow',medium:'allow',low:'allow'}}:{}),...(s.prediction?{prediction:{pFailure:.99,confidence:1,source:'awm'}}:{})};
 return {call,rules,opts,value};
}
