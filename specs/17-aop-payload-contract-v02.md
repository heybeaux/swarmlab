# Spec 17 — AOP v0.2: `payload_contract` in the Standard

> Upstream the exp-12 finding into the protocol. Sonder (the reference
> implementation) shipped typed payload contracts (`concept`+`unit`) and the retest
> killed silent corruption (0.908 → 0.00 miss rate, 0/960 corrupt escapes; see
> sonder PR #10 and swarmlab exp-12 "Retest: typed contracts"). AOP still says
> `"payload": Opaque action payload. Not interpreted by the spec.` — the envelope
> authenticates authorship and history, **nothing authenticates meaning**. That is
> a protocol gap, not an implementation detail.

## Repo

`https://github.com/heybeaux/aop` — no local checkout; clone to `~/dev/aop`.
Push as the `heybeaux` account (`gh auth switch --user heybeaux` if a push 404s).

## Versioning decision (settled)

Cut **`spec/v0.2/`** rather than widening v0.1. `aop_version` is a `const` that
consumers branch on; v0.1 stays frozen exactly as published. v0.2 = v0.1 + the
additions below, `aop_version: const "0.2"`.

## Changes

### 1. `spec/v0.2/agent-observation-event.schema.json`

Copy of v0.1 with:
- `aop_version`: `const "0.2"`; `$id` bumped to `/v0.2/`.
- New **optional** top-level `payload_contract` (sibling of `payload`), `$defs`
  aligned byte-for-byte in meaning with Sonder's shipped types
  (`packages/core/src/types/contract.ts` on branch `typed-payload-contracts`):

```jsonc
"payload_contract": { "$ref": "#/$defs/payload_contract" }

// $defs:
"field_contract": {
  "type": "object",
  "required": ["name", "wire", "concept", "unit"],
  "properties": {
    "name":    { "type": "string", "description": "Wire name — advisory only; allowed to differ between peers." },
    "wire":    { "enum": ["string", "int", "float", "bool", "enum"] },
    "concept": { "type": "string", "description": "Semantic concept ID (e.g. 'order.total.posttax'). Two fields match IFF concept AND unit match. Never inferred from name." },
    "unit":    { "type": "string", "description": "Unit as part of the type: 'cents_pretax', 'epoch_ms', 'epoch_s', 'none', ..." }
  },
  "additionalProperties": false
},
"payload_contract": {
  "type": "object",
  "required": ["contract_id", "fields"],
  "properties": {
    "contract_id":  { "type": "string", "description": "Stable hash of canonicalized fields." },
    "fields":       { "type": "array", "items": { "$ref": "#/$defs/field_contract" } },
    "stateful":     { "type": "boolean", "description": "Statefulness is a contract term, not an implementation detail (exp-11)." },
    "edge_regions": { "type": "array", "items": { "type": "string" }, "description": "Human-readable enumeration of cliffs/promos/thresholds probing cannot recover (exp-11)." }
  },
  "additionalProperties": false
}
```

- Update the `payload` description to: opaque to the spec, **but** when
  `payload_contract` is present it declares the semantic type of the payload's
  fields.

### 2. `spec/v0.2/agent_observation_event.proto`

Same additions in proto3 (`FieldContract`, `PayloadContract` messages, optional
`payload_contract` field on the event message), preserving v0.1 field numbers and
appending new ones — never renumber.

### 3. `spec/v0.2/semantic-conventions.md`

Copy v0.1 conventions and add a **"Payload contracts & negotiation semantics"**
section carrying the exp-12 rules as normative spec (the *semantics* are spec; the
negotiator implementation remains an implementation concern, same stance as
chain/signature):
- Match IFF `concept` AND `unit` are equal; wire-name equality contributes nothing.
- Same name + different concept ⇒ **`false_friend`** — MUST be surfaced/named,
  never silently mapped.
- Same concept + different unit ⇒ **`unit_mismatch`** — mappable only through an
  explicit declared conversion.
- Unmatched fields ⇒ **`unmapped`**.
- Implementations SHOULD report negotiation results using this mismatch taxonomy
  so results are comparable across implementations.
- Cite the evidence in one line (exp-12 retest: 0.908→0.00 falseFriendMissRate,
  0.845→0.00 worst-cell silent corruption) with a link to the swarmlab repo path.

### 4. `packages/aop-ts`

Mirror the v0.2 additions in the TypeScript package following its existing
structure/conventions (types + any schema re-exports/validators it already has).
Add/extend tests to the package's existing framework: a v0.2 event with a valid
`payload_contract` validates; a `field_contract` missing `unit` fails; a v0.1
event (no `payload_contract`) still validates against v0.1 unchanged.

### 5. `README.md` / `docs`

Minimal touch: note v0.2 exists and what it adds, one short paragraph + link to
the semantic-conventions section. Do not rewrite docs.

## Delivery

Branch `spec-v0.2-payload-contract` off `main`, commit early and often, push the
branch, and **open a PR to `main`** titled
`spec v0.2: payload_contract — authenticate meaning, not just authorship`.
PR body: what/why (exp-12 numbers, Sonder PR #10 as the reference implementation
already shipping it), the versioning rationale (v0.1 frozen), and a test-plan
checklist. This PR is authorized by Beaux (2026-07-05).

## Honesty rule

v0.1 artifacts are immutable — any diff to `spec/v0.1/**` is a spec violation.
Every claim in the PR body must trace to the committed swarmlab runs or Sonder
branch; never assert untested behavior.
