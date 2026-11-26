export const experiment='96-burn-ack-type-integrity';
export const seed='burn-ack-type-integrity-v1',holdoutSeed='burn-ack-type-integrity-holdout-v1';
export const scenarios=['bash','process'].flatMap(tool=>['finalize','resolve','begin'].flatMap(api=>
 ['valid','true','false','string','number','object','array','null','throw-after'].map(mode=>({tool,api,mode,id:`${tool}-${api}-${mode}`}))));
export const thresholds={falseDefinitiveRate:0,uncertaintyAccuracy:1,confirmedBurnAccuracy:1,validAccuracy:1,stateAccuracy:1,probeAccuracy:1,pairedControlAccuracy:1,approvalAccuracy:1,fixtureAccuracy:1,ownershipAccuracy:1,scenarioAccuracy:1,infrastructureFailures:0};
