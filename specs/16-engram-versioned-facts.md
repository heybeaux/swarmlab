# Spec 16 — Engram Versioned Facts + Anti-Entropy & the Exp-08 Retest

> Third stack change driven by lab findings. Scope: (A) a versioned-fact +
> anti-entropy reconciliation module in `~/projects/engram`, (B) a retest harness in
> `swarmlab/experiments/08-rumor-mill` that measures whether the change heals
> early-hop corruption. **The retest number is the deliverable.**

## Why (findings this answers)

- **Exp 08 (36-cell sweep, deterministic sim):** in a gossip mesh, coverage and
  fidelity are *orthogonal* — every cell saturates (coverage ≥ 0.99,
  `saturationRate=1.00`), but **19 of 36 cells hit full coverage with sub-0.90
  fidelity** (`coverageOutrunsTruth=19`); worst cell (m=0.1, N=120) holds a typical
  version only **0.57 faithful**. Corruption radiates as a spatial gradient from
  the seed (`telephoneGradient=0.113`: near-hop 0.77 vs far-rim 0.54 at the noisy
  cell).
- **The villain is first-write-wins.** Sticky adoption freezes early-hop corruption
  permanently — a later, more accurate retelling is rejected as a duplicate.
- **Fidelity is governed by path length to first contact, not message volume** —
  higher fanout raises speed AND fidelity. Throttling gossip to "protect" a memory
  is exactly backwards.

Current gap in Engram: propagation without integrity — a memory mesh that tracks
only reach is blind to silent corruption. Nothing lets a node (a) *detect* that its
held copy has drifted from the origin write, or (b) *heal* from a neighbor holding
a verifiable copy.

## A. Engram change (`~/projects/engram`)

Branch `versioned-facts-anti-entropy` off current `staging` HEAD. The repo has
pre-existing uncommitted changes (several modified `src/**` files) — **never commit
or revert those**; commit only your own new/edited files. DO NOT push to any
remote — leave the branch local. Match existing repo conventions.

**Placement:** a new self-contained module (suggested `src/reconciliation/`,
builder may adjust to fit repo layout). The core logic MUST be pure TypeScript with
no NestJS/runtime dependencies, exported so an external harness can import it (via
the built output or a `file:` dep). If the repo's build doesn't produce an easily
importable artifact, add a minimal package/tsconfig path for this module — do not
restructure the app.

### A1. Versioned facts (new `versioned-fact.ts`)

```ts
export interface VersionedFact {
  fact_id: string;        // identity of the fact (what it's about)
  version: number;        // monotonically increasing at the ORIGIN only
  origin_id: string;      // who authored this version
  content: string;        // the payload (token string in the sim)
  digest: string;         // content-addressed integrity: hash(fact_id, version, origin_id, content)
}
export function makeVersionedFact(...): VersionedFact;
export function verifyFact(f: VersionedFact): boolean;   // digest recomputes & matches
```

Key property: **a hop-mutated retelling breaks the digest.** Integrity is a
property of the fact, not trust in the sender.

### A2. Reconciliation — kill first-write-wins (new `reconcile.ts`)

```ts
export type ReconcileOutcome = 'kept' | 'adopted' | 'healed' | 'rejected_corrupt';
export function reconcile(held: VersionedFact | null, incoming: VersionedFact): {
  result: VersionedFact | null; outcome: ReconcileOutcome;
};
```

Rules (each is one exp-08 finding inverted):
1. **Verifiable beats held.** If `incoming` verifies and `held` doesn't (or is
   absent), adopt — a later accurate write **heals** early-hop corruption instead
   of bouncing off a sticky first write.
2. **Higher version beats lower, only when verifiable.** Corrupt copies never
   overwrite verified ones regardless of version — `rejected_corrupt` is a named
   outcome, not a silent drop.
3. **Never adopt what fails verification when already holding a verified copy.**
   Corruption cannot re-infect a healed node.

### A3. Anti-entropy pass (new `anti-entropy.ts`)

```ts
/** Pairwise digest exchange: each side offers its held facts; both reconcile. */
export function antiEntropySync(a: Map<string, VersionedFact>, b: Map<string, VersionedFact>): {
  aHealed: number; bHealed: number; exchanged: number;
};
```

Periodic pairwise repair between neighbors — the mechanism that shortens the
*effective* path from every node to a verified copy (the exp-08 directive: push
fidelity by shortening paths, not damping spread).

### A4. Tests (match repo's existing test framework/layout)

Cover at minimum: (a) the exp-08 recipe — node adopts a corrupted early-hop copy,
later verifiable retelling **heals** it (`outcome='healed'`); (b) corrupt copy
never overwrites a verified one; (c) anti-entropy between a corrupted node and a
verified neighbor repairs the corrupted side and counts it; (d) digest breaks on
any single-token mutation; (e) higher verified version supersedes lower.

Build + tests for this module must be green. Commit early and often on the branch.

## B. Retest harness (`swarmlab/experiments/08-rumor-mill`)

### B1. `engram` mode

Add an `ADOPTION=engram` mode alongside the first-write-wins baseline that **links
the real Engram reconciliation module** (`file:` dep on the built output or pnpm
link — never reimplement reconcile/anti-entropy in the lab). Wiring: the seed
authors the fact as a `VersionedFact`; per-hop mutation corrupts `content` without
recomputing `digest` (a retelling, not a new authorship — this is the honest model
of drift); each receiving node runs `reconcile`; every gossip round is followed by
one anti-entropy pass over each live edge (or a documented budgeted subset). Any
deviation must be stated in the README.

### B2. Sweep + success criteria (exact)

Re-run the identical 36-cell sweep (same grid, same seeds) in both modes.
Before/after table against the committed baseline:

| metric | baseline (first-write-wins) | target (engram mode) |
|---|---|---|
| `coverageOutrunsTruth` (cells at full coverage, fidelity < 0.90) | 19 / 36 | **0 / 36** |
| worst-cell typical fidelity at saturation | 0.57 | **≥ 0.99** |
| `telephoneGradient` (near-hop − far-hop fidelity) | 0.113 | **≤ 0.01** |
| coverage / `saturationRate` | 1.00 | **no regression** |

Fidelity must reach the target **by healing** (report `healedNodes` and
`rejectedCorrupt` per cell from the real module's outcomes), not by damping spread
— time-to-saturation may not regress by more than 1 round vs baseline at any cell
(anti-entropy adds repair, not throttling; report the TTS delta per cell).

### B3. Write-ups

Update exp-08 README with a "Retest: versioned facts + anti-entropy" section (full
before/after table, run IDs, healing accounting), and append to the "Retest ledger"
in `SYNTHESIS.md` (mirror the exp-12 entry format). Commit to swarmlab main
(`runs/*.jsonl` gitignored — intentional).

## Honesty rule

If the retest misses the criteria, commit the real numbers and say so plainly in
the README/SYNTHESIS — a red retest is a finding, not a failure. Never fake or
smooth a result. Every metric must be computed from executed runs, not asserted.
