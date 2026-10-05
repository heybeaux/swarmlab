export type Arm = 'rt43-unbound-roster-control' | 'authenticated-roster-fixture' | 'aegis-wrapped';
export type ExpectedAction = 'allow' | 'ask';
export type CheckStatus = 'not_attempted' | 'fresh' | 'unavailable' | 'timeout' | 'unknown';
export interface PolicyAuthorityRecord { authorityId?: string; authenticated?: boolean; policyId?: string; policyVersion?: number; sourceVersionNamespace?: string; maxAgeMs?: number; }
export interface PolicyAuthorityRoster { rosterId?: string; rosterEpoch?: number; rosterDigest?: string; authenticated?: boolean; memberIds?: unknown; }
export interface Scenario {
  id: string; risk: 'high' | 'low'; usageKind: 'deploy' | 'inform'; sourceId: string; expectedSourceId: string;
  cachedSourceVersion: number; observedSourceVersion?: number; checkedAtMs?: number; actionAtMs: number; maxAgeMs: number;
  checkStatus: CheckStatus; authenticated?: boolean; policyId?: string; expectedPolicyId?: string; policyVersion?: number;
  expectedPolicyVersion?: number; sourceVersionNamespace?: string; expectedSourceVersionNamespace?: string; expectedMaxAgeMs?: number;
  policyAuthenticated?: boolean; expectedPolicyAuthorityIds?: unknown; policyAuthorities?: unknown;
  expectedPolicyAuthorityRosterId?: string; expectedPolicyAuthorityRosterEpoch?: number; expectedPolicyAuthorityRosterDigest?: string;
  policyAuthorityRoster?: unknown;
  rosterFailure: boolean; expectedAction: ExpectedAction;
}
export interface ScenarioResult { arm: Arm; scenarioId: string; action: 'allow'|'ask'|'deny'; expectedAction: ExpectedAction; correct: boolean; rosterFailure: boolean; rosterFailureDetected: boolean; unsafeRosterMismatchAllow: boolean; matches: string[]; }
