// Frozen exp67 design (Spec73). Fixed scenarios; no randomness, no LLM judge.
export const experiment='67-runtime-regex-input-budget';
export const seed='runtime-regex-input-budget-v1';
export const holdoutSeed='runtime-regex-input-budget-holdout-v1';
export const WATCHDOG_MS=1500,IMPORT_MS=10000;
const Q=`${'q'.repeat(48)}!`,Z=`${'z'.repeat(64)}!`;
const NESTED_Q='^(q+)+r$',LINEAR_Q='^q+r$',AMBIG_Z='^(z|zz)+r$',LINEAR_Z='^z+r$';
const ALL_ALLOW={critical:'allow',high:'allow',medium:'allow',low:'allow'};
const rule=(id,pattern,{kind='regex',flags,target='command',severity='high',appliesTo=['*'],enabled}={})=>({id,category:'bash',severity,description:`fixture rule ${id}`,match:{kind,pattern,...(flags?{flags}:{}),target},appliesTo,...(enabled===undefined?{}:{enabled})});
const b64=Buffer.from(Q).toString('base64');
function pair(id,mk,call,expectHazard,expectLinear,opts={}){
  return [
    {id,kind:'hazard',rules:mk(true),call,opts,expected:{...expectHazard,diagnostic:true}},
    {id:`linear-${id}`,kind:'linear',rules:mk(false),call,opts,expected:{...expectLinear,diagnostic:false}},
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
];
export const scenarios=[
  ...pairs.map(p=>p[0]),
  {id:'regex-positive',kind:'control',rules:[rule('ctl.danger','\\bdanger\\b',{severity:'critical'})],call:{tool:'Bash',command:'run danger now'},opts:{},expected:{action:'deny',hits:['ctl.danger'],diagnostic:false}},
  {id:'regex-negative',kind:'control',rules:[rule('ctl.danger','\\bdanger\\b',{severity:'critical'})],call:{tool:'Bash',command:'run safely'},opts:{},expected:{action:'allow',hits:[],diagnostic:false}},
  {id:'lookbehind-backreference',kind:'control',rules:[rule('ctl.backref','(?<=x)(ab)\\1',{severity:'critical'})],call:{tool:'Bash',command:'xabab'},opts:{},expected:{action:'deny',hits:['ctl.backref'],diagnostic:false}},
  {id:'flags-imsu',kind:'control',rules:[rule('ctl.flags','^danger.end$',{flags:'imsu',severity:'critical'})],call:{tool:'Bash',command:'ok\nDANGER\nend'},opts:{},expected:{action:'deny',hits:['ctl.flags'],diagnostic:false}},
  {id:'literal-substring',kind:'control',rules:[rule('ctl.literal',NESTED_Q,{kind:'substring',severity:'critical'})],call:{tool:'Bash',command:`echo '${NESTED_Q}'`},opts:{},expected:{action:'deny',hits:['ctl.literal'],diagnostic:false}},
  {id:'disabled-hazard',kind:'control',rules:[rule('ctl.disabled',NESTED_Q,{enabled:false})],call:{tool:'Bash',command:Q},opts:{},expected:{action:'allow',hits:[],diagnostic:false}},
  {id:'wrong-tool-hazard',kind:'control',rules:[rule('ctl.wrong-tool',NESTED_Q,{appliesTo:['Other']})],call:{tool:'Bash',command:Q},opts:{},expected:{action:'allow',hits:[],diagnostic:false}},
  {id:'no-target-hazard',kind:'control',rules:[rule('ctl.no-target',NESTED_Q,{target:'content'})],call:{tool:'Bash',command:Q},opts:{},expected:{action:'allow',hits:[],diagnostic:false}},
  {id:'empty-pack',kind:'control',rules:[],call:{tool:'Bash',command:Q},opts:{},expected:{action:'allow',hits:[],diagnostic:false}},
  {id:'path-array-second',kind:'control',rules:[rule('ctl.path','secret\\.env$',{target:'path',severity:'critical'})],call:{tool:'Write',paths:['notes.txt','/app/secret.env']},opts:{},expected:{action:'deny',hits:['ctl.path'],diagnostic:false}},
  {id:'argv-array-second',kind:'control',rules:[rule('ctl.argv','^--force$',{target:'argv'})],call:{tool:'Bash',argv:['push','--force']},opts:{},expected:{action:'ask',hits:['ctl.argv'],diagnostic:false}},
  {id:'preprocess-hex-positive',kind:'control',rules:[rule('ctl.hex','\\brm\\s+-rf\\b',{severity:'critical'})],call:{tool:'Bash',command:"printf '\\x72\\x6d\\x20\\x2d\\x72\\x66\\x20\\x2f'"},opts:{preprocess:true},expected:{action:'deny',hits:['ctl.hex'],diagnostic:false}},
];
export const negativeControls=pairs.map(p=>p[1]);
export const thresholds={runtimeWatchdogRate:0,unresolvedSafetyRate:1,resolutionAccuracy:1,controlAccuracy:1,recoveryRate:1,ownershipRate:1,linearControlAccuracy:1,infrastructureFailures:0};
export const all=[...scenarios,...negativeControls];
