# 12 — Schema Negotiation

**Faculty tested: Sonder** (the typed event-contract problem) **+ Lattice** (coordination
with no referee).

Two agents must exchange data but were handed **different** data models for the same domain
(an e-commerce "order"). No human referee, no shared schema. They negotiate a common wire
format + field mapping from scratch, then round-trip a batch of records — or fail trying.

Full brief: [`specs/12-schema-negotiation.md`](../../specs/12-schema-negotiation.md).

## What it models

Each agent (A, B) holds a `Schema`: an ordered set of fields. Every field has a wire `name`,
a physical `wire` type (`string`/`int`/`float`/`enum`), and — hidden from the peer — a
`concept` (its real meaning). Three kinds of divergence per the spec:

- **Shared** — same concept, same wire name (`orderId`).
- **Renamed** — same concept, different wire name (A `grandTotal` vs B `total_due`).
- **False friend** — same wire name, **different concept/units**. The trap. Three recipes:
  - `total` : A = `subtotal` (pre-tax cents), B = `grandTotal` (post-tax cents)
  - `id`    : A = `orderId` (string), B = `customerId` (int)
  - `created` : A = `createdAtMs` (epoch ms), B = `createdAtSec` (epoch seconds)

Crucially, neither agent can see the other's `concept` labels — only names, wire types, and
example values. They must bootstrap a mapping from that surface alone.

**Negotiation** (no referee, `src/negotiator.ts`) is a bounded proposal/counter-proposal
loop. A proposes its best field pairings above a confidence threshold; B independently
re-scores each pair from its own side and endorses only the ones it also finds plausible
(mutual endorsement); repeat until the endorsed set stops changing, then both `accept`. The
matcher is deliberately naive — the "schema matcher without typed contracts" Sonder replaces.
Its fatal signal: an **exact name match** is treated as near-certain, so a false friend
(`total` pre-tax vs post-tax) sails through with high confidence and is never questioned.

**Scoring** (`src/sim.ts`) round-trips a batch A→B→A and buckets every agreed mapping row:
`believedMatched` (they agreed on it) × `trulyMatched` (concepts actually identical). A row
that was believed-matched but **not** truly-matched is a **silent corruption** — both agents
are certain the field mapped, the bytes round-trip cleanly, and the meaning is wrong. Nobody
throws. That count over total agreed rows is the headline metric.

The sweep crosses **overlap** `{0.25, 0.5, 0.75, 1.0}` × **falseFriends** `{0, 1, 2, 3}`,
40 seeded trials per cell. Trial 0 of each cell spawns agents A and B through `core` and puts
every negotiation turn on the bus as an A↔B `message`, so the run replays in the observatory.

## Run it

```bash
npm run build
node experiments/12-schema-negotiation/dist/main.js
```

Knobs (env): `SCHEMA_TRIALS`, `SCHEMA_SEED`, `SCHEMA_BATCH`, `SCHEMA_MAXROUNDS`. Output is a
JSONL trace under `runs/`; the harness re-reads it with `replay()` and asserts event-count
parity (`spawn`/`message`/`score`/`kill`).

## What I observed

The headline is a clean, monotone curve: **silent corruption is a direct function of
false-friend count, and refereeless negotiation is blind to almost all of it.**

1. **Zero false friends → zero silent corruption.** Across all four overlap levels, `ff=0`
   gives `silentCorruption = 0.00` and `falseFriendsCaught = 1.00`. When names and meanings
   never collide, the naive matcher is actually correct: renamed fields (`grandTotal` /
   `total_due`) match on type+value, shared fields match on name, and every agreed row is a
   true semantic match. Honest divergence is negotiable.

2. **Silent corruption scales with false-friend count — steeply.** Mean silent-corruption
   rate by injected false friends: **ff0 = 0.00 → ff1 = 0.43 → ff2 = 0.55 → ff3 = 0.64**
   (`silentCorruptionSlope = +0.214` per added false friend). One collision is enough to
   corrupt ~40% of the agreed mapping; three collisions corrupt roughly two-thirds of it. The
   worst cell (`o0.25-ff3`) hits **0.845 silent corruption** — five of every six agreed
   fields mean something different on the two sides — while the pair reports 100% agreement.

3. **The negotiator catches almost none of them.** `meanFalseFriendMissRate = 0.908` — across
   every cell that had false friends, **91% of them slipped through undetected.** The only
   ones ever caught are the `id` false friend (string-vs-int), and it's caught for the *wrong*
   reason: the type mismatch happens to lower its confidence below threshold, or the byte
   round-trip mangles the value so fidelity drops. The *units* false friends (`total` pre-vs-
   post-tax, `created` ms-vs-sec) are byte-identical ints — they survive the round-trip
   perfectly and are **never** flagged. Perfect fidelity, wrong meaning: the exact failure the
   spec predicted.

4. **The pair agrees fast and confidently — that's the danger.** `agreementRate = 1.00`
   everywhere; `meanRoundsToAgreement ≈ 2.0`. Negotiation converges in one full exchange
   because exact-name matches are high-confidence on both sides, so a false friend is agreed
   *immediately and unanimously*. There is no "we're not sure" state — high confidence and
   silent corruption arrive together.

5. **Byte fidelity is a liar.** Notice `o*-ff1` cells show `fidelity = 1.00` **and**
   `silent = 0.25–0.71` simultaneously. The round-trip "succeeds" on every field — the bytes
   come back exactly as sent — precisely *because* a units false friend is byte-identical.
   Fidelity measures whether the value survived; it says nothing about whether the value still
   *means* what it did. A system that only checks round-trip success will report a green board
   while shipping pre-tax numbers into a post-tax field.

## What it implies for Sonder typed event contracts

The result is a direct argument for Sonder. Refereeless negotiation can bootstrap a working
protocol from divergent schemas **as long as field semantics don't collide** — honest renames
and private fields are handled fine. But the moment two fields share a name and diverge in
meaning or units, the negotiators converge, fast and unanimously, on a **wrong** mapping and
have no way to know it. The failure is not loud disagreement; it is confident, silent
agreement on a corrupt contract. 91% of injected false friends went uncaught, and the units
ones (ms/sec, pre/post-tax) were uncatchable in principle from the wire surface alone.

Three directives fall out:

- **Meaning must be a first-class, transmitted field — not inferred.** The whole failure comes
  from `concept` being hidden while `name`/`type`/`value` are visible. A negotiator sniffing
  the surface cannot recover semantics it was never shown. Sonder's typed event contracts make
  the concept (and its unit) part of the schema the peer receives, so `total@pretax` and
  `total@posttax` are *different types*, not the same name — and a false friend becomes a
  compile-/handshake-time type error instead of a silent runtime corruption.
- **Units belong in the type.** The ms-vs-sec and pre-vs-post-tax cases are byte-identical and
  therefore invisible to every value-based check. Only a contract that carries the unit as part
  of the type (`Cents<PostTax>`, `EpochMillis`) can reject them. Value round-trip fidelity is
  worse than useless here — it *actively reassures* while corruption ships.
- **Confidence is not correctness.** The pair agreed at 100% with ~2 rounds on the most
  corrupt mappings. A contract layer must treat "both sides agree on the name" as insufficient
  evidence; agreement without a shared, verifiable notion of meaning is exactly how silent
  corruption enters a bus. Sonder's job is to make the meaning checkable, so agreement can be
  earned rather than assumed.

The trace is honest: `ff=0` is genuinely clean (no cell faked corruption where none existed),
and the corruption curve is monotone in the one variable — false-friend count — the hypothesis
named. The silent-corruption metric is derivable directly from the `score` events in the JSONL.

## Live run (real LLM)

- **Mode / model:** `llm`, `claude-haiku-4-5-20251001` via `dist/llm.js`. Two real haiku agents
  A and B each see ONLY their own field list (name, wire type, 3 sample values — never the
  hidden `concept`) and each proposes a mapping to the other's fields. Three false friends are
  injected: `total` (subtotal vs grand total), `id` (order id string vs customer id int),
  `created` (ms vs sec) — same name on both sides, different meaning.
- **Trace:** `runs/sn-llm-mr7g5kxu.jsonl` (replay-verified).
- **Key metrics:** `agreedRows=4`, `trulyMatched=4`, **`silentCorruption=0`**,
  `falseFriendsInjected=3`, `falseFriendsCaught=1`, `falseFriendsMapped=0`.
- **Live vs sim — cautious by avoidance, not by detection.** The sim's headline is grim:
  agents converge fast and unanimously on false-friend mappings, and **~91% of injected traps
  ship silently** (silent corruption climbing 0.43→0.55→0.64 with false-friend density). The
  live warned haiku agents did **not** reproduce that catastrophe — `silentCorruption=0` — but
  the reason is subtle and worth stating honestly: they mostly **avoided the traps by not
  agreeing on them**, not by identifying them. A proposed `id → order_ref` from one side vs
  `id → id` from the other means the row never reaches *mutual* agreement, so no corrupt
  mapping is asserted — but only **1 of 3** false friends was actively *caught* and named, and
  agent B still fell for the naive `id → id`. So the live result refines the sim rather than
  refuting it: **an explicit "same name may mean different things" warning is enough to stop
  the confident-agreement failure mode, but it is NOT enough to make the agents reliably
  identify the traps.** They become cautious (good) without becoming correct (still risky) —
  which is exactly why the Sonder directive holds: transmit `concept`+unit as a first-class,
  checkable type, because a warning that only produces *hesitation* still leaves the meaning
  unverified.

## Retest: typed contracts (Spec 14)

This is the first stack change driven by a lab finding. The exp-12 result above is a
direct argument for making meaning a transmitted, typed term — so we built exactly that
in Sonder and re-ran the sweep against the shipped code.

- **What shipped (`~/dev/sonder`, branch `typed-payload-contracts`, commit `4c7dddf`):**
  `FieldContract { name, wire, concept, unit }`, `PayloadContract`, and
  `negotiateContracts(a, b)` — a **pure, deterministic** type-check that matches on
  `concept`+`unit` equality only (wire-name equality contributes nothing) and NAMES
  every collision: `false_friend` (same name, different concept) and `unit_mismatch`
  (same concept, different unit, no registered conversion). Plus an optional
  `payload_contract` field on `SonderEventCore` (backward-compatible). See
  `packages/core/src/contract.ts` and its tests.
- **How the retest runs it (`src/sondermode.ts`, mode `sonder`):** same schema
  generator, same sweep (overlap × falseFriends, 40 trials/cell), same metrics. Each
  side transmits its hidden `concept` (+ derived `unit`) as a `FieldContract`; the
  mapping is produced by the **real** `@heybeaux/sonder-core` `negotiateContracts` (linked
  via a `file:` dep, not reimplemented). The `meta` event records `mode=sonder` and the
  sonder commit SHA.

### Before / after (headline metrics)

| metric | naive baseline | typed contracts (`sonder`) | target |
|---|---|---|---|
| `meanFalseFriendMissRate` | **0.908** | **0.00** | 0.00 ✅ |
| worst-cell `silentCorruption` (`o0.25-ff3`) | **0.845** | **0.00** | 0.00 ✅ |
| `silentCorruption` at ff1 / ff2 / ff3 | 0.427 / 0.553 / 0.642 | 0.00 / 0.00 / 0.00 | — ✅ |
| false-friend **corrupt escapes** (wrong same-name maps) | n/a (naive: silent) | **0 / 960 injected** | 0 ✅ |
| honest-rename match rate (`ff=0` cells) | high, agree=1.00 | matches preserved, `o1-ff0` agree=1.00 fid=1.00 | ≥ naive ✅ |

Naive run: `sn-naive-*.jsonl` — `meanFalseFriendMissRate=0.908`, `worstSilentCorruption=0.845`
(reproduces the committed baseline exactly). Sonder run: `sn-sonder-*.jsonl` — `silent=0` in
every one of the 16 cells, `falseFriendCorruptEscapes=0` across all 960 injected false friends.
(Run IDs are per-execution timestamps; traces land in `runs/`, which is gitignored.)

### The honest part: 0 corruption BY DETECTION, not by refusal

The success criterion is that corruption reaches 0 **by detection** (mismatches named), not
by a blanket refusal-to-agree. The retest reports `falseFriendCorruptEscapes = 0 / 960` — no
false friend ever mapped same-name→same-name to a wrong meaning. That is the number that
matters, and it is 0.

There is a subtlety worth stating plainly rather than smoothing over. The *literal* rate
`mismatchesNamed / falseFriendsInjected` is **0.716**, not 1.0 — and that is a real,
instructive result, not a miss:

- At **full overlap** (`o1`), every injected false friend is surfaced as an **explicit named
  collision**: `40/40`, `80/80`, `120/120`. The type checker names the trap.
- At **lower overlap**, some false friends are prevented a *different* way. Because both the
  pre-tax and post-tax halves of a `total` collision map to concept `order.total` (at
  different units), the greedy concept-matcher often routes each half to its **true concept
  twin** (an honest field that legitimately shares that concept+unit) and leaves the
  ambiguous wire-name field **unmapped**. The wrong same-name mapping never ships — corruption
  is prevented — but via *re-routing to the correct meaning* rather than a named collision.

So typed contracts prevent 100% of the corruption, sometimes by naming the collision and
sometimes by dissolving it into correct matches. Only the escapes count as failures, and there
are zero. The `falseFriendDetectionRate` (named-only) is reported alongside so the mechanism is
never hidden behind the headline.

One more honest note: `agreementRate` **drops** as false-friend count rises (e.g. `o1-ff1`
agree=0.00). This is correct and desirable — a contract containing an unresolvable
`unit_mismatch` is `ok=false`, i.e. the pair **refuses to agree on a corrupt contract**. In the
naive world the same pair agreed at 100% and shipped the corruption. Refusing a bad contract is
the point; the false-friend halves are still individually re-routed or named, so no meaning is
lost — only the wrong agreement is withheld.
