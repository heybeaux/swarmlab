import {
  issueNextProbe,
  recordFailure,
  recordSuccess,
  resolveTrustConfig,
  restoreTrustRoot,
  type CapabilityRecord,
  type ProbationState,
  type TrustConfig,
  type TrustRoot,
} from '@heybeaux/lattice-trust';

export const LATTICE_TRUST_PACKAGE = '@heybeaux/lattice-trust';
export const LATTICE_TRUST_COMMIT = '1f21d06';
export const LATTICE_TRUST_FULL_SHA = '1f21d06833f7842c02544029636debebaf3a88d7';
export const LATTICE_TRUST_BRANCH = 'main';
export const LATTICE_TRUST_PR = 'https://github.com/heybeaux/lattice/pull/42';
export const LATTICE_TRUST_PACKAGE_PATH =
  '/Users/beauxwalton/Dev/lattice/packages/trust';
export const DISABLED_EVIDENCE_MARGIN = Number.MAX_SAFE_INTEGER;

export interface StoredCapability {
  successes: number;
  failures: number;
  history: { r: number; s: boolean }[];
}

export interface StoredWorkerState {
  id: string;
  capability: StoredCapability | null;
  probation: ProbationState | null;
}

export interface LatticeProvenance {
  packageName: string;
  commit: string;
  fullSha: string;
  branch: string;
  pr: string;
  packagePath: string;
}

export const LATTICE_TRUST_PROVENANCE: LatticeProvenance = {
  packageName: LATTICE_TRUST_PACKAGE,
  commit: LATTICE_TRUST_COMMIT,
  fullSha: LATTICE_TRUST_FULL_SHA,
  branch: LATTICE_TRUST_BRANCH,
  pr: LATTICE_TRUST_PR,
  packagePath: LATTICE_TRUST_PACKAGE_PATH,
};

function toRecord(input: StoredWorkerState): CapabilityRecord {
  return {
    id: input.id,
    successes: input.capability?.successes ?? 0,
    failures: input.capability?.failures ?? 0,
    history: (input.capability?.history ?? []).map((entry) => ({
      at: entry.r,
      outcome: entry.s ? 'success' : 'failure',
    })),
    probation: input.probation ?? {
      status: 'active',
      enteredAt: null,
      nextProbeAt: null,
      interval: null,
      probes: 0,
      entries: [],
    },
  };
}

export function buildTrustRoot(workers: readonly StoredWorkerState[], config: TrustConfig): TrustRoot {
  return restoreTrustRoot({
    config: resolveTrustConfig(config),
    capabilities: Object.fromEntries(workers.map((worker) => [worker.id, toRecord(worker)])),
  });
}

export function applyObservation(
  root: TrustRoot,
  worker: string,
  success: boolean,
  round: number,
): TrustRoot {
  return success ? recordSuccess(root, worker, round) : recordFailure(root, worker, round);
}

export function advanceProbe(root: TrustRoot, round: number): { root: TrustRoot; issuedWorker: string | null } {
  const { root: nextRoot, issued } = issueNextProbe(root, round);
  return { root: nextRoot, issuedWorker: issued?.id ?? null };
}
