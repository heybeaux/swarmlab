# Spec 20 — Trust Routing with Forgiveness & Decay (exp-15)

> New experiment (not a retest). Scope: `swarmlab/experiments/15-trust-forgiveness/`.
> Directly extends exp-14 Part B. One question: the exp-14 capability store proved
> memory *persists* trust — but its exclusion rule is unforgiving, permanently
> benching capable workers that hit an early transient failure. Does a forgiving
> trust policy (decay + probation) recover those workers **without** re-opening the
> door to the genuinely incapable delegate?
> **The `capableExcluded` recovery number, held against a flat incapable-selection
> rate, is the deliverable.**

## Why (the gap this fills)

- exp-14 Part B (RT-05) confirmed H-B2: an Engram-backed root converges to ~0
  incapable selections, survives a root restart, and transfers to a brand-new root
  at 100% avoid. That result stands and is not re-litigated here.
- exp-14 Honesty Note (2) surfaced the open cost: the shared exclusion rule
  `r.failures <= r.successes` (`experiments/14-delegation-decay/src/trust.ts:126`)
  permanently benches **~0.22 capable workers/trial** that fail early under the
  environment's transient-failure draw (`P_CAPABLE_TRANSIENT_FAIL`). A worker that
  fails round 1 by bad luck can never climb back — `failures > successes` forever
  if it's never retried.
- Real fleets cannot afford this. Capacity is scarce; a trust router that
  permanently blacklists a good worker on one flaky round is its own failure mode.
  The RT-05 writeup explicitly names it: "a production trust router needs
  decay/forgiveness on top of persistence."

Hypotheses to test, stated before running:
- **H-C1:** a forgiveness policy (see arms) recovers the capable-but-benched
  workers — `capableExcluded` drops toward ~0 by end of run — while keeping the
  late incapable-selection rate statistically indistinguishable from exp-14's
  unforgiving store (**≤ 0.05**, no regression).
- **H-C2:** naive time-decay alone (forget old failures) recovers capable workers
  **but** lets the incapable delegate leak back in — it forgets the real signal
  too. Evidence-weighted probation (retry-with-quarantine) beats it: recovers
  capable workers without the leak.
- **H-C3:** the forgiveness advantage is larger under **confident-wrong** failures
  than **loud** — a good worker's transient confident-wrong failure looks
  identical to the incapable agent's steady-state failure, so the policy that
  distinguishes them by *retry evidence* (not failure count) wins by more.

## Setup — inherit exp-14 Part B, change only the eligibility policy

Same worker pool of 6, same planted incapable agent (`mercury` fails
`quota-policy`), same `loud` / `confident-wrong` sub-arms, same
`P_CAPABLE_TRANSIENT_FAIL` environment draw, **same seeds and same round
sequence** as exp-14 so results are directly comparable cell-for-cell. R=30
sequential rounds. The Engram capability store (`@openengram/reconciliation` via
`file:` dep, NEVER reimplemented) still records every outcome as a provenance-tier
`VersionedFact`; only the **read-side eligibility function** changes.

## Arms (same seeds across all)

1. **Unforgiving (control)** — exp-14's exact rule: `failures <= successes`. This
   is the RT-05 baseline; re-run here so the comparison is in one table.
2. **Time-decay** — failures older than a window (or exponentially down-weighted by
   round age) stop counting. Recovers workers by *forgetting*. Expected to leak
   (H-C2).
3. **Probation / retry-quarantine** — a worker that crosses the failure threshold
   is not permanently benched; it enters **probation**: excluded from the normal
   pool but periodically retried (1 probe every K rounds). Probation outcomes are
   themselves recorded as facts. A worker that passes its probe returns to the
   pool; one that keeps failing stays out. Recovers capable workers by *evidence*,
   not by forgetting. Expected to win (H-C2/H-C3).
4. **Evidence-weighted** *(optional, if arms 2–3 don't cleanly separate)* — weight
   each failure by its `verification_tier` / evidence digest so a provenance-tier
   confirmed failure counts more than a loud transient one. Tie-breaker arm.

Incapability stays **planted and controlled** (harness handicap), so ground truth
of "who is capable" is known every round — `capableExcluded` and
`incapableSelected` are both computable exactly.

## Probes (run on all arms for contrast)

- **Reset test:** kill/restart the root between rounds 15/16 (as exp-14). Probation
  state lives in the store, so arm 3 must resume probation correctly post-reset —
  verify a worker mid-probation is not silently re-admitted or re-blacklisted.
- **Transfer test:** at round 30 a brand-new root reads the store. Confirm the
  forgiveness policy still yields 100% incapable-avoid transfer (no regression on
  the exp-14 deliverable) AND does not blanket-readmit everyone.

## Metrics

| metric | target (arm 3) | control (arm 1) |
|---|---|---|
| `capableExcluded` (capable workers benched/trial, end of run) | **→ 0** | ~0.22 (exp-14) |
| late incapable-selection rate, rounds 25–30 | **≤ 0.05** (no regression) | ≤ 0.05 |
| capable-worker recovery latency (rounds from bench to re-admit) | reported | never (∞) |
| incapable **leak** rate (times mercury re-enters pool after exclusion) | **0** | 0 |
| wasted tokens on probation probes (cost of forgiveness) | plateaus | n/a |
| post-reset probation continuity (mid-probation worker handled correctly) | yes | n/a |

The headline is the **joint** result: `capableExcluded → 0` AND
`incapableSelection ≤ 0.05` in the same arm. Either alone is trivial (readmit
everyone / bench everyone); the deliverable is recovering capable workers *without*
the leak. Report loud vs confident-wrong separately (H-C3).

## Rules (same as specs 14–19)

- Real packages via `file:` dep; the lab never reimplements stack logic. Only the
  eligibility function is new lab code — the reconciliation substrate is untouched.
- Deterministic, seeded, replay-verified traces; run IDs pinned in the README.
- Same seeds/environment as exp-14 Part B so the control arm reproduces RT-05's
  numbers exactly — if it doesn't, stop and reconcile before trusting the new arms.
- Honest numbers even if red. If time-decay (arm 2) does NOT leak, say so and drop
  H-C2. If probation buys recovery only at a large probe-token cost, report the
  cost plainly — forgiveness is not free.
- Engram work (if the probation-state fact shape needs a helper) goes on a local
  branch off `staging`, never pushed without explicit instruction.
- Writeups: exp README + SYNTHESIS.md entry (RT-06) + JOURNAL.md.

## Deliverables

1. `experiments/15-trust-forgiveness/` — harness, all arms, both sub-arms.
2. Control-arm reproduction of exp-14 RT-05 numbers (proof the comparison is fair).
3. Arm comparison table: `capableExcluded` recovery vs incapable-selection/leak,
   with reset + transfer probes, loud vs confident-wrong.
4. Verdict on H-C1, H-C2, H-C3 — each explicitly confirmed or refuted.
5. A one-paragraph **stack recommendation**: which eligibility policy the real
   Engram-backed trust router (lattice / sonder delegation path) should adopt, and
   what the probation parameters (threshold, probe cadence) should default to.
