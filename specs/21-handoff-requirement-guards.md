# Spec 21 — Handoff Requirement-Survival Guards (exp-16)

> New experiment (not a retest). Scope: `swarmlab/experiments/16-handoff-guards/`.
> Directly extends exp-14 Part A. One question: exp-14 refuted the seam hypothesis
> — the dominant loss in deep delegation trees is **silent omission** (a
> requirement is dropped at a handoff and nobody notices), not sibling integration
> mismatch. If the loss is silent, a cheap **handoff guard** — a manifest of
> requirements carried and checked across each hop — should catch drops at the seam
> that introduced them. Does it recover survival, and at what token cost?
> **Requirement-survival recovery at deep cells (d≥3), against the un-guarded
> exp-14 baseline, is the deliverable.**

## Why (the gap this fills)

- exp-14 Part A swept delegation depth d ∈ {0..4} × branching b ∈ {1..4} over 20
  machine-verifiable requirements under exp-01-calibrated handoff noise. Survival
  fell 1.00 → 0.33 (d0 → d4).
- The verdict **refuted H-A's seam clause**: silent omission (dropped requirements)
  is ~50% of deep-tree loss; sibling integration seams only ~21%. The live Haiku
  d3b3 tree reproduced the signature exactly — 7/7 losses were drops, at 9.3× cost.
- This changes the fix. If the loss were integration seams, you'd need schema
  reconciliation between siblings (expensive, exp-12 territory). But **drops are
  detectable at the hop that drops them** with a requirement manifest — the brief
  writer lists what must survive; the receiver checks its inbound brief against the
  manifest and flags anything missing before doing work. Cheap, local, no
  cross-sibling coordination.
- Nothing in exp-00…15 tests a **handoff-level survival guard**. This is the direct
  stack action item from Part A: our delegation harness should carry and verify a
  requirement manifest across hops, not just route trust.

Hypotheses to test, stated before running:
- **H-D1:** a requirement-manifest guard at each handoff recovers deep-cell
  survival (d≥3) substantially toward the d0 baseline — because drops (the
  dominant loss) are exactly what a manifest catches.
- **H-D2:** the guard's recovery is **concentrated on drops, not reinterpretations**
  — a manifest catches *absence* cheaply but a present-but-wrong requirement
  (numeric perturbation) passes a presence check. Catching reinterpretation needs a
  value-echo check, which costs more; report the two guard tiers separately.
- **H-D3:** guard token cost is sub-linear in the recovered survival — i.e. the
  guard pays for itself well before it doubles cost, at least through mid-depth
  (d≤3). If it costs more than it saves at deep cells, say so.

## Setup — inherit exp-14 Part A, add a guard tier

Same task (one config artifact, N=20 requirements — 12 unary, 8 relational, 28
keys, `experiments/14-delegation-decay/src/task.ts`), same exp-01-calibrated
handoff noise model (`src/decay.ts`: drop w.p. 0.08/hop, numeric perturb w.p.
0.15/hop), same 20-cell sweep, **same seeds** so guarded vs un-guarded is
comparable cell-for-cell. ≥25 seeded trials/cell.

## Guard tiers (arms, same seeds across all)

1. **Un-guarded (control)** — exp-14 Part A exactly. Reproduces the RT-05 Part A
   survival curve; the comparison baseline.
2. **Presence manifest** — each handoff carries a manifest of requirement IDs the
   sub-brief must satisfy. The receiver checks its inbound brief covers every ID on
   the manifest; a missing ID is flagged and back-filled from the manifest before
   work proceeds. Catches **drops**. Cheap (ID set diff, no value inspection).
3. **Value-echo manifest** — manifest carries `(id, expected-value-digest)` per
   requirement; receiver echoes back the value it parsed and the sender verifies
   the echo matches before accepting the hop. Catches drops **and**
   reinterpretations (numeric perturbation). More expensive (one echo round-trip
   per hop).

The guard is **harness-level and deterministic** — no LLM judges whether a
requirement survived; the manifest check is a set/digest comparison. This keeps the
"no LLM judging success" rule from specs 14–19.

## Live exhibition

One Haiku run at (d=3, b=3) under each guard tier, mirroring exp-14's live d3b3
tree. exp-14 showed 7/7 real-model losses were drops at that cell — the presence
manifest should catch most of them. Exhibition, not evidence (same rule as exp-04).

## Metrics (per cell, per guard tier)

| metric | definition | H-D expectation |
|---|---|---|
| `requirementSurvival` | fraction of 20 criteria satisfied in assembled result | guard 2/3 ≫ control at d≥3 |
| `dropRecovery` | dropped requirements caught-and-restored / total dropped | guard 2 high, guard 1 = 0 |
| `reinterpretRecovery` | perturbed requirements caught / total perturbed | **guard 3 only**; guard 2 ≈ 0 (H-D2) |
| `guardTokenCost` | tokens spent on manifests/echoes vs control | sub-linear in recovery (H-D3) |
| `netTokenEfficiency` | (survival gained) per (extra token spent) | > 1 through d≤3 (H-D3) |
| `falseFlagRate` | manifest flags on requirements that were actually fine | should be ~0 (guard must not thrash) |

Report the survival-vs-depth curve for all three tiers on one plot. The headline is
the **gap between guard 2 and guard 3** at deep cells: it isolates how much of the
recoverable loss is drops (cheap to fix) vs reinterpretations (expensive to fix).

## Rules (same as specs 14–20)

- Reuse exp-14 Part A's task/decay/scoring modules directly (`file:`/relative
  import — do not fork them); only the guard logic is new lab code. If exp-14
  internals need a small refactor to expose the manifest hook, keep it minimal and
  note it.
- Deterministic, seeded, replay-verified traces; run IDs pinned in the README.
- Same seeds as exp-14 Part A so the control arm reproduces the RT-05 Part A curve
  exactly — if it doesn't, stop and reconcile before trusting the guarded arms.
- Honest numbers even if red. If the value-echo guard (tier 3) costs more than the
  survival it buys at deep cells, report the crossover depth plainly — the
  recommendation may be "presence manifest everywhere, value-echo only at d≤2".
- No external package needed unless the manifest naturally maps onto an existing
  stack contract (e.g. AOP typed payloads, spec 17) — if so, link it via `file:`
  dep rather than reinventing a manifest format, and say which.
- Writeups: exp README + SYNTHESIS.md entry (RT-07) + JOURNAL.md.

## Deliverables

1. `experiments/16-handoff-guards/` — harness, all three guard tiers.
2. Control-arm reproduction of exp-14 Part A survival curve (proof the comparison
   is fair).
3. Survival-vs-depth curves for all tiers + the drop/reinterpret recovery
   breakdown + guard cost tables.
4. Verdict on H-D1, H-D2, H-D3 — each explicitly confirmed or refuted.
5. A one-paragraph **stack recommendation**: where in the real delegation path
   (sonder/lattice handoff, or the AOP payload contract) a requirement manifest
   should live, which tier (presence vs value-echo) to default to, and at what
   depth the value-echo cost stops being worth it.
