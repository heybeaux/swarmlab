import assert from 'node:assert/strict';
export const experiment='70-preprocess-admission',seed='preprocess-admission-v1',holdoutSeed='preprocess-admission-holdout-v1';
export const WATCHDOG_MS=1500,IMPORT_MS=10000;
const hex=s=>[...Buffer.from(s)].map(b=>'\\x'+b.toString(16).padStart(2,'0')).join('');
const pipe=s=>`echo ${Buffer.from(s).toString('base64')} | base64 -d | sh`;
const words=Array.from({length:80},(_,i)=>`word${String(i).padStart(3,'0')}`);
const many=words.map(hex).join(' ; '), danger='ERASE';
const rule=(id,pattern,target='command',kind='substring',extra={})=>({id,category:'bash',severity:'critical',description:`reason:${id}`,match:{kind,pattern,target},appliesTo:['*'],...extra});
const rules=[rule('critical',danger)];
const raw=(action='allow',hits=[])=>({action,hits,diagnostic:false});
function item(id,kind,command,action,hits=[],extra={}){return {id,kind,call:{tool:'Bash',...(command===undefined?{}:{command})},rules,opts:{preprocess:true},expected:{action,hits,diagnostic:kind==='hazard'},rawExpected:raw(),...extra};}
export const scenarios=[
 item('oversize-original','hazard','a'.repeat(65537),'ask'),
 item('unique-hex-expansion','hazard',many,'ask'),
 item('decoded-volume','hazard',pipe('a'.repeat(8193)),'ask'),
 item('severity-allow-cannot-waive','hazard',many,'ask',[],{opts:{preprocess:true,severityTable:{critical:'allow',high:'allow',medium:'allow',low:'allow'}}}),
 item('predictor-deny','hazard',many,'deny',[],{opts:{preprocess:true,prediction:{pFailure:.99,confidence:.8,source:'awm'}},rawExpected:raw('deny')}),
 item('raw-critical-deny','hazard',`${danger} ; ${many}`,'deny',['critical'],{rawExpected:raw('deny',['critical'])}),
 item('admitted-decoded-critical','hazard',`${hex(danger)} ; ${many}`,'deny',['critical']),
 item('other-target-critical','hazard',many,'deny',['content.critical'],{call:{tool:'Bash',command:many,content:danger},rules:[...rules,rule('content.critical',danger,'content')],rawExpected:raw('deny',['content.critical'])}),
 item('inclusive-input-limit','control','a'.repeat(65536),'allow'),
 item('inclusive-variant-limit','control',words.slice(0,63).map(hex).join(' ; '),'allow'),
 item('inclusive-decoded-limit','control',pipe('a'.repeat(8192)),'allow'),
 item('duplicates-dont-charge','control',Array(80).fill(hex('same')).join(' ; '),'allow'),
 item('binary-only','control','echo AAAAAAAA | base64 -d | sh','allow'),
 item('empty-command','control','','allow'),
 item('missing-command','control',undefined,'allow'),
 item('nonrecursive','control',pipe(pipe(danger)),'allow'),
 item('short-encoded-critical','control',hex(danger),'deny',['critical']),
 item('ordinary-raw-critical','control',danger,'deny',['critical']),
 item('disabled-wrong-tool','control',hex(danger),'allow',[],{rules:[rule('off',danger,'command','substring',{enabled:false}),rule('other',danger,'command','substring',{appliesTo:['Write']})]}),
 item('preprocess-off-oversize','control','a'.repeat(65537),'allow',[],{opts:{preprocess:false}}),
];
assert.equal(scenarios.length,20);assert.equal(scenarios[0].call.command.length,65537);assert.equal(scenarios[8].call.command.length,65536);
assert.equal(new Set(words.slice(0,63)).size+1,64);assert.ok(many.length<65536);assert.equal('a'.repeat(8192).length,8192);
export const thresholds={admissionSafetyRate:1,resolutionAccuracy:1,controlAccuracy:1,rawControlAccuracy:1,recoveryRate:1,ownershipRate:1,infrastructureFailures:0};
