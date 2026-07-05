# 13 — Audit Forgery (Team's Choice)

> Agents emit events onto a **shared, signed, causally-chained event bus** (a Sonder
> audit trail). One agent turns adversary and tampers with the log — it **inserts**,
> **drops**, **reorders**, or **backdates** events. Measure whether the signed causal
> chain **detects** the tampering, which attack classes slip through, and how a verifier
> that only checks *some* of the chain's invariants gets fooled.
> **Faculty tested: Sonder** (the signed event bus that binds every faculty into one
> tamper-evident audit trail).

## Why this is new

The other twelve experiments probe how *content* mutates or how *agents* deliberate:
rumor-mill (08) measures fidelity decay of a fact as it propagates; consensus-under-lies
(04) measures whether deliberation survives liars; self-modifying-swarm (06) measures
prompt drift under peer edits. **None of them attacks the audit trail itself.** Sonder's
whole promise is that the *record of what happened* is tamper-evident — that you can
replay a signed causal chain and prove nobody edited history. No experiment tests that
promise adversarially. This one does: the adversary doesn't lie in a message, it lies in
the *log*, and the question is whether the chain's own invariants catch it.

## The question

A Sonder audit trail is more than an append-only list. Each event carries:
- a **content hash** `h = H(payload)`,
- a **prev-link** `prev = id` of the immediately preceding event (a hash chain / DAG edge),
- a **signature** `sig = sign(author, id ∥ h ∥ prev ∥ seq ∥ ts)` binding the whole record
  to its author's key,
- a monotone **sequence number** `seq` and a **timestamp** `ts`.

These four invariants overlap: a strong verifier checks *all* of them, a weak verifier
checks only a subset (e.g. "the signatures are valid" but not "the prev-links form an
unbroken chain", or "the chain links up" but not "seq is strictly monotone"). Real
systems ship weak verifiers constantly — signature checks are expensive, chain walks are
skipped under load, clock skew is tolerated. **The experiment asks: for each attack class,
which verifier invariants are load-bearing? What is the minimum verifier that catches a
given forgery, and which forgeries are invisible to a verifier that trusts signatures
alone?**

Specifically:
- **Detection rate per (attack × verifier).** Does verifier V flag a trail tampered by
  attack A?
- **Minimum sufficient verifier.** For each attack, the cheapest invariant subset that
  detects it.
- **Silent-forgery surface.** How many (attack, verifier) cells produce a *valid-looking*
  trail that is actually forged — the false-clean rate, the thing that should terrify you.
- **Key compromise blast radius.** If the adversary holds the *signing key* (insider),
  which attacks become undetectable even to the full verifier, and which structural
  invariants (seq monotonicity, prev-chain continuity, causal reachability) still bite?

## Model

A single trial:

1. **Honest trail.** `authorCount` honest agents are spawned. Over `eventCount` steps an
   author (round-robin + seeded jitter) appends an event: `{ id, author, seq, ts, payload,
   h=H(payload), prev=lastId, sig }`. `seq` is the global monotone counter; `ts` advances
   by a seeded positive delta; `prev` links to the previous event's id; `sig` signs the
   bound tuple with the author's key. This is a clean, fully-valid Sonder trail.
2. **Adversary.** One agent (or an external attacker) receives the trail and applies **one
   attack** to produce a forged trail:
   - **insert** — splice a fabricated event mid-chain (re-sign it if the adversary has a
     key; otherwise forge a signature that won't verify).
   - **drop** — delete an event and (optionally) re-stitch `prev` links to hide the gap.
   - **reorder** — swap two adjacent events' positions without fixing `seq`/`prev`.
   - **backdate** — rewrite one event's `ts` to sit before its true predecessor (make it
     look older than it is).
   - **tamper-payload** — mutate a payload without updating `h`/`sig` (content forgery).
   Each attack has a **stitch** flag: a naive attacker leaves obvious breakage; a
   sophisticated one re-stitches every field it *can* (prev-links, hashes) but cannot
   re-sign unless it holds the key.
3. **Key model.** `keyCompromised ∈ {false, true}`. When false, the adversary cannot
   produce a valid `sig` for any event it authored/edited — signature checks catch it.
   When true (insider), the adversary re-signs freely, and *only structural* invariants
   (chain continuity, seq monotonicity, ts monotonicity, causal reachability from genesis)
   can catch it.
4. **Verifiers.** A verifier is a subset of four independent checks:
   - `SIG` — every event's signature verifies against its author's key.
   - `HASH` — every event's `h` equals `H(payload)`.
   - `CHAIN` — every `prev` points to an event that exists and precedes it; genesis excepted;
     no dangling / forward links; exactly one genesis.
   - `SEQ` — `seq` is strictly increasing in trail order **and** `ts` is non-decreasing.
   We run the four canonical verifiers: `sig-only`, `hash+sig`, `chain+sig`, and `full`
   (all four), against every attack.
5. **Verdict.** A verifier returns `clean | flagged(reason)`. Ground truth is known (the
   trail *is* forged), so a `clean` verdict on a forged trail is a **false-clean** — a
   silent forgery. That count is the headline.

**Knobs (Sonder policy under test):**
- `authorCount`, `eventCount` — trail shape.
- `attack` — which forgery.
- `stitch` — naive vs sophisticated attacker.
- `keyCompromised` — outsider vs insider.
- `verifier` — which invariant subset is enforced.

The sweep crosses **attack** × **verifier** × **keyCompromised** × **stitch**, with N
seeded trials per cell (varying which event is attacked, jitter, etc).

## Contracts (reuse core `TraceEvent`)

- `message` `meta` — mode, seed, trials, attack/verifier grid, author/event counts.
- `message` `append` — one honest event on the exhibition trial:
  `{ seq, author, h, prev, ts }`.
- `message` `attack` — the adversary's move on the exhibition trial:
  `{ attack, stitch, keyCompromised, targetSeq }`.
- `message` `verdict` — one verifier's ruling on the exhibition trial:
  `{ verifier, attack, clean, reason }`.
- `score` — per-cell aggregate: `attack`, `verifier`, `keyCompromised`, `stitch`,
  `detectionRate`, `falseCleanRate`, `trials`.
- final `score` — summary: overall silent-forgery surface, the minimum sufficient verifier
  per attack, and the key-compromise blast radius (attacks the full verifier still catches
  vs. the ones it cannot).

`score` values are numbers (per the core contract); enums like attack/verifier are encoded
as integer codes in scores and as strings in the human-readable `message` events.

## Metrics

- **detectionRate(attack, verifier)** — fraction of trials where the verifier flagged the
  forged trail. 1.0 = always caught, 0.0 = silent.
- **falseCleanRate** — `1 − detectionRate`: the silent-forgery rate for that cell.
- **silentForgerySurface** — count of (attack, verifier) cells with detectionRate < 1.0
  (the "looks clean but isn't" surface area).
- **minSufficientVerifier(attack)** — the cheapest verifier (by invariant count) that
  reaches detectionRate = 1.0 for that attack (outsider model).
- **keyCompromiseBlastRadius** — with `keyCompromised=true`, which attacks the `full`
  verifier still catches (structural invariants bite) vs. loses (signatures were the only
  guard). This is the insider-threat map.

## Definition of done

- `specs/13-team-choice.md` (this file) written first.
- `experiments/13-audit-forgery/` built on `core/` — traceable, replayable, scored.
- Runs a deterministic seeded sim (NO live LLM calls — the sim is the deliverable),
  writes a valid JSONL trace under `runs/` using the core `TraceEvent` shape
  (`spawn`/`message`/`score`/`kill`), prints a summary, and self-verifies replay
  (event-count parity via `replay()` / `readRunRecord()`).
- `npm run build` clean (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
  zero `any` in public signatures.
- Root `tsconfig.json` gains the project reference; full-repo build stays green.
- `README.md` with hypothesis, what was actually observed (with numbers), and which
  faculty it informs. Never fake a green result — a caught forgery and a slipped one are
  both real findings.
- One-paragraph note in `JOURNAL.md`.
