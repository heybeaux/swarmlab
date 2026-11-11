export const experiment='81-resume-start-integrity';
export const seed='resume-start-integrity-v1',holdoutSeed='resume-start-integrity-holdout-v1';
export const scenarios=['bash','process'].flatMap(tool=>['resolve','begin'].flatMap(api=>{
 const kinds=['unchanged','equivalent','repair-revoked','repair-digest','repair-link','valid-revoked',...(tool==='process'?['repair-generation']:[]),...(api==='begin'?['cas-revoked','post-read-revoked']:[])];
 return kinds.map(kind=>({id:`${tool}-${api}-${kind}`,tool,api,kind,stage:kind==='cas-revoked'?'cas':kind==='post-read-revoked'?'post-read':'read',positive:['unchanged','equivalent'].includes(kind)}));
}));
export const thresholds={unsafeAuthorityRate:0,rejectionAccuracy:1,positiveAccuracy:1,controlAccuracy:1,approvalConsumptionAccuracy:1,fixtureAccuracy:1,ownershipAccuracy:1,replaySafety:1,scenarioAccuracy:1,infrastructureFailures:0};
