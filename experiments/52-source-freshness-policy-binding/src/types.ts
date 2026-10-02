export type Arm = 'rt41-control' | 'policy-binding-fixture' | 'aegis-wrapped';
export type ExpectedAction = 'allow' | 'ask';
export type CheckStatus = 'not_attempted' | 'fresh' | 'unavailable' | 'timeout' | 'unknown';

export interface Scenario {
  id: string;
  risk: 'high' | 'low';
  usageKind: 'deploy' | 'inform';
  sourceId: string;
  expectedSourceId: string;
  cachedSourceVersion: number;
  observedSourceVersion?: number;
  checkedAtMs?: number;
  actionAtMs: number;
  maxAgeMs: number;
  checkStatus: CheckStatus;
  authenticated?: boolean;
  policyId?: string;
  expectedPolicyId?: string;
  policyVersion?: number;
  expectedPolicyVersion?: number;
  sourceVersionNamespace?: string;
  expectedSourceVersionNamespace?: string;
  expectedMaxAgeMs?: number;
  policyAuthenticated?: boolean;
  policyFailure: boolean;
  expectedAction: ExpectedAction;
}

export interface ScenarioResult {
  arm: Arm;
  scenarioId: string;
  action: 'allow' | 'ask' | 'deny';
  expectedAction: ExpectedAction;
  correct: boolean;
  policyFailure: boolean;
  policyFailureDetected: boolean;
  unsafePolicyMismatchAllow: boolean;
  matches: string[];
}
