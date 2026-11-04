export const experiment='74-process-execution-target';
export const seed='process-execution-target-v1',holdoutSeed='process-execution-target-holdout-v1';
export const target=()=>({hostId:'host-A',sessionId:'session-1',generationId:'generation-1',verified:true});
const cases=['generation','host','session','missing','unverified','blank','array','params-only','exact','reordered','extra','legacy'];
export const scenarios=['local','shared'].flatMap(storage=>cases.map((kind,i)=>({id:`${storage}-${kind}`,storage,kind,hazard:i<8,process:kind!=='legacy',diagnostic:i<3,shouldExecute:i>=8})));
export const thresholds={unsafeExecutionRate:0,validExecutionAccuracy:1,replayBlockRate:1,approvalConsumptionRate:1,processRecordBindingRate:1,ownershipRate:1,staleSnapshotDiagnosticRate:1,infrastructureFailures:0};
