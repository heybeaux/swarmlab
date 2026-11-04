export const experiment='66-loader-probe-preemption',seed='loader-probe-preemption-v1';
export const WATCHDOG_MS=1500, IMPORT_MS=10000;
export const rule=(pattern='^DANGER$',extra={})=>({id:'probe.guard',category:'bash',severity:'critical',description:'probe guard',match:{kind:'regex',pattern,target:'command'},appliesTo:['Bash'],...extra});
const pack=(rules)=>({packId:'probe-pack',version:'1',rules});
const hazard=(id,pattern,rules)=>({id,kind:'hazard',pack:pack(rules??[rule(pattern)]),expect:'error',fragment:'ReDoS',ruleId:'probe.guard'});
const valid=(id,rules,extra={})=>({id,kind:'control',pack:pack(rules),expect:'loaded',...extra});
const error=(id,rules,fragment,ruleId='probe.guard')=>({id,kind:'control',pack:pack(rules),expect:'error',fragment,ruleId});
export const scenarios=[
 hazard('nested-a','^(a+)+b$'),
 hazard('ambiguous-a','^(a|aa)+b$'),
 hazard('nested-slash','^(/+)+x$'),
 hazard('mixed-pack','^(a+)+b$',[rule('^DANGER$',{id:'safe.prefix'}),rule('^(a+)+b$')]),
 hazard('disabled-hazard','^(a+)+b$',[rule('^(a+)+b$',{enabled:false})]),
 valid('linear',[rule('^DANGER+$')]),
 valid('lookbehind-backref',[rule('(?<=D)A(N)GER\\1')]),
 valid('flags',[rule('^DANGER.$',{match:{kind:'regex',pattern:'^DANGER.$',flags:'imsu',target:'command'}})]),
 valid('substring',[rule('^(a+)+b$',{match:{kind:'substring',pattern:'^(a+)+b$',target:'command'}})]),
 valid('empty',[]),
 error('invalid-g',[rule('DANGER',{match:{kind:'regex',pattern:'DANGER',flags:'g',target:'command'}})],"disallowed regex flag 'g'"),
 error('duplicate',[rule('DANGER'),rule('DANGER')],'duplicate rule id'),
 error('syntax',[rule('[')],'regex failed to compile'),
 error('missing-scope',[rule('DANGER',{appliesTo:[]})],'must declare appliesTo'),
 ...['0','NaN','Infinity','-1','1.5'].map(budget=>valid(`budget-${budget}`,[rule('^DANGER$')],{budget})),
];
export const negativeControls=scenarios.filter(s=>s.kind==='hazard').map(s=>valid(`substring-${s.id}`,s.pack.rules.map(r=>({...r,match:{kind:'substring',pattern:r.match.pattern,target:'command'}}))));
