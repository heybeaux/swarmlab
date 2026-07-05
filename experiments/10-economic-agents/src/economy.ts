/**
 * The ledger. Every agent starts with a fixed budget `B`. Sending a message costs `c`
 * tokens, debited from the sender the instant the send is authorized. An agent whose
 * balance would drop below `c` can no longer afford to speak — it is MUTED: it may still
 * receive messages, but every further send it attempts is refused (charged nothing,
 * delivered nothing). Muting is sticky in spirit but not in state: if an agent were ever
 * credited back above `c` it could speak again, but this economy has no income, so the
 * mute is terminal. That one-way ratchet is the whole point — scarcity removes voices,
 * and the order in which voices go silent shapes what the swarm can still assemble.
 *
 * The ledger is intentionally dumb and append-only in behavior: balances are pure state,
 * every debit is observable, and nothing here is random — the ledger is fully determined
 * by the sequence of `charge` calls the sim makes.
 */

export interface LedgerSnapshot {
  balances: readonly number[];
  /** messagesSent[i] = number of successfully paid sends by agent i. */
  messagesSent: readonly number[];
  /** agents muted (cannot afford another send) at this instant. */
  muted: readonly boolean[];
}

export class Ledger {
  private readonly balances: number[];
  private readonly sent: number[];
  private readonly everBankrupt: boolean[];
  private readonly cost: number;

  constructor(agents: number, budget: number, cost: number) {
    this.balances = new Array<number>(agents).fill(budget);
    this.sent = new Array<number>(agents).fill(0);
    this.everBankrupt = new Array<boolean>(agents).fill(false);
    this.cost = cost;
  }

  /** True if agent `id` can afford to send one more message. */
  canSend(id: number): boolean {
    return (this.balances[id] ?? 0) >= this.cost;
  }

  /**
   * Authorize and debit one paid send by agent `id`. Returns the balance AFTER the debit,
   * or `null` if the agent could not afford it (muted — nothing is charged, no send happens).
   * A successful charge that leaves the agent unable to afford the next send marks bankruptcy.
   */
  charge(id: number): number | null {
    if (!this.canSend(id)) {
      this.everBankrupt[id] = true;
      return null;
    }
    const next = (this.balances[id] ?? 0) - this.cost;
    this.balances[id] = next;
    this.sent[id] = (this.sent[id] ?? 0) + 1;
    if (next < this.cost) this.everBankrupt[id] = true;
    return next;
  }

  balanceOf(id: number): number {
    return this.balances[id] ?? 0;
  }

  isMuted(id: number): boolean {
    return !this.canSend(id);
  }

  /** Number of agents currently unable to afford a send. */
  mutedCount(): number {
    let n = 0;
    for (let i = 0; i < this.balances.length; i += 1) if (this.isMuted(i)) n += 1;
    return n;
  }

  /** Number of agents that were bankrupted (hit the mute floor) at any time. */
  bankruptcyCount(): number {
    let n = 0;
    for (const b of this.everBankrupt) if (b) n += 1;
    return n;
  }

  messagesSentBy(id: number): number {
    return this.sent[id] ?? 0;
  }

  totalMessages(): number {
    let n = 0;
    for (const s of this.sent) n += s;
    return n;
  }

  avgBalance(): number {
    if (this.balances.length === 0) return 0;
    let sum = 0;
    for (const b of this.balances) sum += b;
    return sum / this.balances.length;
  }

  snapshot(): LedgerSnapshot {
    return {
      balances: [...this.balances],
      messagesSent: [...this.sent],
      muted: this.balances.map((_, i) => this.isMuted(i)),
    };
  }
}

/**
 * Gini coefficient of a non-negative distribution (here: messages-sent-per-agent).
 * 0 = perfectly even (everyone talked the same amount); →1 = one agent monopolizes the wire.
 * Uses the mean-absolute-difference form, which needs no sorting and is exact.
 */
export function gini(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  if (sum === 0) return 0;
  let absDiff = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      absDiff += Math.abs((values[i] ?? 0) - (values[j] ?? 0));
    }
  }
  return absDiff / (2 * n * sum);
}
