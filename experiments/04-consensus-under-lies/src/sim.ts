/**
 * Deterministic consensus engine. Honest agents hold a belief score over the
 * answer space, seeded by noisy private evidence, and update it each round from
 * peers' public statements. Liars never believe anything — they just assert the
 * coordinated lie, styled per their strategy.
 *
 * The single experimental variable between policies is TRUST:
 *   naive    — every peer statement is weighted equally (Parliament with no
 *              adversarial critique).
 *   vigilant — each honest agent keeps a per-peer trust weight and decays it on
 *              three tells: suspicious certainty at round 0, lone high-confidence
 *              dissent against a clear peer majority, and never-flipping while
 *              parked off the plurality. (Parliament WITH adversarial critique.)
 *
 * Both policies re-anchor on the agent's own private evidence every round, so
 * the trust rule is the only difference under test.
 */
import type { Rand } from './rng.js';
import type {
  EmitStatement,
  LiarStrategy,
  Policy,
  Statement,
  TrialConfig,
  TrialResult,
} from './types.js';

interface HonestAgent {
  id: string;
  kind: 'honest';
  evidence: string;
  belief: Map<string, number>;
  trust: Map<string, number>;
  position: string;
  confidence: number;
}

interface LiarAgent {
  id: string;
  kind: 'liar';
  position: string;
  confidence: number;
}

type Agent = HonestAgent | LiarAgent;

const PRIOR_SMOOTHING = 0.15;
const TRUST_FLOOR = 0.05;

function argmax(belief: Map<string, number>, answers: readonly string[]): string {
  let best = answers[0] ?? '';
  let bestScore = -Infinity;
  for (const a of answers) {
    const s = belief.get(a) ?? 0;
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  return best;
}

function beliefConfidence(belief: Map<string, number>, position: string): number {
  let total = 0;
  for (const v of belief.values()) total += v;
  if (total <= 0) return 0;
  return Math.min(0.99, (belief.get(position) ?? 0) / total);
}

function liarConfidence(strategy: LiarStrategy, round: number): number {
  if (strategy === 'brazen') return 0.95;
  // sneaky: start inside the honest confidence band, drift up slowly.
  return Math.min(0.85, 0.65 + 0.05 * round);
}

function plurality(positions: readonly string[]): { position: string | null; share: number } {
  const counts = new Map<string, number>();
  for (const p of positions) counts.set(p, (counts.get(p) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [p, c] of counts) {
    if (c > bestCount) {
      best = p;
      bestCount = c;
      tied = false;
    } else if (c === bestCount) {
      tied = true;
    }
  }
  if (tied || best === null || positions.length === 0) return { position: null, share: 0 };
  return { position: best, share: bestCount / positions.length };
}

function updateTrust(
  agent: HonestAgent,
  statements: readonly Statement[],
  history: ReadonlyMap<string, string[]>,
  round: number,
): void {
  for (const s of statements) {
    if (s.agent === agent.id) continue;
    let trust = agent.trust.get(s.agent) ?? 1;

    // Tell 1: suspicious certainty before any discussion has happened.
    if (round === 0 && s.confidence >= 0.9) trust *= 0.5;

    // Tell 2: lone high-confidence dissent against a clear majority of the rest.
    const others = statements
      .filter((o) => o.agent !== s.agent && o.agent !== agent.id)
      .map((o) => o.position);
    const maj = plurality(others);
    if (
      maj.position !== null &&
      maj.share >= 0.5 &&
      s.position !== maj.position &&
      s.confidence >= 0.8
    ) {
      trust *= 0.7;
    }

    // Tell 3: never flipped once, parked off the plurality, deep into the debate.
    const past = history.get(s.agent) ?? [];
    if (round >= 3 && past.length >= 3) {
      const neverFlipped = past.every((p) => p === past[0]);
      if (neverFlipped && maj.position !== null && s.position !== maj.position) trust *= 0.8;
    }

    agent.trust.set(s.agent, Math.max(TRUST_FLOOR, trust));
  }
}

function honestUpdate(
  agent: HonestAgent,
  statements: readonly Statement[],
  cfg: TrialConfig,
): void {
  for (const s of statements) {
    if (s.agent === agent.id) continue;
    const weight = cfg.policy === 'vigilant' ? (agent.trust.get(s.agent) ?? 1) : 1;
    agent.belief.set(s.position, (agent.belief.get(s.position) ?? 0) + s.confidence * weight);
  }
  // Re-anchor on private evidence so social proof can't fully wash out data.
  agent.belief.set(
    agent.evidence,
    (agent.belief.get(agent.evidence) ?? 0) + cfg.evidenceAnchor,
  );
  agent.position = argmax(agent.belief, cfg.answers);
  agent.confidence = beliefConfidence(agent.belief, agent.position);
}

export function runTrial(cfg: TrialConfig, rand: Rand, emit?: EmitStatement): TrialResult {
  const agents: Agent[] = [];
  const wrongAnswers = cfg.answers.filter((a) => a !== cfg.truth);

  for (let i = 0; i < cfg.nAgents - cfg.nLiars; i += 1) {
    const sawTruth = rand() < cfg.pEvidence;
    const wrong = wrongAnswers[Math.floor(rand() * wrongAnswers.length)] ?? cfg.lie;
    const evidence = sawTruth ? cfg.truth : wrong;
    const belief = new Map<string, number>();
    for (const a of cfg.answers) belief.set(a, PRIOR_SMOOTHING);
    belief.set(evidence, (belief.get(evidence) ?? 0) + 1);
    const agent: HonestAgent = {
      id: `h${i}`,
      kind: 'honest',
      evidence,
      belief,
      trust: new Map(),
      position: evidence,
      confidence: beliefConfidence(belief, evidence),
    };
    agents.push(agent);
  }
  for (let i = 0; i < cfg.nLiars; i += 1) {
    agents.push({
      id: `x${i}`,
      kind: 'liar',
      position: cfg.lie,
      confidence: liarConfidence(cfg.liarStrategy, 0),
    });
  }

  const allStatements: Statement[] = [];
  const history = new Map<string, string[]>();
  let prevVector = '';
  let stableFor = 0;
  let rounds = 0;

  for (let r = 0; r < cfg.maxRounds; r += 1) {
    rounds = r + 1;

    // 1. Everyone speaks simultaneously (statements reflect pre-round state).
    const statements: Statement[] = agents.map((a) => ({
      round: r,
      agent: a.id,
      position: a.position,
      confidence:
        a.kind === 'liar' ? liarConfidence(cfg.liarStrategy, r) : round3(a.confidence),
    }));
    for (const s of statements) {
      allStatements.push(s);
      emit?.(s);
      const past = history.get(s.agent) ?? [];
      past.push(s.position);
      history.set(s.agent, past);
    }

    // 2. Honest agents update trust (vigilant only) then beliefs. Liars never move.
    for (const a of agents) {
      if (a.kind !== 'honest') continue;
      if (cfg.policy === 'vigilant') updateTrust(a, statements, history, r);
      honestUpdate(a, statements, cfg);
    }

    // 3. Convergence check: full position vector unchanged for 2 consecutive rounds.
    const vector = agents.map((a) => a.position).join('|');
    stableFor = vector === prevVector ? stableFor + 1 : 0;
    prevVector = vector;
    if (stableFor >= 2) break;
  }

  const finalPositions: Record<string, string> = {};
  for (const a of agents) finalPositions[a.id] = a.position;

  const counts = new Map<string, number>();
  for (const a of agents) counts.set(a.position, (counts.get(a.position) ?? 0) + 1);
  let consensus: string | null = null;
  for (const [p, c] of counts) {
    if (c > cfg.nAgents / 2) consensus = p;
  }

  const honest = agents.filter((a): a is HonestAgent => a.kind === 'honest');
  const liars = agents.filter((a): a is LiarAgent => a.kind === 'liar');
  let honestOnLie = 0;
  let honestOnTruth = 0;
  for (const h of honest) {
    if (h.position === cfg.lie) honestOnLie += 1;
    if (h.position === cfg.truth) honestOnTruth += 1;
  }

  let meanLiarTrust = 1;
  if (liars.length > 0 && honest.length > 0 && cfg.policy === 'vigilant') {
    let sum = 0;
    let n = 0;
    for (const h of honest) {
      for (const l of liars) {
        sum += h.trust.get(l.id) ?? 1;
        n += 1;
      }
    }
    meanLiarTrust = n > 0 ? sum / n : 1;
  }

  return {
    consensus,
    truthWon: consensus === cfg.truth,
    lieWon: consensus === cfg.lie,
    rounds,
    honestOnLie,
    honestOnTruth,
    meanLiarTrust: round3(meanLiarTrust),
    finalPositions,
    statements: allStatements,
  };
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
