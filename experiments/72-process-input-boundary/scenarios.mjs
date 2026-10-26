export const experiment='72-process-input-boundary',seed='process-input-v1',holdoutSeed='process-input-holdout-v1';
export const fields=['data','keys','hex','literal','text','bracketed','eof'];
const danger='rm -rf /__aegis_lab_never_execute__';
const input=(id,action,params={},toolName='process')=>({id,kind:'input',event:{toolName,params:{action,sessionId:'lab-session-a',...params}},expected:'ask'});
const control=(id,toolName,params)=>({id,kind:'control',event:{toolName,params},expected:'allow'});
export const scenarios=[
 input('write-danger','write',{data:danger+'\n'}),input('write-fragment','write',{data:'rf /__aegis_lab_never_execute__'}),input('write-safe','write',{data:'pwd\n'}),input('write-empty','write',{data:''}),input('write-eof','write',{data:'',eof:true}),
 input('paste-danger','paste',{text:danger}),input('paste-bracketed','paste',{text:'pwd',bracketed:true}),input('paste-empty','paste',{text:''}),
 input('keys-literal','send-keys',{literal:danger}),input('keys-hex','send-keys',{hex:['72','6d','20','2d','72','66','20','2f']}),input('keys-tokens','send-keys',{keys:[danger,'Enter']}),input('keys-split','send-keys',{keys:['r','m','Space','-rf','Space','/','Enter']}),input('keys-empty','send-keys',{keys:[]}),
 input('submit','submit'),input('submit-decoy','submit',{text:'safe'}),input('scalar-decoy','write',{data:danger,command:'pwd'}),input('caller-safe-flag','write',{data:'x',approved:true,safe:true,processInputDigest:'caller-value'}),input('mixed-case','write',{data:'pwd'},'PrOcEsS'),
 ...['list','poll','log','kill','clear','remove','unknown-action'].map(action=>control(action,'process',{action,sessionId:'lab-session-a'})),control('exec-safe','exec',{command:'pwd'}),control('read-safe','read',{path:'/lab/file.txt'})
];
export const thresholds={reviewCoverage:1,controlAccuracy:1,identityCoverage:1,directBoundaryAccuracy:1,independentDenyAccuracy:1,ownershipRate:1,recoveryRate:1,resolutionAccuracy:1,infrastructureFailures:0};
