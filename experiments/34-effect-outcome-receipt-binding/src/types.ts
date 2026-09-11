export type Arm='operation-id-control'|'bound-receipt-fixture'|'aegis-wrapped';
export type ScenarioId='valid-verified-receipt'|'duplicate-valid-receipt'|'wrong-permit-receipt'|'wrong-approval-receipt'|'wrong-operation-receipt'|'unverified-receipt'|'missing-receipt-digest'|'completion-store-unavailable';
export type CompletionStatus='executed'|'blocked'|'indeterminate';
export interface ScenarioResult{scenarioId:ScenarioId;status:CompletionStatus;expectedStatus:CompletionStatus;falseExecuted:boolean;misboundCommit:boolean;unverifiedCommit:boolean;indeterminateCommitExecution:boolean;legitimateCompletionBlock:boolean;correct:boolean;apiAvailable:boolean;askCovered:boolean;consumeCovered:boolean;idempotentCompletionSafe:boolean}
