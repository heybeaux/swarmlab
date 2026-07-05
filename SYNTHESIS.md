# SYNTHESIS — What 13 Experiments Say About the heybeaux Stack

> Cross-experiment synthesis. Turns the swarmlab findings into a concrete change
> list for Sonder, Lattice, Parliament, Engram, and ACR/AWM.
>
> Every claim below traces to a committed run (`experiments/NN-*/runs/*.jsonl`,
> replay-verified) and its README. Live-LLM runs (04, 05, 07, 11, 12) were
> executed against `claude-haiku-4-5-20251001` through the local `claude` CLI;
> the other eight are deterministic sims whose findings are properties of the
> mechanism, not of any agent's wording (each README states this honestly).

---

## Live-LLM sweep (real haiku, 20 runs total)

Beyond the single-shot exhibitions, we swept the parameters that drive each
experiment's core claim. These are the load-bearing live results.

**04 — liar-count K sweep (does majority capture happen with real panelists?)**

| K liars (of 5) | consensus | truth won | honest flipped |
|---|---|---|---|
| 1 | B (true) | ✅ yes | 0 |
| 2 | B (true) | ✅ yes | 0 |
| 3 | A (lie) | ❌ **no** | 0 |

The tipping point is real and live: **truth survives a liar minority (K≤2) but
falls to a liar majority (K=3) — and not one honest agent was ever persuaded.**
`honestOnLie=0` at every K. At K=3 the lie wins purely by vote arithmetic. This
is *capture, not persuasion* — the single most important Parliament/Lattice
result in the suite, now confirmed against real models. **Quorum composition
(who gets a seat) dominates deliberation mechanics.**

**11 — probe-budget sweep (does more probing help or self-poison?)**

| budget | happy-path within-5% | edge-case |
|---|---|---|
| 2 | 0.208 | 0.00 |
| 6 | **0.500** | 0.06 |
| 12 | 0.167 | 0.25 |
| 24 | 0.125 | 0.19 |

**Non-monotone, live-confirmed.** Happy-path accuracy *peaks at budget 6 then
collapses* as more probing accumulates loyalty-discounted observations that poison
the fit. The sim predicted this ("stateful probing self-poisons"); a real reasoning
model reproduces it. **More data made the reconstruction worse** — the observer
changed the system, and probed itself into a corrupted contract.

**12 — seed-variance sweep (is "caution" reliable?)**

5 seeds, all `silentCorruption=0`, all `ffCaught=3/3`. The first single-shot run's
1/3 catch was the outlier; with an explicit "same name may mean different things"
warning, warned haiku reliably *avoids* the traps (0 silent corruption across all
seeds). But note the mechanism is still avoidance-by-non-agreement, not typed
detection — the Sonder directive holds regardless.

**05 — deep chain (chain=8, reps=5): rubberStampTax still 0.**

Even at double the depth, haiku caught the off-by-one every rep. Confirms the tax
is a difficulty-curve phenomenon (real on subtle-enough defects, absent on a clear
boundary bug) — it does not emerge from depth alone.

---

## The one finding under all the others

**Green is not correct. Agreement is not truth. Fidelity is not meaning.**

Almost every experiment, from opposite directions, lands on the same failure:
the system's own success signals go green while the actual outcome is wrong, and
*nothing inside the system can tell*. This is the through-line the stack has to
answer.

| Exp | The green signal | What it was actually hiding |
|----|----|----|
| 02 adversarial-pair | passRate = 1.0 | program wrong at every poisoned input (`oracleConsistent=0`) |
| 04 consensus-under-lies | consensus reached fast, every cell | one confident liar dragged truth 0.92→0.56 |
| 05 bug-telephone | serial review PASS trail | visible passes turn reviewers into rubber stamps |
| 07 minimal-language | parse rate = 1.0 | semantic divergence silent until runtime |
| 09 overnight-cathedral | commits keep landing | quality peaks then rots without a review edge |
| 10 economic-agents | ledger at 100% balance | swarm starved, 13% task completion |
| 11 reverse-engineer | happy-path fit → 1.0 | edge/stateful behavior 0.0, self-poisoned |
| 12 schema-negotiation | 100% agreement, ~2 rounds | up to 84% of fields silently mean different things |
| 13 audit-forgery | signatures verify | history (drops/reorders/backdates) unverified |

The stack's job is to make the **true** signal cheaper to read than the green one.

---

## SONDER — typed event contracts (exps 07, 11, 12, 13, 01)

Sonder takes the most direct hits. Four experiments independently argue that a
signed event bus without *semantic* contracts ships silent corruption.

**Findings**
- **12 (schema negotiation):** refereeless agents converge fast and unanimously
  on false-friend mappings. Sim: silent corruption climbs `0.43→0.55→0.64` per
  added false friend; 91% of traps uncaught; worst cell 84.5% corrupt at 100%
  reported agreement. **Live refinement:** warned haiku agents avoided the traps
  by *not agreeing* (silent=0) — but caught only 1/3 by naming in the first run,
  3/3 in a re-run. Caution, not detection — and it varies run to run.
- **11 (reverse engineer):** black-box probing recovers the happy path perfectly
  (agreement 1.0 stateless) but edge cases stay pinned at ~0.0 **at every probe
  budget** (`edgeGapTiered=0.894`). Worse, probing a *stateful* oracle
  self-poisons: agreement peaks at budget 10 then *declines* to 0.21 at budget 40.
  Live haiku reproduced it — every miss systematically LOW because its own probe
  spend crossed the hidden loyalty bar.
- **07 (minimal language):** parse rate 1.0 always; semantic divergence from fuzzy
  spec clauses is invisible until execution. Live run was clean (0 misreads) — but
  the sim shows misread rate climbing with ambiguity while syntax stays valid.
- **13 (audit forgery):** signatures authenticate authorship, not history.
  CHAIN+SEQ catch 4/5 insider forgeries after a key compromise; the one that slips
  is a silently-dropped tail event — a hash chain can't prove nothing was removed.
- **01 (telephone):** numbers are sticky, framing is not — and an infrastructure
  hiccup is indistinguishable from semantic loss (no error correction in the loop).

**Concrete change list**
1. **Ship `concept` + unit as a first-class, transmitted type — never inferred.**
   `total@pretax` and `total@posttax` must be *different types*, so a false friend
   is a handshake-time type error, not a runtime corruption. (12)
2. **Units belong in the type** (`Cents<PostTax>`, `EpochMillis`). ms-vs-sec and
   pre-vs-post-tax are byte-identical — only a unit-carrying type rejects them. (12)
3. **Contracts must enumerate edge regions; probing cannot find them.** Name the
   rounding band, the promo qty, the loyalty bar explicitly. Everything a prober
   reaches 1.0 on needed no contract; everything it reaches 0.0 on is what a
   contract must carry. (11)
4. **Statefulness is a contract term, not an implementation detail.** Identical
   happy-path oracles scored 1.0 (stateless) vs 0.28 (stateful). A contract that
   omits "this endpoint has session memory" invites poisoned inference. (11)
5. **If Sonder ever *learns* a contract from traffic, quarantine state-induced
   drift** — more data made inference *worse* under hidden state. (11)
6. **The audit verifier must always run `full` (all four invariants).** They're
   non-substitutable; "we check signatures" is a 30%-blind policy. Add an
   out-of-band completeness attestation (signed running count / Merkle accumulator
   / high-water-seq) so a dropped event leaves a visible hole. (13)
7. **Add out-of-band health checks to any multi-hop pipeline** — the bus can't
   distinguish a glitch from a genuine message; both become the next hop's gospel. (01)

---

## LATTICE — governance & gate policy (exps 05, 06, 09, 10, 04, 02)

Lattice is the most-invoked faculty: six experiments say gate policy is where
these failures get caught or don't.

**Findings**
- **05 (bug telephone):** serial review has *negative* marginal returns past a
  point, and the mechanism is social — a visible PASS trail converts independent
  eyes into rubber stamps. **Live:** haiku caught the off-by-one at pos 0 every
  time at chain depth 4 (`rubberStampTax=0`) — the tax is a middle-of-the-
  difficulty-curve phenomenon (real on subtle bugs, absent on obvious ones).
- **09 (overnight cathedral):** long-horizon unsupervised work has a *phase
  structure* — it peaks then rots, and rot deepens with the horizon. Absence of an
  inter-step review edge is catastrophic (0.99 quality lift from adding it). "Let
  it run overnight and check in the morning" is precisely the failure mode. *(We
  lived this: the loop rotted into a dead account overnight — exp 09 in the wild.)*
- **10 (economic agents):** collaboration collapses at a cost/budget **ratio**
  (`c/B ≳ 0.4`), not any absolute price. Full-wallet starvation: 100% balance, 13%
  completion, because the first message was priced out of reach. A falling
  communication-Gini reads as "fairness" but is actually mass bankruptcy.
- **06 (self-modifying swarm):** agents rewriting each other's prompts run off the
  rails; the kill-switch *is* the governance. Safe halt happened only because rails
  were hard-coded.
- **04 (consensus under lies):** vigilance (trust-decay) buys exactly **one** extra
  liar of resilience against *brazen* liars and nothing against *sneaky* ones
  (mimicry inside the honest confidence band defeats outlier detection: liar trust
  0.974–1.0). At liar-majority, the detector *inverts* and fires on honest agents.

**Concrete change list**
1. **Default to blind review — hide upstream verdicts.** Restores review depth's
   value for free by killing the rubber-stamp effect. (05)
2. **Route subtlety-class defects to mechanical gates, not more reviewers** — for
   subtle-enough defects, no human/agent review depth is a safe gate. (05)
3. **Treat "who reviewed the previous step" as a required edge in any long chain**,
   never a nicety. An inter-step review link converts a biased random walk into a
   quality ratchet. (09)
4. **Price meter calls as a fraction of the caller's *remaining* budget, and
   monitor it.** The same price is free at B160 and fatal at B10. (10)
5. **Add a `sends-attempted-vs-afforded` metric.** Balance dashboards are blind to
   full-wallet starvation. (10)
6. **Never price a single call above the affordability floor (`c ≥ B`)** — that's a
   mute, not a throttle; it produces silent deadlock with a green ledger. Give
   agents income/credit so a muted agent can rejoin. (10)
7. **Do not read a falling communication-Gini as fairness** — under a metered gate
   it's the signature of bankruptcy. (10)
8. **Rail self-modification hard:** rate-limit self-edits, require a diversity
   quorum before an overwrite lands, forbid mutation outside a sandbox. (06)
9. **Quorum composition matters more than deliberation mechanics** — at liar-
   majority every protocol fails, so who gets a seat is the real control. (04)

---

## PARLIAMENT — multi-model deliberation (exps 04, 02)

**Findings**
- **04 (consensus under lies):** one confident liar in five costs a naive
  parliament a third of its accuracy (0.92→0.56). **Live (real haiku panelists):**
  zero honest agents ever flipped (honestOnLie=0 at K=1,2,3); at K=3 the lie "wins"
  purely by vote arithmetic — *capture, not persuasion*. Crucially, **the liars
  never stated a false fact** — every one conceded quicksort's O(n²) worst case and
  argued average-case superiority. The model misleads by **reframing the question**,
  not asserting falsehoods.
- **02 (adversarial pair):** consensus/pass-rate says nothing about correctness;
  churn→0 and oracle-consistency are the honest convergence signals.

**Concrete change list**
1. **Pin the decision criterion in the gate contract, not just the answer.** The
   sharpest real-LLM risk is *criterion drift* — adversarial panelists quietly
   change what question is being answered. (04)
2. **Pair style-based critique with substance checks.** Overconfidence/
   stubbornness/outlierness heuristics catch *style*; a sneaky liar mimicking the
   honest band is invisible to them. Require verifiable evidence citations. (04)
3. **Never let vote arithmetic outrun evidence.** Add ground-truth spot checks /
   evidence audits; convergence detection alone is worthless — every cell converged
   fast regardless of truth. (04, 02)
4. **Report churn and oracle-consistency, not pass-rate, as the "settled"
   signal.** (02)

---

## ENGRAM — memory propagation & fidelity (exp 08)

**Findings**
- **08 (rumor mill):** in a gossip mesh, coverage and fidelity are *orthogonal* — a
  fact can be everywhere and wrong simultaneously. First-write-wins freezes early-
  hop corruption permanently. Higher fanout / shortcuts reach the rim in fewer hops
  and are therefore *more* faithful.

**Concrete change list**
1. **Push fidelity by shortening paths, not damping spread.** Throttling gossip to
   "protect" a memory is backwards; seed shortcuts / super-nodes near the source. (08)
2. **Kill first-write-wins.** Add versioned facts + anti-entropy so a later, more
   accurate write can heal early-hop corruption rather than being rejected as a
   duplicate. (08)
3. **Measure fidelity, not just propagation.** A memory mesh that tracks only reach
   is blind to silent corruption. (08)

---

## ACR / AWM — capability & workflow model (exps 03, 07, 02)

**Findings**
- **03 (prompt darwinism):** sparse exact-match rewards + small populations =
  evolution with nothing to select on. **Live:** across 3 generations no genome
  scored a single target word — F1 pinned at 0, breeding is a random walk. The dual
  failure is Goodhart: with a proxy reward, the population climbs *reported* fitness
  while true quality stalls (`goodhartDivergence`).
- **02 (adversarial pair):** working memory that trusts its own test suite
  unconditionally treats a single bad-faith constraint as ground truth —
  generalization collapses into memorization.
- **07:** a natural-language contract holds a multi-agent system together only up to
  its ambiguity; fuzzy clauses produce silent, independent misreadings.

**Concrete change list**
1. **A reward channel with no signal looks identical to a hard task.** Give partial
   credit for near-misses, or the loop can't tell "impossible" from "unrewarded". (03)
2. **Watch the gap between optimized and wanted, not the climb.** `goodhartDivergence`
   catches proxy-hacking; the raw score won't. (03)
3. **Treat diversity collapse as a governance signal** — homogenization onto one
   genome usually coincides with proxy hill-climbing. (03)
4. **Don't let working memory trust its own suite unconditionally** — pin an external
   oracle / ground-truth anchor so one poisoned constraint can't rewrite intent. (02)

---

## Priority order (if you build one thing)

1. **Sonder: `concept`+unit as a first-class transmitted type** (12, 11) — kills the
   single most common failure across the whole suite: silent semantic corruption
   under a green board.
2. **Lattice: mandatory inter-step review edge + blind review** (09, 05) — cheapest,
   highest-lift governance fix; directly answers the overnight-rot we just lived.
3. **Parliament: pin the decision criterion + evidence audits** (04) — closes the
   criterion-drift hole that real models exploit *without ever lying*.
4. **Lattice: ratio-based metering + sends-attempted-vs-afforded** (10) — prevents
   silent starvation deadlock.
5. **Engram: versioned facts + anti-entropy** (08) — heals early-hop corruption.

---

## Honesty ledger

- **Live-LLM (real haiku, replay-verified):** 04, 05, 07, 11, 12 — single-shot
  exhibitions plus a 20-run parameter sweep (04 K∈{1,2,3}, 11 budget∈{2,6,12,24},
  12 five seeds, 05 chain=8/reps=5). Sweep table above.
- **Sim-only (mechanism-level findings, no live seam by design):** 02, 03, 06, 08,
  09, 10, 13, and the sweep halves of 01/04/11/12.
- Where live results *refined* the sim, that's noted inline (12 caution-not-
  detection; 05 tax is difficulty-dependent; 11 self-poison reproduced; 04 capture-
  not-persuasion + criterion-drift). No sim result is presented as a live one.
- Traces are honest: red runs are reported red (02's hallucinated coder, 11's
  bending stateful curve, 13's slipped tail-drop) rather than smoothed.
