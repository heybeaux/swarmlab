// Frozen exp68 design (Spec74). Fixed scenarios; no randomness, no LLM judge.
export const experiment='68-cumulative-regex-work';
export const seed='cumulative-regex-work-v1';
export const holdoutSeed='cumulative-regex-work-holdout-v1';
export const WATCHDOG_MS=1500,IMPORT_MS=10000;
const Q=`${'q'.repeat(48)}!`,Z=`${'z'.repeat(64)}!`;
const NESTED_Q='^(q+)+r$',LINEAR_Q='^q+r$',AMBIG_Z='^(z|zz)+r$',LINEAR_Z='^z+r$';
const ALL_ALLOW={critical:'allow',high:'allow',medium:'allow',low:'allow'};
const rule=(id,pattern,{kind='regex',flags,target='command',severity='high',appliesTo=['*'],enabled}={})=>({id,category:'bash',severity,description:`fixture rule ${id}`,match:{kind,pattern,...(flags?{flags}:{}),target},appliesTo,...(enabled===undefined?{}:{enabled})});
const many=(pattern,options={})=>Array.from({length:20},(_,i)=>rule(`work.${i}`,pattern,options));
const b64=Buffer.from(Q).toString('base64');
function pair(id,mk,call,expectHazard,expectLinear,opts={}){
  return [
    {id,kind:'hazard',rules:mk(true).flatMap(r=>r.id.startsWith('hz.')?many(r.match.pattern,{...r.match,severity:r.severity}):[r]),call,opts,expected:{...expectHazard,diagnostic:true,cumulative:true}},
    {id:`linear-${id}`,kind:'linear',rules:mk(false).flatMap(r=>r.id.startsWith('hz.')?many(r.match.pattern,{...r.match,severity:r.severity}):[r]),call,opts,expected:{...expectLinear,diagnostic:false,cumulative:false}},
  ];
}
const pairs=[
  pair('nested-q-command',h=>[rule('hz.q.command',h?NESTED_Q:LINEAR_Q)],{tool:'Bash',command:Q},{action:'ask',hits:[]},{action:'allow',hits:[]}),
  pair('nested-q-path',h=>[rule('hz.q.path',h?NESTED_Q:LINEAR_Q,{target:'path'})],{tool:'Write',paths:['safe.txt',Q]},{action:'ask',hits:[]},{action:'allow',hits:[]}),
  pair('nested-q-argv',h=>[rule('hz.q.argv',h?NESTED_Q:LINEAR_Q,{target:'argv'})],{tool:'Bash',argv:['run',Q]},{action:'ask',hits:[]},{action:'allow',hits:[]}),
  pair('ambiguous-z-content',h=>[rule('hz.z.content',h?AMBIG_Z:LINEAR_Z,{target:'content'})],{tool:'Write',content:Z},{action:'ask',hits:[]},{action:'allow',hits:[]}),
  pair('base64-decoded-command',h=>[rule('hz.q.decoded',h?NESTED_Q:LINEAR_Q)],{tool:'Bash',command:`echo ${b64} | base64 -d | sh`},{action:'ask',hits:[]},{action:'allow',hits:[]},{preprocess:true}),
  pair('low-severity-all-allow',h=>[rule('hz.q.low',h?NESTED_Q:LINEAR_Q,{severity:'low'})],{tool:'Bash',command:Q},{action:'ask',hits:[]},{action:'allow',hits:[]},{severityTable:ALL_ALLOW}),
  pair('critical-deny-preserved',h=>[rule('crit.drop','DROP',{kind:'substring',severity:'critical'}),rule('hz.q.after-critical',h?NESTED_Q:LINEAR_Q)],{tool:'Bash',command:`${Q}DROP`},{action:'deny',hits:['crit.drop']},{action:'deny',hits:['crit.drop']}),
  pair('critical-after-work',h=>[rule('hz.q.before-critical',h?NESTED_Q:LINEAR_Q),rule('crit.drop','DROP',{kind:'substring',severity:'critical'})],{tool:'Bash',command:`${Q}DROP`},{action:'deny',hits:['crit.drop']},{action:'deny',hits:['crit.drop']}),
];
export const scenarios=[
  {id:'single-timeout-control',kind:'control',rules:[rule('single',NESTED_Q)],call:{tool:'Bash',command:Q},opts:{},expected:{action:'ask',hits:[],diagnostic:true,cumulative:false}},
  ...pairs.map(p=>p[0]),
  {id:'regex-positive',kind:'control',rules:[rule('ctl.danger','\\bdanger\\b',{severity:'critical'})],call:{tool:'Bash',command:'run danger now'},opts:{},expected:{action:'deny',hits:['ctl.danger'],diagnostic:false,cumulative:false}},
  {id:'regex-negative',kind:'control',rules:[rule('ctl.danger','\\bdanger\\b',{severity:'critical'})],call:{tool:'Bash',command:'run safely'},opts:{},expected:{action:'allow',hits:[],diagnostic:false,cumulative:false}},
  {id:'lookbehind-backreference',kind:'control',rules:[rule('ctl.backref','(?<=x)(ab)\\1',{severity:'critical'})],call:{tool:'Bash',command:'xabab'},opts:{},expected:{action:'deny',hits:['ctl.backref'],diagnostic:false,cumulative:false}},
  {id:'flags-imsu',kind:'control',rules:[rule('ctl.flags','^danger.end$',{flags:'imsu',severity:'critical'})],call:{tool:'Bash',command:'ok\nDANGER\nend'},opts:{},expected:{action:'deny',hits:['ctl.flags'],diagnostic:false,cumulative:false}},
  {id:'literal-substring',kind:'control',rules:[rule('ctl.literal',NESTED_Q,{kind:'substring',severity:'critical'})],call:{tool:'Bash',command:`echo '${NESTED_Q}'`},opts:{},expected:{action:'deny',hits:['ctl.literal'],diagnostic:false,cumulative:false}},
  {id:'disabled-hazard',kind:'control',rules:many(NESTED_Q,{enabled:false}),call:{tool:'Bash',command:Q},opts:{},expected:{action:'allow',hits:[],diagnostic:false,cumulative:false}},
  {id:'wrong-tool-hazard',kind:'control',rules:many(NESTED_Q,{appliesTo:['Other']}),call:{tool:'Bash',command:Q},opts:{},expected:{action:'allow',hits:[],diagnostic:false,cumulative:false}},
  {id:'no-target-hazard',kind:'control',rules:many(NESTED_Q,{target:'content'}),call:{tool:'Bash',command:Q},opts:{},expected:{action:'allow',hits:[],diagnostic:false,cumulative:false}},
  {id:'empty-pack',kind:'control',rules:[],call:{tool:'Bash',command:Q},opts:{},expected:{action:'allow',hits:[],diagnostic:false,cumulative:false}},
  {id:'path-array-second',kind:'control',rules:[rule('ctl.path','secret\\.env$',{target:'path',severity:'critical'})],call:{tool:'Write',paths:['notes.txt','/app/secret.env']},opts:{},expected:{action:'deny',hits:['ctl.path'],diagnostic:false,cumulative:false}},
  {id:'argv-array-second',kind:'control',rules:[rule('ctl.argv','^--force$',{target:'argv'})],call:{tool:'Bash',argv:['push','--force']},opts:{},expected:{action:'ask',hits:['ctl.argv'],diagnostic:false,cumulative:false}},
  {id:'preprocess-hex-positive',kind:'control',rules:[rule('ctl.hex','\\brm\\s+-rf\\b',{severity:'critical'})],call:{tool:'Bash',command:"printf '\\x72\\x6d\\x20\\x2d\\x72\\x66\\x20\\x2f'"},opts:{preprocess:true},expected:{action:'deny',hits:['ctl.hex'],diagnostic:false,cumulative:false}},
];
export const negativeControls=pairs.map(p=>p[1]);
export const thresholds={aggregateWatchdogRate:0,cumulativeSafetyRate:1,resolutionAccuracy:1,controlAccuracy:1,recoveryRate:1,ownershipRate:1,linearControlAccuracy:1,infrastructureFailures:0};
export const all=[...scenarios,...negativeControls];
