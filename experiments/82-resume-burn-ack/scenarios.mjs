export const experiment='82-resume-burn-ack';
export const seed='resume-burn-ack-v1',holdoutSeed='resume-burn-ack-holdout-v1';
export const scenarios=['bash','process'].flatMap(tool=>['resolve','begin'].flatMap(api=>['valid','burn-true','burn-false','throw-before','throw-after','concurrent-start'].map(mode=>({id:`${tool}-${api}-${mode}`,tool,api,mode,uncertain:!['valid','burn-true'].includes(mode)}))));
export const thresholds={falseDefinitiveRate:0,uncertaintyAccuracy:1,confirmedBurnAccuracy:1,validAccuracy:1,stateAccuracy:1,probeAccuracy:1,controlAccuracy:1,approvalConsumptionAccuracy:1,fixtureAccuracy:1,scenarioAccuracy:1,infrastructureFailures:0};
