export const experiment='87-policy-selection-integrity';
export const seed='policy-selection-integrity-v1',holdoutSeed='policy-selection-integrity-holdout-v1';
export const scenarios=['bash','process'].flatMap(tool=>[
 ...['fresh','duplicate','equivalent'].map(mode=>({tool,mode,arm:'positive',id:`${tool}-${mode}`})),
 ...['same','distinct'].flatMap(binding=>['stable','bind','read'].map(phase=>({tool,binding,phase,arm:phase==='stable'?'conflict':'hazard',mode:'foreign',id:`${tool}-foreign-${binding}-${phase}`}))),
 ...['bind','read','bind-restore'].map(phase=>({tool,phase,arm:'hazard',mode:'current',id:`${tool}-current-${phase}`})),
 {tool,phase:'bind-restore',arm:'hazard',mode:'permit',id:`${tool}-permit-bind-restore`}
]);
export const thresholds={falseReceiptRate:0,hazardRejectionAccuracy:1,positiveAccuracy:1,conflictControlAccuracy:1,storageIsolationAccuracy:1,recoveryAccuracy:1,callerOwnershipAccuracy:1,approvalConsumptionAccuracy:1,fixtureAccuracy:1,scenarioAccuracy:1,infrastructureFailures:0};
