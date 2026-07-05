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

- **Live-LLM (real haiku, replay-verified):** 04, 05, 07, 11, 12, 14 — single-shot
  exhibitions plus a 20-run parameter sweep (04 K∈{1,2,3}, 11 budget∈{2,6,12,24},
  12 five seeds, 05 chain=8/reps=5, 14 d0/d2b2/d3b3 trees). Sweep table above.
- **Sim-only (mechanism-level findings, no live seam by design):** 02, 03, 06, 08,
  09, 10, 13, and the sweep halves of 01/04/11/12/14.
- Where live results *refined* the sim, that's noted inline (12 caution-not-
  detection; 05 tax is difficulty-dependent; 11 self-poison reproduced; 04 capture-
  not-persuasion + criterion-drift). No sim result is presented as a live one.
- Traces are honest: red runs are reported red (02's hallucinated coder, 11's
  bending stateful curve, 13's slipped tail-drop) rather than smoothed.

---

## Retest ledger (findings → stack changes → measured deltas)

The receipt that the lab produced something useful: a finding that changed the stack,
and the re-measured result of that change. This is the loop closing.

### RT-01 — Sonder typed payload contracts (from exp-12 + exp-11)

- **Finding (exp-12):** refereeless schema negotiation converges fast and unanimously on
  *false friends* (same wire name, different concept/unit). Sim: `meanFalseFriendMissRate
  = 0.908`, worst-cell `silentCorruption = 0.845` at 100% reported agreement. Units traps
  (`created` ms/sec, `total` pre/post-tax) are byte-identical and uncatchable from the wire
  surface. exp-11 adds: probing can't recover statefulness/edge regions, so contracts must
  *state* them.
- **Change (`~/dev/sonder`, branch `typed-payload-contracts`, commit `4c7dddf`):** a typed
  payload-contract layer in `packages/core`. `FieldContract { name, wire, concept, unit }`,
  `PayloadContract`, and `negotiateContracts(a, b)` — a pure, deterministic type-check that
  matches on `concept`+`unit` only and NAMES every collision (`false_friend`,
  `unit_mismatch`). Optional `payload_contract` on `SonderEventCore` (backward-compatible,
  mirrors the Phase-3.5 `outcome`/`resources` pattern). Full test suite green
  (150 passing; the 3 exp-12 recipes surface as named mismatches, zero mapped).
- **Retest (`experiments/12-schema-negotiation`, mode `sonder`):** same generator, same
  sweep, same metrics — mapping produced by the **real shipped** `negotiateContracts`
  (linked, not reimplemented).

  | metric | before (naive) | after (contracts) | target | verdict |
  |---|---|---|---|---|
  | `meanFalseFriendMissRate` | 0.908 | **0.00** | 0.00 | ✅ |
  | worst-cell `silentCorruption` | 0.845 | **0.00** | 0.00 | ✅ |
  | false-friend corrupt escapes | (silent) | **0 / 960** | 0 | ✅ |
  | honest-rename match rate | high | preserved (`o1-ff0` agree=1.00 fid=1.00) | ≥ naive | ✅ |

- **Honesty note:** corruption reaches 0 **by detection** (`falseFriendCorruptEscapes = 0`),
  not by refusal. The literal named-collision rate `mismatchesNamed/injected = 0.716` (not
  1.0) is a real finding, not a miss: at full overlap every false friend is explicitly named
  (40/40, 80/80, 120/120), but at lower overlap some are prevented by *re-routing each half
  to its true concept twin* + leaving the ambiguous field unmapped — a stronger outcome than
  naming. `agreementRate` drops as false friends rise because a contract with an unresolvable
  `unit_mismatch` is `ok=false` — the pair correctly **refuses to agree on a corrupt
  contract** instead of shipping it at 100% confidence like the naive matcher did. Details and
  the full 16-cell table in the exp-12 README "Retest: typed contracts" section.

This is priority-order item #1 from the synthesis above, now built and measured. The single
most common failure across the suite — silent semantic corruption under a green board — is
zero in the retest.

### RT-02 — Parliament pinned criterion + evidence audit (from exp-04)

- **Finding (exp-04):** the sharpest real-LLM risk isn't false facts, it's **criterion drift**
  — liars conceded the true `O(n²)` bound and reframed the *yardstick* to average-case
  superiority — and at liar-majority **vote arithmetic outruns evidence** (K=3: silent lie
  consensus `1.00`, every confidence/style heuristic inverts because the liars *are* the
  plurality). No style or confidence signal can see either failure.
- **Change (`~/dev/parliament`, branch `criterion-pinning`, commits `1562a1f` + `4436f89`):**
  a pinned decision criterion + evidence audit in `packages/core`. `DecisionCriterion
  { criterion_id, question, standard, admissible_evidence }`, `EvidenceCitation`,
  `AuditedPosition`, and a pure, deterministic `tallyWithAudit(criterion, positions)` that
  gates consensus on *substance*: (1) votes without a verifiable, on-standard citation don't
  count; (2) criterion drift is **named** (`drift=true` + detected standard), never silent;
  (3) an arithmetic majority on inadmissible evidence is **blocked** (`winner=null`,
  `blocked_reason`), so capture is *detected* not out-voted; (4) admissibility is per-position,
  so honest lone dissent survives. `criterion_id` is a stable FNV-1a hash invariant under
  field reordering. 9 vitest cases green (full core suite 776 passing). `./criterion` subpath
  export added for direct consumer import.
- **Retest (`experiments/04-consensus-under-lies`, mode `parliament`):** the same belief/trust
  deliberation as `naive`/`vigilant`, the same 14 cells × 25 seeded trials, but every verdict
  decided by the **real shipped** `tallyWithAudit` (linked via a `file:` dep from the
  `./criterion` subpath — not reimplemented). Sim run `cul-parl-mr7ty33i`, all traces
  replay-verified.

  | metric | before (naive/vigilant) | after (parliament) | target | verdict |
  |---|---|---|---|---|
  | silent lie consensus at K=3 | **1.00** lie wins | **0.00** (both K=3 cells blocked 25/25) | 0.00 | ✅ |
  | audited lie win, any cell | up to 0.72 | **≤ 0.01** (one vigilant-k1-sneaky trial) | ~0 | ✅ |
  | truth rate at K=0 (false-positive tax) | 0.92 / 0.84 | **0.92 / 0.84** (`blockedCleanPanels=0`) | ≥ 0.92 | ✅ (naive) |
  | truth rate at K=1–2 sneaky | 0.60 / 0.28 | 0.60 / 0.28 (unchanged) | ≥ 0.90 | ❌ |

- **Live exhibition (real `claude-haiku-4-5-20251001`, 5 panelists, audited):** K=1 → audited
  **B** (truth), `driftFlagged=1/1`, every liar drifted; K=2 → audited **B**, `driftFlagged=0/2`
  (these liars asserted a *false worst-case* rather than drifting — inadmissible via the
  unverifiable path, still not certified for the lie); K=3 → raw arithmetic **A** (the lie wins
  the vote), **audit blocks with `criterion_drift`, `winner=none`**, `driftFlagged=2/3`. The spec
  B3 success condition — audit refuses to certify a lie that won the arithmetic — is met live.
- **Honesty note:** the change eliminates **silent capture and criterion-drift certification at
  zero clean-panel cost** — the two failures exp-04 said no heuristic could touch — but it does
  **not** raise honest truth-recovery at K=1–2 sneaky (0.60 / 0.28, red). There the audit
  reliably kills the *lie* (lie rate → 0) but the outcome lands on **blocked/no-consensus** rather
  than **truth**: with 1–2 honest voices dragged and thin evidence (p=0.7), admissible truth votes
  don't always form a strict majority, so the tally correctly declines to certify rather than
  manufacture a truth win. Closing that is a *deliberation* change (honest evidence pooling), not
  an audit change — the parliament retest is a verdict layer and deliberately leaves the trust rule
  fixed so the audit is the only variable. `dragged-honest` is likewise unchanged (~2.28, red by
  construction); what changed is that dragging no longer flips the verdict. Full 14-cell table and
  the sim→`AuditedPosition` mapping in the exp-04 README "Retest: criterion pinning" section.

This is priority-order item #2 from the synthesis above. The K=3 capture hole — a lie winning
under a green, high-confidence board — is now **detected and blocked** rather than certified,
live and in sim.

### RT-03 — Engram versioned facts + anti-entropy (from exp-08)

- **Finding (exp-08):** in a gossip mesh, coverage and fidelity are *orthogonal* — every one of
  36 cells saturates (`saturationRate=1.00`), but **19/36 hit full coverage with sub-0.90
  fidelity** (`coverageOutrunsTruth=19`); the worst cell (m=0.1, N=120) reaches everyone while
  the typical held version is only **0.574** faithful. Corruption radiates as a spatial gradient
  from the seed (`telephoneGradient=0.113`). The villain is **first-write-wins**: sticky adoption
  freezes early-hop corruption permanently — a later, truer retelling bounces off as a duplicate.
- **Change (`~/projects/engram`, branch `versioned-facts-anti-entropy`, commits `baf3d05` +
  `0a4910d`, local-only):** a pure-TS `src/reconciliation/` module — no NestJS deps, built to an
  importable CommonJS artifact. `VersionedFact { fact_id, version, origin_id, content, digest }`
  with a content-addressed digest (`verifyFact` recomputes and matches — a hop-mutated retelling
  breaks it); `reconcile(held, incoming)` that kills first-write-wins with named outcomes
  (`kept` / `adopted` / `healed` / `rejected_corrupt`): a later verifiable write **heals** a
  corrupt copy, a corrupt copy **never** overwrites a verified one, and an empty node adopts a
  provisional (healable) copy so it stays informed; `antiEntropySync(a, b)` for pairwise neighbor
  repair. 7 jest cases green (the five Spec-16 A4 recipes + adopt + symmetric repair).
- **Retest (`experiments/08-rumor-mill`, mode `engram`):** the identical 36-cell sweep, same
  seeds, adoption decided by the **real shipped** `reconcile` + `antiEntropySync` (linked via a
  `file:` dep on the built module — never reimplemented). Per-hop drift corrupts `content` without
  re-authoring the digest (a retelling); each receiver reconciles; one anti-entropy pass runs per
  live edge per round, continuing until the mesh converges. Baseline run `rm-baseline-mr7uziwl`,
  engram run `rm-engram-mr7uzjds`, all traces replay-verified (deterministic — re-runs reproduce
  these metrics exactly).

  | metric | before (first-write-wins) | after (versioned + anti-entropy) | target | verdict |
  |---|---|---|---|---|
  | `coverageOutrunsTruth` | **19 / 36** | **0 / 36** | 0 | ✅ |
  | worst-cell fidelity at saturation | **0.574** | **1.000** | ≥ 0.99 | ✅ |
  | `telephoneGradient` | **0.113** | **0.000** | ≤ 0.01 | ✅ |
  | `saturationRate` / coverage | 1.00 | **1.00** | no regression | ✅ |
  | max per-cell time-to-saturation delta | — | **−3.567 rounds** (faster) | ≤ +1 | ✅ |

- **Honesty note:** fidelity reaches 1.0 **by healing**, not by damping spread — the real module
  reported `meanHealedPerTrial ≈ 279` (`healed` outcomes) and `meanRejectedPerTrial ≈ 2768`
  (`rejected_corrupt`) across the sweep, `0/0` in the noiseless `m=0` column. Time-to-saturation
  *improved* at every cell (max delta −3.567) because anti-entropy is a propagation channel too: a
  still-empty node adopts a verified copy from an informed neighbor during a sync pass, so coverage
  completes in ~1 round. This is the exp-08 directive confirmed — *push fidelity by shortening
  paths, not by damping spread.* Full 36-cell before/after and healing accounting in the exp-08
  README "Retest: versioned facts + anti-entropy" section.

This is the exp-08 priority item — the single most damaging memory-mesh failure, *the fact is
everywhere and wrong at once* — now zero in the retest, and healed rather than throttled.

### RT-04 — Parliament fact-checked evidence audit (from exp-04, adapted attack)

- **Finding (RT-02 red-inside-the-green):** the Spec-15 audit killed criterion drift and silent
  capture, but it opened a next-hop hole — a text-only classifier can't tell "on-standard,
  unverifiable" from "on-standard, false". At K≥2 the liars adapted from *drifting* the yardstick
  to *fabricating* a false worst-case bound ("modern quicksort achieves O(n log n) worst-case"),
  which passed the admissibility gate. In the adapted-attack sim (`cul-fc-hole-mr7wkmvf`),
  silent lie consensus returned to **1.00 at K=3 sneaky in both policies** — exactly the
  pre-Spec-15 baseline, on the exact same yardstick.
- **Change (`~/dev/parliament`, branch `fact-check-audit`, commit `218faf1`):** a new additive
  `packages/core/src/factcheck.ts` — non-breaking (all 776 Spec-15 tests unchanged and green,
  18 new tests green, 794 total). Exports `FactStore { check(claim): FactCheckResult }` (verdict
  taxonomy `supported | contradicted | ungrounded`; dependency-injected so `@parliament/core`
  stays dep-free), `TableFactStore` for seeded oracles, `FactCheckedCitation` (adds
  `statement_id`), and `tallyWithFactCheck(criterion, positions, options?)` that runs the
  Spec-15 audit first, then re-checks any citation with a `statement_id` against the store.
  Two new blocked reasons stack on Spec-15's four: `fabricated_claim` (contradicted by store,
  strongest attack signal, overrides Spec-15 admissibility) and `ungrounded_claim` (not in store,
  reported *separately* — never conflated with fabrication). Naming priority when a position
  blocks: `fabricated > ungrounded > drift > no_admissible_evidence`. When `factStore` is
  undefined, output is **byte-identical to `tallyWithAudit`** — same shape plus zeroed fact
  counters. New `./factcheck` subpath export mirrors `./criterion`.
- **Retest (`experiments/04-consensus-under-lies`, mode `parliament-factcheck`):** SAME
  belief/trust deliberation, SAME 14 cells × 25 seeded trials, SAME pinned criterion
  (`criterion_id=78eb2ccd`). The adapted sneaky liar emits a fabricated on-standard citation
  with `statement_id="{lie}-nlogn-worst-case"`; the seeded `TableFactStore` marks the truth's
  bound supported and the lie's bound contradicted. Verdicts decided by the **real shipped**
  `tallyWithFactCheck` (linked via `file:` dep from `./factcheck` subpath — never
  reimplemented). Sim runs `cul-fc-hole-mr7wkmvf` (B1) and `cul-fc-factcheck-mr7wkmw0` (B2),
  all traces replay-verified.

  | metric (adapted attack) | B1 spec-15 alone (no store) | B2 fact-check (seeded store) | target | verdict |
  |---|---|---|---|---|
  | silent lie at K=3 sneaky (naive / vigilant) | **1.00 / 1.00** | **0.00 / 0.00** | 0.00 | ✅ |
  | silent lie at K=2 sneaky (naive / vigilant) | 0.32 / 0.16 | **0.00 / 0.00** | 0.00 | ✅ |
  | silent lie at K=1 sneaky (naive / vigilant) | 0.12 / 0.04 | **0.00 / 0.00** | 0.00 | ✅ |
  | K=3 sneaky blocked `fabricated_claim` named | 0.00 / 0.00 | **1.00 / 1.00** | 1.00 | ✅ |
  | truth rate at K=0 (clean-panel tax) | 0.92 / 0.84 | **0.92 / 0.84** | ≥ 0.92 / ≥ 0.84 | ✅ |
  | K=0 blocks on `ungrounded_claim` | 0 / 0 | 2 / 4 (of 25) | reported, not smoothed | ✅ (honest) |

- **Live exhibition (real `claude-haiku-4-5-20251001`, fabrication-prompted liars):** K=1 →
  audited **B** (truth), fabFlagged=0/1 (Haiku's safety training refused the false-bound
  prompt, empty answer); K=2 → audited **B**, **fabFlagged=1/2** (one liar successfully
  produced "modern quicksort achieves O(n log n) worst-case", fact-check consulted the store,
  saw `contradicted`, correctly named `fabricated=true`); K=3 → audit blocked
  `no_admissible_evidence` (all three liars refused to fabricate, empty positions). Runs
  `cul-llm-fc-k1-mr7wor03`, `cul-llm-fc-k2-mr7wpkbf`, `cul-llm-fc-k3-mr7wqbdu` — 28 events
  each, replay-verified. **The K=2 catch is the interesting one:** the only live trial where a
  fabrication actually happened, and the fact-check named it without inflating raw consensus
  (which stayed truth on three honest panelists).
- **What the fact store IS and is NOT:** the store is a **seeded oracle** — it knows exactly
  what we told it (truth's bound supported, lie's bound contradicted). It is *not* a general
  truth machine. The retest proves the **audit architecture** closes the fabrication hole
  *when a ground store exists*. Where the ground store comes from — real knowledge bases,
  retrieved evidence, cross-model verification — is the next question, not this one.
- **Honesty note (canonicalization at B3):** an earlier live classifier set the `statement_id`
  from the first algorithm named in the free-text argument. Honest agents mentioning "quicksort
  degrades to O(n²)" would then get `statement_id=quicksort-nlogn-worst-case` — contradicted in
  store — falsely marking honest correct answers as `fabricated_claim`. The fix: canonicalize
  from the agent's **own answer letter**, not from arg text. Runs pinned above are with the
  fix. `canonicalizationFailures` is reported honestly per run (K=1: 1, K=2: 1, K=3: 3) so a
  reader knows exactly which positions the fact-check saw versus skipped.
- **Honesty note (K=0 tax):** B2 shows K=0 `ungroundedBlockedRate` of 0.08 (naive) / 0.16
  (vigilant) — 6 of 50 clean panels blocked on `ungrounded_claim` because deliberation dragged
  an honest agent onto the lie and that agent's private evidence was for a *third* answer not
  in the seeded oracle. Truth rate at K=0 unchanged (0.92 / 0.84). The tally correctly declines
  to certify under-grounded honest majorities rather than pretend they're facts.

This closes the on-standard fabrication hole surfaced by RT-02 — silent capture *does not*
return under the adapted attack when a ground store exists. Full 14-cell tables (B1 + B2), the
B3 evidence table, and the honesty accounting live in the exp-04 README "Retest: fact-checked
audit" section.

### RT-05 — Engram capability facts as delegation trust memory (from exp-14)

- **Finding (exp-14 Part B, the question):** exp-08 → RT-03 proved versioned facts +
  anti-entropy heal *corrupted* memory in a gossip mesh. The open question for the memory
  faculty was different: does the same substrate carry **operational trust** — "who can
  actually do this task class" — across the three deaths a transcript cannot survive
  (context truncation, session restart, agent replacement)? Baselines say the problem is
  real: a memoryless root re-hires a reliably-failing delegate at chance (~1/6) for 30
  straight rounds (late rate 0.183/0.177 vs chance 0.167), and an in-context root with a
  realistic 10-round window suppresses but **never converges** — evidence ages out of the
  window, the bad delegate re-enters the eligible pool, and after a root restart the
  windowed arm is indistinguishable from amnesiac (0.14–0.20 post-reset).
- **Change:** none needed — that's the receipt. exp-14 links the **real shipped**
  `@openengram/reconciliation` (`file:` dep, branch `versioned-facts-anti-entropy`, PR #323;
  never reimplemented) in a NEW role: each observed delegation outcome is re-authored as a
  capability `VersionedFact` (`cap:{worker}:{task_class}`, cumulative successes/failures,
  failed assertion + evidence digest in content, `verification_tier=provenance` — the root
  directly measured what it recorded), written through `reconcile()` and read back through
  `verifyFact()`. 1500 writes/condition: 300 `adopted`, 1200 `healed` (the module's
  verified-newer-version path), 0 `rejected_corrupt`.
- **Retest (`experiments/14-delegation-decay`, Part B):** 6 workers, one harness-handicapped
  (`mercury` fails `quota-policy` invisibly), 3 arms × {loud, confident-wrong} × 50 seeded
  trials × 30 rounds, same seeds and same environment draws across arms; root killed and
  restarted between rounds 15/16; brand-new root reads the store at round 30. Run
  `dd-b-mr7zvbuu`, replay-verified, deterministic across reruns.

  | metric (loud / confident-wrong) | amnesiac | in-context (W=10) | engram store | verdict |
  |---|---|---|---|---|
  | late incapable-selection (r25–30) | 0.183 / 0.177 | 0.087 / 0.093 | **0.000 / 0.003** | ✅ |
  | convergence round (≤0.05 sustained) | never / never | never / never | **9 / 11** | ✅ (honest: not ≤5) |
  | post-reset incapable rate | 0.18 / 0.18 | 0.14 / 0.20 | **0.00 / 0.00** | ✅ |
  | transfer-avoid, brand-new root | 0.80 / 0.86 (≈blind 0.83) | 0.84 / 0.88 (≈blind) | **1.00 / 1.00**, evidence 1.00 | ✅ **deliverable** |
  | wasted tokens / trial | 73 / 121 | 35 / 69 | **15 / 30** | ✅ |

- **Honesty notes:** (1) convergence lands at rounds 9–11, not the hypothesized "handful
  (≤5)" — with 6 workers under uniform exploration plus 1–2 rounds of detection lag, ≤5 is
  unreachable by design; the store converges at the exploration floor, and the miss is
  reported, not smoothed. (2) The store does not fix unforgiving priors:
  `capableExcluded` averages 0.22 capable workers/trial permanently benched by early
  transient failures under the failures>successes rule — a production trust router needs
  decay/forgiveness on top of persistence. (3) Confident-wrong failure doubles wasted
  tokens in *every* arm (engram 15→30); memory shrinks the tax, nothing eliminates the
  pre-evidence rounds. (4) In-context is genuinely better than amnesiac inside its window
  (0.09 vs 0.18) — reported plainly; it loses on convergence, reset, and transfer, which is
  exactly where the store wins.

This is RT-03's substrate doing new work without modification: capability knowledge written
as provenance-tier versioned facts **outlives the agent that learned it** — 100%
transfer-avoid with verified evidence on a root that never saw a single failure. Part A of
the same experiment (README) separately refuted H-A's seam clause: under exp-01-calibrated
handoff noise, silent omission (50% of losses) dominates the sibling integration seam (21%)
in deep trees — and the live haiku d3b3 tree reproduced exactly that signature (7/7 losses
were drops, 9.3× cost).
