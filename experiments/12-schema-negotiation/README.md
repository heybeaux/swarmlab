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
