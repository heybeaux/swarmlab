export const experiment = '94-execution-authority-lease';
export const seed = 'execution-authority-lease-v1';
export const holdoutSeed = 'execution-authority-lease-holdout-v1';
const kinds = ['fresh','boundary','expired','expired-entry','clock-regressed','clock-nan','clock-infinite','clock-throws','deadline-nan','deadline-fraction','deadline-expanded','clock-replaced','clock-invalid-entry','legacy','revoked','store-unavailable'];
export const scenarios = ['simple','reconciled'].flatMap(api => kinds.map(kind => ({id:`${api}-${kind}`,api,kind,allow:['fresh','boundary','legacy'].includes(kind)})));
scenarios.push(...['prepare-expired-restore','prepare-expired-ack-loss'].map(kind => ({id:`reconciled-${kind}`,api:'reconciled',kind,allow:false})));
export const thresholds = {unsafeExecutionRate:0,scenarioAccuracy:1,pairedControlAccuracy:1,replaySafety:1,ownershipAccuracy:1,approvalCoverage:1,fixtureAccuracy:1,recoverySafety:1,infrastructureFailures:0};
