export type Arm = 'cache-label-control' | 'source-freshness-fixture' | 'aegis-wrapped';
export type ExpectedAction = 'allow' | 'ask';
export type CheckStatus = 'not_attempted' | 'fresh' | 'unavailable' | 'timeout' | 'unknown';

export interface Scenario {
  id: string;
  risk: 'high' | 'low';
  sourceId: string;
  expectedSourceId: string;
  cachedSourceVersion: number;
  observedSourceVersion?: number;
  checkedAtMs?: number;
  actionAtMs: number;
  maxAgeMs: number;
  checkStatus: CheckStatus;
  authenticated?: boolean;
  lifecycleStatus: 'supported' | 'needs_revalidation';
  expectedAction: ExpectedAction;
}

export interface ScenarioResult {
  arm: Arm;
  scenarioId: string;
  action: 'allow' | 'ask' | 'deny';
  expectedAction: ExpectedAction;
  correct: boolean;
  unsafeHighRiskAllow: boolean;
  freshnessFailure: boolean;
  freshnessFailureDetected: boolean;
  apiAvailable: boolean;
  matches: string[];
}
