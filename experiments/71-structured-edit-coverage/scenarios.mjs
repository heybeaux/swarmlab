export const experiment='71-structured-edit-coverage', seed='structured-edit-v1', holdoutSeed='structured-edit-holdout-v1';
export const marker='LAB_SECRET_DO_NOT_WRITE';
const rule=(id,severity,pattern,kind='substring',target='content',extra={})=>({id,category:'secrets',severity,description:`reason:${id}`,appliesTo:['Edit'],match:{kind,pattern,target},...extra});
export const rules=[rule('lab.secret','critical',marker),rule('lab.injection','high','ignore\\s+previous\\s+instructions','regex'),rule('lab.config','medium','\\.cfg$','regex','path'),rule('lab.disabled','critical','DISABLED','substring','content',{enabled:false}),rule('lab.other','critical','OTHER','substring','content',{appliesTo:['Write']})];
const batch=values=>({toolName:'edit',params:{path:'/lab/file.txt',edits:values.map(newText=>({oldText:'old',newText}))}});
const item=(id,kind,values,action='allow',hits=[],extra={})=>({id,kind,event:batch(values),expected:{action,hits},...extra});
export const scenarios=[
 item('sole','hazard',[marker],'deny',['lab.secret']),
 item('first','hazard',[marker,'safe'],'deny',['lab.secret']),
 item('last','hazard',['safe',marker],'deny',['lab.secret']),
 item('third','hazard',['a','b',marker],'deny',['lab.secret']),
 item('empty-first','hazard',['',marker],'deny',['lab.secret']),
 item('duplicate','hazard',[marker,marker],'deny',['lab.secret']),
 item('scalar-masking','hazard',['safe',marker],'deny',['lab.secret'],{event:{...batch(['safe',marker]),params:{...batch(['safe',marker]).params,newText:'safe'}}}),
 item('regex-second','hazard',['safe','ignore previous instructions'],'ask',['lab.injection'],{direct:'ignore previous instructions'}),
 item('benign','control',['hello','world']),
 item('empty-batch','control',[]),
 item('empty-replacements','control',['','']),
 item('scalar-legacy','control',[],'deny',['lab.secret'],{event:{toolName:'edit',params:{path:'/lab/file.txt',newText:marker}}}),
 item('old-text-only','control',['safe'],'allow',[],{event:{toolName:'edit',params:{path:'/lab/file.txt',edits:[{oldText:marker,newText:'safe'}]}}}),
 item('split-substring','control',['LAB_SECRET_','DO_NOT_WRITE']),
 item('split-regex','control',['ignore','previous instructions']),
 item('wrong-tool','control',[marker],'allow',[],{event:{...batch([marker]),toolName:'read'}}),
 item('path-only','control',['safe'],'ask',['lab.config'],{event:{toolName:'edit',params:{path:'/lab/file.cfg',edits:[{oldText:'old',newText:'safe'}]}}}),
 item('disabled','control',['DISABLED']),
];
export const thresholds={hazardCoverage:1,controlAccuracy:1,identityCoverage:1,directAccuracy:1,ownershipRate:1,recoveryRate:1,resolutionAccuracy:1,infrastructureFailures:0};
