export const experiment='88-lifecycle-transition-entry';
export const seed='lifecycle-transition-entry-v1',holdoutSeed='lifecycle-transition-entry-holdout-v1';
export const scenarios=[];
for(const outcome of ['committed','failed']) for(const api of ['retire','compact']) {
 const add=(mode,phase,arm)=>scenarios.push({id:`${outcome}-${api}-${mode}-${phase}`,outcome,api,mode,phase,arm});
 for(const mode of ['fresh','duplicate','equivalent'])add(mode,'none','positive');
 if(api==='retire'){add('foreign-journal','none','conflict');add('foreign-journal','journal','hazard');}
 add('foreign-retained','none','conflict');
 add('foreign-retained','cas','hazard');add('foreign-retained','read','hazard');
 add('local-drift','cas-restore','hazard');
}
export const thresholds={falseAttestationRate:0,hazardRejectionAccuracy:1,positiveAccuracy:1,conflictAccuracy:1,transitionIsolationAccuracy:1,recoveryAccuracy:1,callerOwnershipAccuracy:1,approvalConsumptionAccuracy:1,fixtureAccuracy:1,scenarioAccuracy:1,infrastructureFailures:0};
