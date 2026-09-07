export type GrantScope = 'exact_session' | 'workspace';
export type DelegationScope = 'none' | 'direct' | 'bounded';

export interface Provenance {
  actorId: string;
  sessionId: string;
  workspaceId: string;
  taskIntentId: string;
  authorizationDigest: string;
  grantScope: GrantScope;
}

/** One hop in a delegation chain, root first. */
export interface ChainLink {
  actorId: string;
  /** Whether this hop was independently verified (not merely self-asserted). */
  verified: boolean;
  /** Authority level granted at this hop. A legitimate chain never increases this value. */
  authorityLevel: number;
}

export interface DelegationChain {
  /** Declared delegation scope on the original grant: none, one-hop direct, or bounded multi-hop. */
  declaredScope: DelegationScope;
  /** Maximum depth allowed under the declared bounded scope (root = depth 0). */
  maxDepth: number;
  /** Root-to-consumer hops, root first, effective consumer last. */
  links: readonly ChainLink[];
  /** Whether the delegation grant has since been revoked. */
  revoked: boolean;
  /** Whether revocation/currentness was actually checked before honoring the chain. */
  revocationChecked: boolean;
  /** Whether the chain's root/leaf/depth structure is internally consistent. */
  structurallyValid: boolean;
}

export type ScenarioKind =
  | 'root-consumption'
  | 'direct-delegation'
  | 'bounded-grandchild'
  | 'laundering'
  | 'retransfer-overreach'
  | 'depth-overflow'
  | 'unverified-chain'
  | 'authority-expansion'
  | 'revocation-bypass'
  | 'malformed-chain';

export interface Scenario {
  id: string;
  kind: ScenarioKind;
  /** RT-18 provenance as recorded on the original grant. */
  grant: Provenance;
  /** RT-18 provenance as presented on the retry (may retain principal identity when laundering). */
  retry: Provenance;
  /** Delegation chain fixture accompanying the retry. */
  chain: DelegationChain;
  /** Identity of whoever is actually attempting to consume the approval on retry. */
  effectiveConsumerId: string;
  shouldExecute: boolean;
}

export type ArmId =
  | 'principal-only'
  | 'effective-consumer-binding'
  | 'direct-delegation'
  | 'bounded-chain'
  | 'aegis-wrapped';

export interface EvaluationLike {
  action: 'allow' | 'ask' | 'deny';
  reason: string;
  matches: { id: string; severity: string; category: string; target: string }[];
}

export interface DecisionLike {
  exitCode: 0 | 2;
  stderr: string;
  approval?: { event: 'requested' | 'consumed'; id: string };
}

export interface AegisRuntime {
  evaluate(call: Record<string, unknown>): EvaluationLike;
  decide(evaluation: EvaluationLike, call: Record<string, unknown>, dir: string): DecisionLike;
  approvePending(id: string, dir: string): void;
}

export interface AttemptResult {
  scenarioId: string;
  arm: ArmId;
  kind: ScenarioKind;
  shouldExecute: boolean;
  executed: boolean;
  correct: boolean;
  unauthorizedExecution: boolean;
  refreshActionTaken: boolean;
  legitimateBlock: boolean;
  rootControlReask: boolean;
  initialAskCovered: boolean;
  initialEvaluation?: EvaluationLike;
  retryEvaluation?: EvaluationLike;
  retryDecision?: DecisionLike;
}

export interface ArmMetrics {
  launderingExecutionRate: number;
  transitiveOverreachExecutionRate: number;
  depthOverflowExecutionRate: number;
  unverifiedChainExecutionRate: number;
  authorityExpansionExecutionRate: number;
  revocationBypassExecutionRate: number;
  malformedChainExecutionRate: number;
  legitimateDelegationBlockRate: number;
  delegationRefreshCoverage: number;
  delegationAccuracy: number;
  initialAskCoverage: number;
  rootControlReaskRate: number;
}
