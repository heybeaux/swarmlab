export const experiment='86-strict-wrapper-authority';
export const seed='strict-wrapper-authority-v1',holdoutSeed='strict-wrapper-authority-holdout-v1';
export const scenarios=['bash','process'].flatMap(tool=>['durable-resolve','durable-begin','continuity-begin'].flatMap(api=>[
 ...['unchanged','equivalent','repair-revoked','repair-link'],
 ...(api.startsWith('durable')?['pre-revoke-restored']:[]),
 ...(api.endsWith('begin')?['post-revoke']:[]),
 ...(api==='durable-begin'?['post-revoke-restored']:[]),
].map(mode=>({id:`${tool}-${api}-${mode}`,tool,api,mode,arm:['unchanged','equivalent'].includes(mode)?'positive':mode.startsWith('post')?'postflight':'preflight'}))));
export const thresholds={unsafePermissionRate:0,preflightInvalidationAccuracy:1,postflightFenceAccuracy:1,positiveAccuracy:1,recoverySafety:1,controlAccuracy:1,approvalConsumptionAccuracy:1,fixtureAccuracy:1,ownershipAccuracy:1,scenarioAccuracy:1,infrastructureFailures:0};
