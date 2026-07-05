/**
 * The Part-A root task: one config artifact, N=20 machine-verifiable
 * requirements. 12 unary (`config[key] === value`) and 8 relational
 * (`config[keyA] === config[keyB] + offset`) — 28 distinct keys total.
 * Every requirement is a harness assertion; no LLM ever judges success.
 */
import type { Requirement, ReqOutcome } from './types.js';

export const REQUIREMENTS: readonly Requirement[] = [
  { kind: 'unary', id: 'r01', key: 'http_port', value: 8080 },
  { kind: 'unary', id: 'r02', key: 'log_level', value: 3 },
  { kind: 'unary', id: 'r03', key: 'max_connections', value: 512 },
  { kind: 'unary', id: 'r04', key: 'timeout_ms', value: 30000 },
  { kind: 'unary', id: 'r05', key: 'retry_limit', value: 5 },
  { kind: 'unary', id: 'r06', key: 'cache_ttl_s', value: 600 },
  { kind: 'unary', id: 'r07', key: 'worker_threads', value: 8 },
  { kind: 'unary', id: 'r08', key: 'queue_depth', value: 1024 },
  { kind: 'unary', id: 'r09', key: 'heartbeat_s', value: 15 },
  { kind: 'unary', id: 'r10', key: 'batch_size', value: 100 },
  { kind: 'unary', id: 'r11', key: 'max_payload_kb', value: 256 },
  { kind: 'unary', id: 'r12', key: 'shutdown_grace_s', value: 30 },
  { kind: 'relational', id: 'r13', keyA: 'read_replicas', keyB: 'write_replicas', offset: 2, param: 3 },
  { kind: 'relational', id: 'r14', keyA: 'tls_cert_days', keyB: 'tls_renew_days', offset: 30, param: 60 },
  { kind: 'relational', id: 'r15', keyA: 'pool_max', keyB: 'pool_min', offset: 20, param: 10 },
  { kind: 'relational', id: 'r16', keyA: 'alert_crit_mb', keyB: 'alert_warn_mb', offset: 1024, param: 2048 },
  { kind: 'relational', id: 'r17', keyA: 'backup_retention_d', keyB: 'snapshot_interval_d', offset: 27, param: 3 },
  { kind: 'relational', id: 'r18', keyA: 'rate_burst', keyB: 'rate_limit', offset: 50, param: 100 },
  { kind: 'relational', id: 'r19', keyA: 'session_ttl_m', keyB: 'token_ttl_m', offset: 30, param: 30 },
  { kind: 'relational', id: 'r20', keyA: 'scale_max', keyB: 'scale_min', offset: 6, param: 2 },
];

export const N_REQUIREMENTS = REQUIREMENTS.length; // 20
export const N_KEY_TASKS = REQUIREMENTS.reduce(
  (n, r) => n + (r.kind === 'unary' ? 1 : 2),
  0,
); // 28

/**
 * Classify every requirement against an assembled config. `forkedDiverged`
 * marks relational requirements whose parameter copies were forked across
 * siblings at some delegation level (the precondition for a seam break).
 */
export function assess(
  config: ReadonlyMap<string, number>,
  forked: ReadonlySet<string>,
): Map<string, ReqOutcome> {
  const out = new Map<string, ReqOutcome>();
  for (const req of REQUIREMENTS) {
    if (req.kind === 'unary') {
      const v = config.get(req.key);
      if (v === undefined) out.set(req.id, 'dropped');
      else if (v === req.value) out.set(req.id, 'satisfied');
      else out.set(req.id, 'reinterpreted');
    } else {
      const a = config.get(req.keyA);
      const b = config.get(req.keyB);
      if (a === undefined || b === undefined) out.set(req.id, 'dropped');
      else if (a === b + req.offset) out.set(req.id, 'satisfied');
      // A broken relation with both keys present can only come from divergent
      // forked copies of the shared parameter (a co-located pair drifts as one).
      else out.set(req.id, forked.has(req.id) ? 'integration' : 'reinterpreted');
    }
  }
  return out;
}

/** Human/LLM-readable requirement lines, used verbatim by the live exhibition. */
export function requirementText(): string {
  const lines: string[] = [];
  for (const req of REQUIREMENTS) {
    if (req.kind === 'unary') {
      lines.push(`- "${req.key}" must be exactly ${req.value}.`);
    } else {
      lines.push(
        `- "${req.keyB}" must be ${req.param} and "${req.keyA}" must equal "${req.keyB}" plus ${req.offset} (i.e. ${req.param + req.offset}).`,
      );
    }
  }
  return lines.join('\n');
}
