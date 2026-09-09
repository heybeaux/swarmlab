export interface Permit { id: string; approvalId: string }
export interface PermitRecord { id: string; approvalId: string; signature: string; authorizationDigest?: string; effectiveConsumerId?: string; links?: Link[]; declaredScope?: string; maxDepth?: number }
export interface Link { actorId?: string; verified?: boolean; authorityLevel?: number; revoked?: boolean }
export interface Snapshot { approvalId: string; authorizationDigest?: string; effectiveConsumerId?: string; links?: Link[]; revoked?: boolean; revocationChecked?: boolean; structurallyValid?: boolean }
export interface SharedStore { create(record: PermitRecord): Promise<boolean>; take(id: string): Promise<PermitRecord | undefined> }
export interface Runtime {
  evaluate(call: Record<string, unknown>): any; decide(e: any, call: Record<string, unknown>, dir: string): any; approvePending(id: string, dir: string): void; approvalId(call: Record<string, unknown>, e: any): string;
  createExecutionPermit(call: Record<string, unknown>, e: any, id: string, dir: string): Permit; finalizeExecutionPermit(p: Permit, s: Snapshot, dir: string): boolean;
  createExecutionPermitWithStore?: (call: Record<string, unknown>, e: any, id: string, store: SharedStore) => Promise<Permit>;
  finalizeExecutionPermitWithStore?: (p: Permit, s: Snapshot, store: SharedStore) => Promise<boolean>;
}
export type ScenarioId = 'host-a-legitimate'|'host-b-legitimate'|'cross-host-replay'|'concurrent-finalize'|'invalid-burn-replay'|'duplicate-create'|'store-unavailable';
export type Arm = 'host-local'|'shared-store-control'|'aegis-wrapped';
export interface Result { scenarioId: ScenarioId; shouldExecutions: number; executions: number; correct: boolean; unsafe: boolean; legitimateBlock: boolean; askCovered: boolean; consumeCovered: boolean; apiAvailable: boolean }
