export const experiment='80-strict-issuance-journal';
export const seed='strict-issuance-journal-v1',holdoutSeed='strict-issuance-journal-holdout-v1';
const kinds=['strict-success','strict-failure','strict-recovered-handle','strict-prepare-ack-loss','strict-fresh-grant','legacy-success','signature-change','issuance-change','issuance-remove','issuance-invalid','cross-grant-record','revoked','read-signature-change','read-issuance-change'];
export const scenarios=['bash','process'].flatMap(tool=>kinds.map(kind=>({id:`${tool}-${kind}`,tool,kind,positive:kind.startsWith('strict-')||kind==='legacy-success'})));
export const thresholds={strictLifecycleAccuracy:1,negativeAccuracy:1,controlAccuracy:1,approvalConsumptionAccuracy:1,fixtureAccuracy:1,replaySafety:1,scenarioAccuracy:1,infrastructureFailures:0};
