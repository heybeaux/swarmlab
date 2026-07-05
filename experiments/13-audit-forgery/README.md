# 13 — Audit Forgery (Team's Choice)

**Faculty tested: Sonder** — the signed, causally-chained event bus that binds every
faculty into one tamper-evident audit trail.

The other twelve experiments attack *content* (does a fact decay as it propagates? do
liars derail consensus? do peer edits corrupt a prompt?). **This one attacks the record
itself.** The adversary doesn't lie in a message — it lies in the *log*: it inserts,
drops, reorders, backdates, or tampers events on the signed trail. The question is Sonder's
whole reason to exist: **can you replay a signed causal chain and prove nobody edited
history — and which of the chain's invariants are actually load-bearing when someone tries?**

Full brief: [`specs/13-team-choice.md`](../../specs/13-team-choice.md).

## What it models

An honest **Sonder trail** is a list of events, each carrying four overlapping guards:

- `SIG` — a signature binding `(id, h, prev, seq, ts)` to the author's key.
- `HASH` — a content hash `h = H(payload)`.
- `CHAIN` — a `prev`-link forming an unbroken hash chain (one genesis; each `prev` = the
  id of the immediately preceding event).
- `SEQ` — strictly-increasing `seq` **and** non-decreasing `ts`.

A **verifier** enforces a *subset* of those four — because real systems ship weak verifiers
constantly (signature checks are expensive, chain walks get skipped under load, clock skew
is tolerated). We run four: `sig-only`, `hash+sig`, `chain+sig`, and `full`.

An **attack** mutates a clean trail. Two modifiers make it bite:

- **stitch** — a *naive* attacker leaves obvious breakage; a *sophisticated* one repairs
  every structural field it can (prev-links, hashes) and re-signs — but re-signing only
  produces a *valid* signature if the key is compromised.
- **keyCompromised** — outsider (no key; forged signatures fail `SIG`) vs **insider** (holds
  the signing key; `SIG` is blind, so only *structural* invariants can catch it).

The sweep crosses **5 attacks × 4 verifiers × outsider/insider × naive/stitched**, 40 seeded
trials/cell (varying which event is hit, author jitter, ts deltas). Ground truth is known —
every trail *is* forged — so a `clean` verdict is a **false-clean**: a silent forgery.

## Run it

```bash
npm run build
node experiments/13-audit-forgery/dist/main.js
```

Knobs (env): `FORGE_TRIALS`, `FORGE_SEED`, `FORGE_AUTHORS`, `FORGE_EVENTS`. Output is a JSONL
trace under `runs/`; the harness re-reads it with `readRunRecord()` and asserts event-count
parity across `spawn`/`message`/`score`/`kill`.

## What I observed

The detection matrix (fraction of trials each verifier flagged the forgery; `1.00` = always
caught, `0.00` = silent). This is the real run, nothing faked green:

| attack | key | stitch | sig-only | hash+sig | chain+sig | full |
|---|---|---|---|---|---|---|
| insert | outsider | naive | 1.00 | 1.00 | 1.00 | 1.00 |
| insert | insider | naive | **0.00** | **0.00** | 1.00 | 1.00 |
| drop | outsider | naive | **0.00** | **0.00** | 1.00 | 1.00 |
| drop | outsider | stitched | 1.00 | 1.00 | 1.00 | 1.00 |
| drop | insider | stitched | **0.00** | **0.00** | 0.94 | **0.94** |
| reorder | outsider | naive | **0.00** | **0.00** | 1.00 | 1.00 |
| backdate | insider | stitched | **0.00** | **0.00** | **0.00** | 1.00 |
| tamper-payload | outsider | naive | **0.00** | 1.00 | **0.00** | 1.00 |
| tamper-payload | insider | stitched | **0.00** | **0.00** | 1.00 | 1.00 |

Summary scores from the run:
`silentForgerySurface=27`, `overallBlindSpotRate=0.338`, `sigOnlyOutsiderCatchRate=0.70`,
`minVerifier{insert:1, drop:2, reorder:2, backdate:1, tamperPayload:2}`,
`insiderCaughtByFull=4, insiderLostByFull=1`.

Four findings fall out.

1. **"Trust the signature" is a 30%-blind verifier — even against outsiders with no key.**
   `sig-only` caught only **70%** of outsider forgeries (`sigOnlyOutsiderCatchRate=0.70`).
   The whole point of `SIG` is to stop an attacker who can't sign — yet a *sophisticated*
   outsider who drops/reorders and re-stitches the structural fields (leaving every surviving
   event's original valid signature intact) sails past `sig-only` at **1.00 clean**. `SIG`
   proves *each event was authored by its key-holder*; it says **nothing** about whether the
   set of events is complete or in order. Deletion and reordering need no forged signature at
   all — you're just rearranging validly-signed records. Signatures authenticate authorship,
   not *history*.

2. **Every attack has a different load-bearing invariant — there is no single "the important
   check".** The minimum sufficient verifier (outsider model) is different for every attack:
   insert and backdate fall to a 1-invariant verifier, but **payload tampering needs `HASH`**
   (`chain+sig` scores **0.00** — a chain-walking verifier that trusts signatures is *blind*
   to content forgery), **drop and reorder need `CHAIN`** (`hash+sig` scores **0.00** —
   hashing every payload tells you nothing about whether one went missing), and **backdate
   against an insider needs `SEQ`** and nothing else (`sig-only`/`hash+sig`/`chain+sig` all
   **0.00**, only `full`'s ts-monotonicity check catches it — 1.00). Drop your `SEQ` check to
   "save time" and an insider can rewrite the timeline of a perfectly-chained, perfectly-signed
   trail and no other invariant will ever notice.

3. **The silent-forgery surface is enormous: 27 of 80 (attack, verifier) cells are blind —
   a 33.8% blind-spot rate.** `silentForgerySurface=27`, `overallBlindSpotRate=0.338`. A
   third of all reasonable-looking verifier configurations pass at least some forged trail as
   *clean*. The danger isn't that forgeries are undetectable — the `full` verifier catches
   almost everything — it's that **partial verifiers fail silently and confidently**: they
   return a green `clean` verdict on a trail that has been edited. A Sonder deployment that
   ships anything short of `full` isn't "slightly less safe," it has specific, enumerable
   blind spots an attacker can aim at.

4. **A compromised key isn't game-over — structural invariants still bite (4 of 5 insider
   attacks caught by `full`) — but they have one real hole.** With the signing key,`SIG` and
   `HASH` are worthless (the insider re-signs and re-hashes freely), so only `CHAIN` + `SEQ`
   can defend. They hold up: insider insert, reorder, backdate, and tamper-payload are all
   caught at **1.00** by `full` (`insiderCaughtByFull=4`). The lone escape is **insider drop
   with a perfect re-stitch (0.94, `insiderLostByFull=1`)**: dropping an event and repairing
   the prev-link leaves a chain that walks cleanly and a `seq` that's still strictly
   increasing (a *gap* is still monotone!). It's caught 94% of the time only because our naive
   re-stitch fixes just the adjacent link and a downstream event still dangles — but when the
   attacker drops the tail-adjacent event, even that tell vanishes and `full` goes blind.
   **Deletion is the hardest forgery to detect** because a hash chain proves what's *present*
   is linked; it cannot prove nothing is *missing*.

## The Sonder lesson

Signatures authenticate *authorship*; they do not authenticate *history*. Three directives
fall out for Sonder. **First, the audit trail must always run the `full` verifier** — the four
invariants are non-substitutable, each is the *sole* guard against a specific attack class
(HASH↔tamper, CHAIN↔drop/reorder, SEQ↔backdate), so "we check signatures" is a 30%-blind
policy and any partial verifier is a named attack surface. **Second, defend against insiders
with structure, not secrets** — a compromised key nullifies SIG/HASH but CHAIN+SEQ still catch
4 of 5 insider forgeries, so the causal chain earns its keep exactly when key-based trust has
failed. **Third, deletion needs an out-of-band completeness guard** — a hash chain proves the
events it contains are linked and ordered but *cannot prove none were removed*; Sonder needs a
signed running count / Merkle-accumulator / high-water-seq attestation so a silently-dropped
event leaves a hole the chain itself can see. Every result here is real: a caught forgery and a
slipped one are both honest findings, and the one that slips (insider tail-drop) is the most
important thing this experiment learned.

## Live-LLM applicability (sim-only — honest)

**No genuine LLM seam.** The finding — signatures authenticate authorship but not history, the
four verifier invariants are non-substitutable, and deletion is the hardest forgery to catch —
is a property of *cryptographic structure* (hash chain, sequence numbers, signatures), not of
any agent's judgement. The forger and the verifier here are deterministic algorithms; there is
nothing an LLM "decides" that would change whether a dropped tail event leaves a detectable
hole — that is fixed by the chain's math. A model could *narrate* an attack, but the attack's
detectability is not a reasoning problem, so a live call would add cost and zero signal. Per the
honesty rule this stays a deterministic suite. The Sonder lesson (always run the `full`
verifier; defend insiders with CHAIN+SEQ structure; add an out-of-band completeness attestation)
rests on the suite.
