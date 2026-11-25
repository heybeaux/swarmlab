export const experiment='95-static-authority-invalidation';
export const seed='static-authority-invalidation-v1',holdoutSeed='static-authority-invalidation-holdout-v1';
export const scenarios=['bash','process'].flatMap(tool=>['throw-before','throw-after','contended'].flatMap(fault=>[
 ...['valid','revoked','unchecked','structural','digest','consumer'].map(mode=>({tool,fault,mode,burn:'true',read:'ok',invalid:mode!=='valid',uncertain:false})),
 ...['false','throws'].map(burn=>({tool,fault,mode:'revoked',burn,read:'ok',invalid:false,uncertain:true})),
 {tool,fault,mode:'revoked',burn:'true',read:'throws',invalid:false,uncertain:true},
 ...(tool==='process'?[{tool,fault,mode:'generation',burn:'true',read:'ok',invalid:true,uncertain:false}]:[])
].map(s=>({...s,id:`${s.tool}-${s.fault}-${s.mode}-${s.burn}-${s.read}`}))));
export const thresholds={unsafeRecoveryRate:0,invalidationAccuracy:1,uncertaintyAccuracy:1,validControlAccuracy:1,recoveryAccuracy:1,pairedControlAccuracy:1,rivalAccuracy:1,approvalAccuracy:1,fixtureAccuracy:1,ownershipAccuracy:1,stateAccuracy:1,scenarioAccuracy:1,infrastructureFailures:0};
