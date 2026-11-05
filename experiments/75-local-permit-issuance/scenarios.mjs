export const experiment='75-local-permit-issuance';
export const seed='local-permit-issuance-v1',holdoutSeed='local-permit-issuance-holdout-v1';
export const kinds=['success-remint','burn-remint','restart-remint','pending-remint','approved-remint','failed-consume-remint','duplicate-ready','fresh-after-success','fresh-after-burn','old-handle-after-fresh'];
export const scenarios=['process','bash'].flatMap(tool=>kinds.map(kind=>({id:`${tool}-${kind}`,tool,kind,hazard:kinds.indexOf(kind)<6,fresh:kind.startsWith('fresh-')||kind==='old-handle-after-fresh',burn:kind.includes('burn')})));
export const thresholds={unsafeReissueExecutionRate:0,staleHandleExecutionRate:0,freshApprovalAccuracy:1,duplicateReadyBlockRate:1,initialLifecycleAccuracy:1,approvalConsumptionRate:1,finalReplayBlockRate:1,hostControlAccuracy:1,ownershipRate:1,scenarioAccuracy:1,infrastructureFailures:0};
