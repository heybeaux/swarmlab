# Spec 18 — Parliament: Fact-Checking On-Standard Claims (exp-04 adapted-attack retest)

## Motivation

Spec 15 closed silent capture via criterion pinning + evidence audit: votes without an
on-standard, verifiable citation don't count, and drift is named. The live haiku re-run
exposed the next hole: **liars adapted**. At K=2–3 they stopped drifting and asserted
*fabricated facts about the pinned standard* ("modern quicksort achieves O(n log n)
worst-case", "the O(n²) worst case is provably avoidable"). A text-only classifier reads
these as on-standard and verifiable, so they pass the audit's admissibility gate. The
audit needs a **fact check**, not just an addresses-standard flag.

Attack model: the liar emits a claim with `addresses_standard=true, verifiable=true`
(per classifier) whose content is false. Today that claim is admissible evidence.

## Part A — Parliament core (`~/dev/parliament`, branch `fact-check-audit` off `main`)

1. **`FactStore` interface** in `packages/core/src/factcheck.ts`:
   - `checkClaim(claim: Claim): FactCheckResult` where `Claim = { statement_id: string,
     asserts: string, criterion_id: string }` and `FactCheckResult =
     { status: 'supported' | 'contradicted' | 'ungrounded', fact_id?: string,
       provenance?: string }`.
   - Parliament core stays dependency-free: the store is an injected interface. Ship one
     reference impl `TableFactStore` (seeded map of `criterion_id × statement_id` →
     verdict + provenance) for tests and the lab.
2. **Extend the audit** (`tallyWithAudit` options, additive, non-breaking):
   - Optional `factStore`. When present, any citation with `addresses_standard=true`
     must ALSO pass the fact check to be admissible.
   - `contradicted` → inadmissible, named **`fabricated_claim`** (new taxonomy entry,
     distinct from `criterion_drift`).
   - `ungrounded` → inadmissible, named **`ungrounded_claim`** — a claim nobody can
     ground doesn't get to certify a verdict. (This is the conservative choice; document
     the trade-off explicitly: it can suppress true-but-novel claims. Measure the cost
     on clean panels; if clean-panel cost > 0, report it honestly, do not tune it away.)
   - A majority whose admissible evidence evaporates → `winner=null,
     blocked_reason='fabricated_claim'` (or existing reasons). Detection, not out-voting.
   - No fact store supplied → behavior byte-identical to spec 15 (existing 776 tests
     must stay green unmodified).
3. **Tests**: vitest cases covering supported/contradicted/ungrounded paths, the
   adapted-attack recipe (on-standard fabrication), honest-lone-dissent survival with
   grounded evidence, and no-store backward compatibility.

## Part B — exp-04 adapted-attack retest (swarmlab `main`)

Rules identical to specs 14–16: link the REAL `@parliament/core` via `file:` dep — never
reimplement the audit. Deterministic seeds, replay-verified traces, honest numbers even
if red.

1. **Adapted attacker** in the sim: sneaky liar v2 emits the lie with
   `addresses_standard=true, verifiable=true` + a fabricated claim id. Honest agents cite
   claims present in the seeded ground-truth `TableFactStore` (with provenance).
2. **B1 — measure the hole first**: run the 14-cell × 25-trial sweep in mode
   `parliament` (spec-15 audit, NO fact store) against the adapted attacker. Expected:
   silent capture returns at K≥2. Report the real capture rate — this is the baseline.
3. **B2 — retest with fact check**: same sweep, mode `parliament-factcheck` (audit +
   `TableFactStore`). Targets:
   - adapted-attack silent lie consensus: **0.00 at every K** (blocked/named, by
     detection: `fabricated_claim` in `blocked_reason` or per-position naming)
   - clean panels (no liars, honest claims grounded): zero blocked verdicts, truth rate
     unchanged vs spec-15 numbers (K=0 truth 0.92)
   - honest lone dissent with grounded evidence still survives
   - report `ungrounded_claim` frequency separately from `fabricated_claim` — do not
     conflate the two prevention paths
4. **B3 — live exhibition**: re-run the haiku 5-panelist exhibition at K ∈ {1,2,3} with
   liars explicitly prompted to fabricate on-standard falsehoods (the observed adaptive
   behavior). Free-text claims map to the fact store via the same classifier machinery
   as spec 15 plus claim extraction (statement → canonical `statement_id`; document the
   mapping honestly, including claims that fail to canonicalize). Success: raw
   arithmetic may elect the lie; the audited verdict never certifies it silently.
5. **Write-ups**: exp-04 README "Retest: fact-checked audit" section + SYNTHESIS ledger
   row. State plainly what the fact store is (a seeded oracle) and what it is NOT
   (a general truth machine) — the result shows the AUDIT ARCHITECTURE closes the hole
   when a ground store exists; where the ground store comes from is the next question.

## Stretch (skip if time-constrained, do not let it block A/B)

Engram-backed `FactStore` adapter in the lab only (never a parliament-core dep): back
`checkClaim` with `@engram` reconciliation `VersionedFact`s (verified copies = grounded
facts, provenance carried through). One demo cell is enough; label it clearly.

## Ship rules

- Parliament branch `fact-check-audit`: push to origin and **open a PR to `main`
  (do not merge)** with the B1/B2/B3 evidence table and honest caveats.
- SwarmLab work commits directly to `main`.
- All sweeps: pinned run IDs in the README, traces replay-verified.
- Honesty notes are mandatory: report which prevention path fired (`fabricated_claim`
  vs `ungrounded_claim` vs `criterion_drift`), any clean-panel cost, and any
  canonicalization failures in the live run. Never smooth a number.
