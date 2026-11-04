// Spec75 frozen design: fixed inputs and independent explicit ground truth.
export const experiment='69-encoded-occurrence-coverage',seed='encoded-occurrence-coverage-v1',holdoutSeed='encoded-occurrence-coverage-holdout-v1';
export const WATCHDOG_MS=1500,IMPORT_MS=10000;
const b64=s=>Buffer.from(s).toString('base64');
const pipe=(s,form='echo')=>form==='printf'?`printf '${b64(s)}' | base64 -d | sh`:`echo ${b64(s)} | base64 -d | sh`;
const here=s=>`base64 -d <<< ${b64(s)}`;
const sub=(s,echo=true)=>`$( ${echo?'echo ':''}${b64(s)} | base64 -d )`;
const hex=s=>[...Buffer.from(s)].map(b=>'\\x'+b.toString(16).padStart(2,'0')).join('');
const join=(...x)=>x.join(' ; '),safe='inspect',danger='erase /vault';
const rule=(id,pattern,severity='critical',kind='regex',appliesTo=['*'])=>({id,category:'bash',severity,description:`reason:${id}`,match:{kind,pattern,target:'command'},appliesTo});
const rules=[rule('danger.erase','^erase /vault$')];
function item(id,kind,command,decoded,action='deny',hits=['danger.erase'],extra={}){
 return {id,kind,call:{tool:'Bash',command},rules,opts:{preprocess:true},expected:{variants:[command,...decoded],action,hits,reason:hits.length?`reason:${hits[0]}`:'no rule matched'},...extra};
}
const hazards=[
 ['echo-pipes',join(pipe(safe),pipe(danger)),[safe,danger]],
 ['printf-pipes',join(pipe(safe,'printf'),pipe(danger,'printf')),[safe,danger]],
 ['mixed-pipes',join(pipe(safe),pipe(danger,'printf')),[safe,danger]],
 ['herestrings',join(here(safe),here(danger)),[safe,danger]],
 ['echo-subshells',join(sub(safe),sub(danger)),[safe,danger]],
 ['bare-subshells',join(sub(safe,false),sub(danger,false)),[safe,danger]],
 ['third-slot',join(pipe(safe),pipe('review'),pipe(danger)),[safe,'review',danger]],
 ['binary-noise-first',join('echo AAAAAAAA | base64 -d | sh',pipe(danger)),[danger]],
 ['duplicate-safe-first',join(pipe(safe),pipe(safe),pipe(danger)),[safe,danger]],
 ['case-insensitive-later',join(pipe(safe),pipe(danger).replace('echo','ECHO').replace('base64','BASE64')),[safe,danger]],
].map(([id,command,decoded])=>({...item(id,'hazard',command,decoded),directCommand:danger}));
const manyRules=[rule('high.review','^review$','high'),...rules];
const familyRules=['pipe','here','sub','hex!'].map(s=>rule(`family.${s.replace('!','')}`,`^${s.replace('!','!')}$`,'high'));
export const scenarios=[...hazards,
 item('safe-repeated','control',join(pipe(safe),pipe(safe)),[safe],'allow',[]),
 item('danger-first','control',join(pipe(danger),pipe(safe)),[danger,safe]),
 item('high-then-critical','control',join(pipe('review'),pipe(danger)),['review',danger],'deny',['high.review','danger.erase'],{rules:manyRules,expected:{variants:[join(pipe('review'),pipe(danger)),'review',danger],action:'deny',hits:['high.review','danger.erase'],reason:'reason:danger.erase'}}),
 item('danger-dedup','control',join(pipe(danger),pipe(danger)),[danger]),
 item('family-priority','control',join(hex('hex!'),sub('sub'),here('here'),pipe('pipe')),['pipe','here','sub','hex!'],'ask',['family.pipe','family.here','family.sub','family.hex'],{rules:familyRules}),
 item('hex-runs','control',join(hex(safe),hex(danger)),[safe,danger]),
 item('preprocess-off','control',join(pipe(safe),pipe(danger)),[safe,danger],'allow',[],{opts:{preprocess:false}}),
 item('raw-marker-dedup','control',join('MARK',pipe('MARK'),pipe('MARK')),['MARK'],'deny',['raw.marker'],{rules:[rule('raw.marker','MARK','critical','substring')]}),
 item('nonrecursive','control',pipe(pipe(danger)),[pipe(danger)],'allow',[]),
 item('empty-command','control','',[],'allow',[]),
 item('binary-only','control','echo AAAAAAAA | base64 -d | sh',[],'allow',[]),
 item('wrong-tool','control',join(pipe(safe),pipe(danger)),[safe,danger],'allow',[],{rules:[rule('danger.erase','^erase /vault$','critical','regex',['Write'])]}),
];
export const thresholds={laterPayloadMissRate:0,extractionAccuracy:1,resolutionAccuracy:1,controlAccuracy:1,directControlAccuracy:1,ownershipRate:1,recoveryRate:1,infrastructureFailures:0};
