export const experiment='85-prepare-ownership-isolation';
export const seed='prepare-ownership-isolation-v1',holdoutSeed='prepare-ownership-isolation-holdout-v1';
export const scenarios=['bash','process'].flatMap(tool=>[
 ...['distinct','same'].flatMap(binding=>['unclaimed','claimed','started'].flatMap(occupancy=>['normal','lost'].map(ack=>({tool,binding,occupancy,ack,arm:'collision',id:`${tool}-${binding}-${occupancy}-${ack}`})))),
 ...['normal','lost','unavailable'].map(ack=>({tool,ack,arm:'control',id:`${tool}-control-${ack}`}))
]);
export const thresholds={foreignMutationRate:0,collisionDecisionAccuracy:1,ownerRecoveryAccuracy:1,challengerRecoveryAccuracy:1,sameOwnerControlAccuracy:1,approvalConsumptionAccuracy:1,fixtureAccuracy:1,scenarioAccuracy:1,infrastructureFailures:0};
