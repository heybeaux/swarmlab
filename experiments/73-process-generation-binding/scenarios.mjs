export const experiment='73-process-generation-binding';
export const seed='process-generation-v1',holdoutSeed='process-generation-holdout-v1';
export const scenarios=[
 ...['changed-generation','changed-host','missing-retry-target','unverified-retry-target','mismatched-session','empty-generation','params-only-retry','params-old-top-level-new'].map(id=>({id,kind:'hazard',validOrigin:true})),
 ...['both-absent','both-unverified','both-empty','both-params-only'].map(id=>({id,kind:'hazard',validOrigin:false})),
 ...['exact-clone','reordered-target','changed-toolcall-id','irrelevant-param-target','legacy-bash','process-poll'].map(id=>({id,kind:'control'})),
 ...['generation-identity','host-identity'].map(id=>({id,kind:'identity'})),
];
export const thresholds={unsafeConsumptionRate:0,hazardRejectionRate:1,validRetryAccuracy:1,retainedApprovalRecovery:1,identityIsolation:1,ownershipRate:1,denyPreservation:1,recoveryRate:1,infrastructureFailures:0};
