# Spec 14 — Sonder Typed Payload Contracts (`concept` + `unit`) & the Exp-12 Retest

> The first stack change driven by lab findings. Scope: (A) a typed payload-contract
> layer in `~/dev/sonder` `packages/core`, (B) a retest harness in
> `swarmlab/experiments/12-schema-negotiation` that measures whether the change
> actually kills silent corruption. **The retest number is the deliverable.**

## Why (findings this answers)

- **Exp 12:** refereeless schema negotiation converges fast and unanimously on
  *false friends* — same wire name, different meaning. Sim: 91% of injected false
  friends uncaught; silent corruption up to 84.5% of agreed fields at 100% reported
  agreement. Units traps (`created` ms-vs-sec, `total` pre-vs-post-tax) are
  byte-identical and **uncatchable in principle** from the wire surface.
- **Exp 11:** black-box probing cannot recover edge regions (gap 0.894 at any
  budget) and self-poisons on stateful targets (live: accuracy peaks at budget 6,
  collapses by 24). Contracts must *state* what probing can't find.
- **Exp 07:** parse rate 1.0 while semantics diverge — syntax validation is not
  contract validation.
- **Exp 13:** verifier invariants are non-substitutable; partial checking is a
  named attack surface.

Current gap in Sonder: `SonderEventCore.payload: unknown`
(`packages/core/src/types/event.ts:165`). The envelope authenticates authorship
and history; **nothing authenticates meaning.**

## A. Sonder change (`~/dev/sonder`, `packages/core`)

### A1. Contract types (new file `packages/core/src/types/contract.ts`)

```ts
/** Semantic identity of a field. Registry-scoped, never inferred from name. */
export interface FieldContract {
  /** Wire name — allowed to differ between peers. */
  name: string;
  /** Physical wire type. */
  wire: 'string' | 'int' | 'float' | 'bool' | 'enum';
  /**
   * Semantic concept ID, e.g. 'order.total.posttax', 'order.created'.
   * Two fields match IFF concept AND unit match. Names are advisory only.
   */
  concept: string;
  /** Unit as part of the type: 'cents_pretax' | 'cents_posttax' | 'epoch_ms' | 'epoch_s' | 'none' | ... */
  unit: string;
}

export interface PayloadContract {
  contract_id: string;          // stable hash of canonicalized fields
  fields: FieldContract[];
  /**
   * Exp-11 directives: statefulness and edge regions are contract terms,
   * not implementation details.
   */
  stateful?: boolean;
  edge_regions?: string[];      // human-readable enumeration of cliffs/promos/thresholds
}
```

### A2. Negotiation as type-checking (new file `packages/core/src/contract.ts`)

```ts
export interface ContractMatch { a: FieldContract; b: FieldContract; }
export interface ContractMismatch {
  kind: 'false_friend' | 'unit_mismatch' | 'unmapped';
  a?: FieldContract; b?: FieldContract; reason: string;
}
export interface NegotiationResult {
  matches: ContractMatch[];       // concept+unit equal — safe to map
  mismatches: ContractMismatch[]; // every collision is NAMED, not silent
  ok: boolean;                    // true iff no false_friend / unit_mismatch
}
export function negotiateContracts(a: PayloadContract, b: PayloadContract): NegotiationResult;
```

Rules (each is one exp-12 finding inverted):
1. **Match on `concept`+`unit` equality only.** Wire-name equality contributes
   *nothing* to confidence.
2. **Same name + different concept ⇒ `false_friend` mismatch** — surfaced at
   handshake, never mapped.
3. **Same concept + different unit ⇒ `unit_mismatch`** — mappable only through an
   explicit registered conversion (out of scope for v1: just refuse).
4. Deterministic, pure, no LLM in the loop — this is the referee exp-12 lacked.

### A3. Envelope integration (minimal, backward-compatible)

- Add optional `payload_contract?: PayloadContract` to `SonderEventCore`.
- No change to chain/signature semantics; existing rows remain valid (mirrors the
  `outcome`/`resources` Phase-3.5 pattern already in the file).
- `contract_id` = sha256 of canonicalized fields (reuse the existing canonicalize
  helper used for `chain_self_hash`).

### A4. Tests (`packages/core/src/__tests__/contract.test.ts`)

- The three exp-12 false-friend recipes verbatim: `total` (pretax/posttax), `id`
  (order-string/customer-int), `created` (ms/s) — all must surface as named
  mismatches, zero mapped.
- Honest renames (`grandTotal`/`total_due`, same concept+unit) must match.
- Property: `negotiateContracts(a,b)` symmetric in match/mismatch content.
- Follow repo conventions (vitest per existing `__tests__`, pnpm workspace).

## B. Retest harness (`swarmlab/experiments/12-schema-negotiation`)

### B1. New mode `sonder` alongside `naive`

- `src/sondermode.ts`: same schema generator, same sweep (overlap × falseFriends,
  40 trials/cell), same metrics — but mapping produced by `negotiateContracts`
  with each side's hidden `concept` transmitted as a `FieldContract`.
- Import the real code: link `@heybeaux/sonder-core` (pnpm link or file dep to
  `~/dev/sonder/packages/core`). **Do not reimplement the matcher in the lab** —
  the retest must exercise the shipped function.
- Trace through `core/` (spawn/bus/score/trace) like every other experiment;
  `meta` event records `mode='sonder'` + sonder commit SHA.

### B2. Success criteria (the retest number)

| metric | naive baseline (committed) | required with contracts |
|---|---|---|
| falseFriendMissRate | 0.908 | **0.00** (all named at handshake) |
| silentCorruption (worst cell) | 0.845 | **0.00** |
| honest-rename match rate | high | no regression (≥ naive) |

Silent corruption must reach 0 **by detection** (mismatches named in the result),
not by refusal-to-agree — report `mismatchesNamed / falseFriendsInjected = 1.0`.

### B3. README + SYNTHESIS update

- Extend exp-12 README with a "Retest: typed contracts" section — before/after
  table, run IDs.
- Append a "Retest ledger" section to `SYNTHESIS.md`: finding → change → measured
  delta. This is the "we learned something useful" receipt.

## Constraints

- **Only agents write code** (TEAM.md prime rule).
- Sonder work lands on a branch `typed-payload-contracts` in `~/dev/sonder` —
  **do not push to remote; leave the branch local for Beaux's review.** Swarmlab
  work commits directly to swarmlab main as established.
- Commit early and often (session watchdog aborts long blocking runs).
- Honesty rule: if the retest does NOT hit the success criteria, report the real
  number — a red retest is a finding, not a failure.

## Definition of Done

1. `packages/core` builds + tests green in `~/dev/sonder` on the branch.
2. Exp-12 `sonder` mode runs the full sweep, trace replay-verified.
3. Before/after table committed in exp-12 README and SYNTHESIS.md retest ledger.
4. A short report: files touched, run IDs, the three metric deltas.
