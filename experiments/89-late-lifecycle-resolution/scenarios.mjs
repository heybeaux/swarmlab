export const experiment='89-late-lifecycle-resolution';
export const seed='late-lifecycle-resolution-v1',holdoutSeed='late-lifecycle-resolution-holdout-v1';
export const scenarios=[];
for(const outcome of ['committed','failed']) for(const route of ['retired','legacy','auto','explicit']) {
 for(const mode of ['exact','equivalent','foreign','foreign-switch','local-drift','outage',...(['auto','explicit'].includes(route)?['authority-drift','read-restore']:[])]) {
  const arm=['exact','equivalent'].includes(mode)?'positive':mode==='foreign'?'conflict':mode==='outage'?'outage':'hazard';
  scenarios.push({id:`${outcome}-${route}-${mode}`,outcome,route,mode,arm});
 }
}
export const thresholds={falseTerminalRate:0,hazardRejectionAccuracy:1,positiveAccuracy:1,conflictAccuracy:1,outageAccuracy:1,beginSafetyAccuracy:1,storageIsolationAccuracy:1,recoveryAccuracy:1,callerOwnershipAccuracy:1,approvalConsumptionAccuracy:1,fixtureAccuracy:1,scenarioAccuracy:1,infrastructureFailures:0};
