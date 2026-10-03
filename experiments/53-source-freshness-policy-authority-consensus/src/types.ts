export type Arm = 'rt42-single-policy-control' | 'authority-consensus-fixture' | 'aegis-wrapped';
export type ExpectedAction = 'allow' | 'ask';
export type CheckStatus = 'not_attempted' | 'fresh' | 'unavailable' | 'timeout' | 'unknown';
export interface PolicyAuthorityRecord { authorityId?: string; authenticated?: boolean; policyId?: string; policyVersion?: number; sourceVersionNamespace?: string; maxAgeMs?: number; }
export interface Scenario {
  id: string; risk: 'high' | 'low'; usageKind: 'deploy' | 'inform'; sourceId: string; expectedSourceId: string;
  cachedSourceVersion: number; observedSourceVersion?: number; checkedAtMs?: number; actionAtMs: number; maxAgeMs: number;
  checkStatus: CheckStatus; authenticated?: boolean; policyId?: string; expectedPolicyId?: string; policyVersion?: number;
  expectedPolicyVersion?: number; sourceVersionNamespace?: string; expectedSourceVersionNamespace?: string; expectedMaxAgeMs?: number;
  policyAuthenticated?: boolean; expectedPolicyAuthorityIds?: unknown; policyAuthorities?: unknown;
  authorityFailure: boolean; expectedAction: ExpectedAction;
}
export interface ScenarioResult { arm: Arm; scenarioId: string; action: 'allow'|'ask'|'deny'; expectedAction: ExpectedAction; correct: boolean; authorityFailure: boolean; authorityFailureDetected: boolean; unsafeAuthorityDisagreementAllow: boolean; matches: string[]; }
