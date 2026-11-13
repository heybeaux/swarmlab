export const experiment='83-claim-failure-invalidation';
export const seed='claim-failure-invalidation-v1',holdoutSeed='claim-failure-invalidation-holdout-v1';
export const scenarios=['bash','process'].flatMap(tool=>['throw-before','throw-after'].flatMap(fault=>[
 ...['unchanged','equivalent','prepare-drift-restored','claim-revoke','repair-revoked','handle-change'].map(mode=>({tool,fault,mode,burn:'true',invalid:!['unchanged','equivalent'].includes(mode)})),
 ...['false','throws'].map(burn=>({tool,fault,mode:'claim-revoke',burn,invalid:false}))
].map(s=>({...s,id:`${s.tool}-${s.fault}-${s.mode}-${s.burn}`}))));
export const thresholds={unsafeRecoveryRate:0,durableInvalidationAccuracy:1,uncertaintyAccuracy:1,recoveryAccuracy:1,controlAccuracy:1,approvalConsumptionAccuracy:1,fixtureAccuracy:1,stateAccuracy:1,scenarioAccuracy:1,infrastructureFailures:0};
