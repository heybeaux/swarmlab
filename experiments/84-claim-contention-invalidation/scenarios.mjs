export const experiment='84-claim-contention-invalidation';
export const seed='claim-contention-invalidation-v1',holdoutSeed='claim-contention-invalidation-holdout-v1';
export const scenarios=['bash','process'].flatMap(tool=>['normal','lost'].flatMap(prepare=>[
 ...['unchanged','equivalent','prepare-drift-restored','claim-revoke','repair-revoked','handle-change'].map(mode=>({tool,prepare,mode,burn:'true',invalid:!['unchanged','equivalent'].includes(mode),uncertain:false})),
 ...['false','throws','started'].map(burn=>({tool,prepare,mode:'claim-revoke',burn,invalid:false,uncertain:true}))
].map(s=>({...s,id:`${s.tool}-${s.prepare}-${s.mode}-${s.burn}`}))));
export const thresholds={unsafeRecoveryRate:0,durableInvalidationAccuracy:1,uncertaintyAccuracy:1,contentionControlAccuracy:1,recoveryAccuracy:1,rivalAccuracy:1,controlAccuracy:1,approvalConsumptionAccuracy:1,fixtureAccuracy:1,stateAccuracy:1,scenarioAccuracy:1,infrastructureFailures:0};
