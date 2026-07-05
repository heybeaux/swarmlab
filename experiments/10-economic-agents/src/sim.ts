/**
 * Deterministic economy engine. The task is decomposable into `pieces` fragments; at the
 * start each fragment is owned by exactly one worker (fragments are dealt round-robin, so
 * with more agents than pieces some workers start empty). ONE distinguished agent — the
 * aggregator (agent 0) — must end up holding every piece for the task to count as complete.
 *
 * Collaboration is a routed flood under a meter. Each round, every agent that still holds
 * pieces the aggregator lacks tries to FORWARD one such piece to a randomly chosen peer it
 * can reach — but forwarding costs `c` tokens (the metered bus). An agent that cannot afford
 * the send is muted and stays silent that round. Pieces diffuse hop-by-hop toward the
 * aggregator; whether they arrive before the swarm goes broke is exactly the scarcity
 * question. Delivery is FIRST-LEARN-WINS: once a peer knows a piece it never pays to relearn it.
 *
 * Nothing here is random beyond the seeded `rand`, so a (config, seed) pair replays identically.
 */
import type { Rand } from './rng.js';
import { Ledger, gini } from './economy.js';
import type {
  EconMessage,
  EmitMessage,
  EmitSnapshot,
  RoundSnapshot,
  TrialConfig,
  TrialResult,
} from './types.js';

const AGGREGATOR = 0;

/** Which agent should a holder forward a piece toward? Bias routing toward the aggregator:
 *  with probability `directBias` aim straight at agent 0, else pick a random other agent.
 *  The bias models a swarm that knows where the answer must land but still wastes some
 *  sends exploring — turning up scarcity punishes the wasted sends first. */
function pickTarget(from: number, agents: number, rand: Rand): number {
  const directBias = 0.6;
  if (rand() < directBias) return AGGREGATOR === from ? nextPeer(from, agents, rand) : AGGREGATOR;
  return nextPeer(from, agents, rand);
}

function nextPeer(from: number, agents: number, rand: Rand): number {
  if (agents <= 1) return from;
  let to = Math.floor(rand() * agents);
  let guard = 0;
  while (to === from && guard < agents) {
    to = (to + 1) % agents;
    guard += 1;
  }
  return to;
}

export function runTrial(
  cfg: TrialConfig,
  rand: Rand,
  emit?: EmitMessage,
  emitSnap?: EmitSnapshot,
): TrialResult {
  const ledger = new Ledger(cfg.agents, cfg.budget, cfg.cost);

  // knows[a] = set of piece indices agent a currently holds.
  const knows: Set<number>[] = Array.from({ length: cfg.agents }, () => new Set<number>());
  for (let p = 0; p < cfg.pieces; p += 1) {
    const owner = p % cfg.agents;
    knows[owner]?.add(p);
  }

  const aggregatorHas = (): number => knows[AGGREGATOR]?.size ?? 0;
  const isComplete = (): boolean => aggregatorHas() >= cfg.pieces;

  let bankruptciesAtComplete = 0;
  let timeToComplete = cfg.maxRounds;
  let completed = false;

  for (let round = 0; round < cfg.maxRounds; round += 1) {
    if (isComplete()) break;

    // Snapshot senders at round start so relays within a round don't cascade in one tick.
    const senders: number[] = [];
    for (let a = 0; a < cfg.agents; a += 1) {
      if ((knows[a]?.size ?? 0) > 0) senders.push(a);
    }

    for (const from of senders) {
      if (!ledger.canSend(from)) continue; // muted: cannot afford to speak this round.

      // Choose a piece worth forwarding: one this agent holds that the aggregator still lacks.
      const held = knows[from];
      if (!held) continue;
      const aggKnows = knows[AGGREGATOR];
      let piece = -1;
      for (const p of held) {
        if (from === AGGREGATOR) break; // aggregator hoards; it is the sink, not a relay.
        if (!aggKnows?.has(p)) {
          piece = p;
          break;
        }
      }
      if (piece < 0) continue; // nothing useful to say; stay silent, save tokens.

      const to = pickTarget(from, cfg.agents, rand);
      const balanceAfter = ledger.charge(from);
      if (balanceAfter === null) continue; // lost the race to afford it this tick.

      const delivered = !knows[to]?.has(piece);
      if (delivered) knows[to]?.add(piece);

      emit?.({ round, from, to, piece, balanceAfter, delivered });
    }

    emitSnap?.({
      round,
      coverage: round3(aggregatorHas() / cfg.pieces),
      muted: ledger.mutedCount(),
    });

    if (isComplete()) {
      completed = true;
      timeToComplete = round;
      bankruptciesAtComplete = ledger.bankruptcyCount();
      break;
    }
  }

  if (!completed) bankruptciesAtComplete = ledger.bankruptcyCount();

  const perAgentSent = Array.from({ length: cfg.agents }, (_, i) => ledger.messagesSentBy(i));

  return {
    completed,
    timeToComplete,
    totalMessages: ledger.totalMessages(),
    bankruptcies: bankruptciesAtComplete,
    giniComms: round3(gini(perAgentSent)),
    avgBalanceRemaining: round3(ledger.avgBalance()),
    finalCoverage: round3(aggregatorHas() / cfg.pieces),
  };
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
