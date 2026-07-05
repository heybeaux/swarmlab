# 10 — Economic Agents

**Faculty tested: Lattice** (mechanism design / gate policy) **+ Sonder** (metered event bus).

Give every agent a token budget and make them **pay to talk**. A decomposable task must
be assembled at one aggregator, but every relay hop costs `c` tokens debited from the
sender. Watch what collaboration does under scarcity — who keeps talking, who goes broke,
and at what price the whole swarm starves.

Full brief: [`specs/10-economic-agents.md`](../../specs/10-economic-agents.md).

## What it models

The task is split into `pieces` fragments dealt round-robin to `agents` workers. **Agent 0
is the aggregator** — the task completes only when it holds every piece. Each round, any
agent holding a piece the aggregator still lacks tries to **forward** one such piece to a
peer, biased toward routing at the aggregator. Forwarding is metered:

- **Every send costs `c` tokens** (Sonder's meter), debited the instant the send is
  authorized. Balances live in an append-only [`Ledger`](src/economy.ts).
- **Zero balance = muted.** An agent that can't afford `c` may still *receive* but can no
  longer *send*. There is no income, so muting is a one-way ratchet — a voice, once
  silenced by poverty, stays silent.
- **First-learn-wins delivery.** A peer never pays to relearn a piece it already holds.

Balance changes ride on each `message` body (`balanceAfter`), so the entire ledger is
reconstructable from the trace — nothing is hidden in memory.

The sweep crosses **cost** `{1,2,4,8,12,16,24}` × **budget** `{10,20,40,80,160}`
(35 cells), 30 seeded trials per cell, 12 agents, 8 pieces. Trial 0 of each cell spawns
worker agents through `core` and puts every paid message + end-of-round snapshot on the
bus, so the run replays in the observatory.

## Run it

```bash
npm run build
node experiments/10-economic-agents/dist/main.js
```

Knobs (env): `ECON_TRIALS`, `ECON_SEED`, `ECON_AGENTS`, `ECON_PIECES`, `ECON_MAXROUNDS`.
Output is a JSONL trace under `runs/`; the harness re-reads it with `replay()` and asserts
event-count parity (spawn / message / score / kill).

## What I observed

The sweep was designed to find the price at which collaboration breaks. It found a sharp,
budget-independent one — and two surprises hiding behind it.

1. **Collaboration breaks at a cost/budget RATIO, not a price.** Absolute cost is a red
   herring. Completion holds at **1.00 until the ratio `c/B ≈ 0.4`**, sags to ~0.85–0.93
   right at 0.4, then falls off a cliff by **0.6–0.8**. The break-cost scales exactly with
   the wallet: `B10` breaks at `c8`, `B20` at `c12`, `B40` at `c16` — all the same
   `c/B ≈ 0.4–0.8` band (`scarcityMeanCostBudgetRatio=0.6`). `B80` and `B160` never break
   across the entire cost sweep; they simply have the runway. **The design lever is the
   ratio of message price to per-agent budget, and it is universal across scale.**

2. **Above ratio 1.0, the swarm starves with full wallets.** When a single message costs
   more than an agent's entire budget (`c12-B10`, `c24-B20`), agents send **zero** messages
   — nobody but the original piece-owners ever speaks — and coverage freezes at **0.13**
   (the 1-of-8 fraction each owner starts with) while balances sit **untouched at 100%**.
   Two cells complete <50% of the task with more money than a message costs still in the
   bank (`starvedWithMoney=2`). This is not poverty; it's a **coordination deadlock priced
   in by the gate**. A meter set above the affordability floor doesn't slow the swarm down —
   it mutes it before it says a word, and the ledger looks *healthy* the whole time.

3. **Price REDUCES communication inequality — the opposite of the hoarding hypothesis.**
   I expected scarcity to concentrate voice into a few rich cartel agents (rising Gini).
   The data says the reverse: Gini of messages-sent falls from **0.49 (cheap)** to **0.26
   (expensive)** — `giniDelta = -0.224`. The mechanism is bankruptcy: expensive channels
   bankrupt the *chattiest* agents first (they spend fastest), and once the loud voices are
   muted the surviving distribution flattens. Scarcity doesn't build an aristocracy of
   talkers; it **executes them**, and equality-at-the-bottom is what's left. Low Gini here
   is a symptom of collapse, not health.

4. **The failure signature is bankruptcies, not silence.** Right at the threshold
   (`c8-B10`, `c12-B20`, `c16-B40`) mean bankruptcies spike to **~8 of 12 agents** while
   completion craters to 0.07–0.13 and time-to-complete blows out to the round cap. The
   swarm doesn't fail quietly — it **burns down its wallets trying**, spending the last
   tokens on relays that arrive too late or route into already-broke peers. Peak bankruptcy
   is the tripwire for "priced just past the edge."

### The map (completion rate, 30 trials/cell)

```
             c=1    c=2    c=4    c=8    c=12   c=16   c=24     ratio band that breaks
  B=10      1.00   1.00   0.93   0.13   0.00   0.00   0.00      c/B ~0.4 sag, 0.8 gone
  B=20      1.00   1.00   1.00   0.93   0.13   0.07   0.00      c/B ~0.4 sag, 0.6 gone
  B=40      1.00   1.00   1.00   1.00   1.00   0.87   0.10      c/B ~0.4 sag, 0.6 gone
  B=80      1.00   1.00   1.00   1.00   1.00   1.00   1.00      never breaks (runway)
  B=160     1.00   1.00   1.00   1.00   1.00   1.00   1.00      never breaks (runway)
```

## What it implies for Lattice / Sonder

**For Sonder's metered bus:** the danger zone is not "expensive," it's `c/B ≳ 0.4`. Meter
prices should be set — and *monitored* — as a fraction of the calling agent's remaining
budget, not as an absolute token cost, because the same price is free at `B160` and fatal
at `B10`. And Sonder must watch the **full-wallet-starvation** signature: a swarm can sit at
100% balance and 13% task completion because the gate priced the first message out of reach.
Balance dashboards are blind to this; you need a *sends-attempted-vs-afforded* metric.

**For Lattice's gate policy:** scarcity is a real design force — a modest meter (`c/B` up to
~0.3) completed every task while cutting wasted balance, which is exactly the "force
prioritization, not starvation" the spec hoped for. But two gate anti-patterns fall out.
First, **never price a single call above the affordability floor** (`c ≥ B`): that's not a
throttle, it's a mute, and it produces silent deadlock with a green ledger. Second, **do not
read a falling communication-Gini as fairness** — under a metered gate, equalization is the
signature of mass bankruptcy, not of healthy load-sharing. A good gate policy needs *income
or credit* (an anti-entropy of the economy) so that an agent muted by one expensive burst
can recover and rejoin, rather than being ratcheted permanently out of the conversation the
first time it overspends.

The trace is honest: the collapse cells really do collapse, and no cell was faked green.
`runs/econ-*.jsonl` replays with full spawn/message/score/kill parity.
