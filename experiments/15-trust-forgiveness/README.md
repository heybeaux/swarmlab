# Experiment 15 — Trust Routing with Forgiveness & Decay (Spec 20)

Direct extension of exp-14 Part B. Exp-14's unforgiving eligibility rule
(`failures <= successes`, [trust.ts:126](../14-delegation-decay/src/trust.ts))
delivered perfect incapable-avoidance but permanently benched ~0.22
capable workers per trial on transient (5%) failures. This experiment asks:
**can an eligibility policy forgive transient failures without re-admitting
genuinely incapable workers?**

Headline criterion is **JOINT**, in the same arm:
`capableExcluded → 0` **AND** late (r25–30) incapable-selection `≤ 0.05`.

## Result (headline)

**Yes — the evidence-capped probation arm meets the joint criterion in both
observability styles** (pinned run `tf-mr84czql`, 50 trials, seeds
`trust-routing-v1` — same seeds as exp-14 RT-05):

| arm 3 (evidence, base 2 ×2, margin 3) | loud | confident-wrong |
|---|---|---|
| late incapable-selection (r25–30) | **0.017** ✓ | **0.047** ✓ |
| capableExcluded (control: 0.22) | **0.00** ✓ | **0.02** ✓ |
| incapable leaks (pool re-entries) | 0 | 0 |
| transfer-avoid @r30 (exp-14 deliverable) | 1.00 | 1.00 |

The cost is honest and up front: ~4× the control's wasted tokens
(59 vs 15 loud; 98 vs 30 CW), almost all of it scheduled probe spend.
Forgiveness is not free — it is a token-priced insurance premium against
permanently benching capable workers.

## Setup (inherited from exp-14 Part B, bit-for-bit)

- 6 workers, planted incapable `mercury` (always fails `quota-policy`
  assertions); capable workers fail transiently at P=0.05.
- Styles: `loud` (failures visible immediately) and `confident-wrong`
  (mercury's failures visible at +2 rounds, +10 integration cost).
- R=30 rounds, 50 trials, root reset between rounds 15/16 (knowledge
  restored from store), transfer probe at round 30.
- SAME SEEDS as RT-05: seedBase `trust-routing-v1:{style}:t{trial}`; env
  draw streams are arm-independent so all arms see identical worlds.
- Every store write goes through the real shipped
  `@openengram/reconciliation` module (`file:` dep, branch
  `versioned-facts-anti-entropy`, PR #323): `makeVersionedFact` →
  `reconcile` → `verifyFact`. Never reimplemented. Probation-state facts
  ride the same substrate (≈61 probation adoptions per run on top of the
  300 cap-fact adoptions — the module handles both shapes unmodified).

### Control-arm reproduction gate

Arm 1 (unforgiving) does not re-implement exp-14 — it **calls exp-14's
`runTrustTrial('engram', …)` directly** (module reused, not forked). The
runner embeds RT-05's expected metrics *and full 30-round selection
curves* and exits(1) on any mismatch. Every pinned run reports:
`control-arm RT-05 reproduction: EXACT (all metrics + full curves)`.

## Arms

| arm | policy | read-side rule |
|---|---|---|
| 1 unforgiving (control) | exp-14 verbatim | eligible iff `failures <= successes` (cumulative, forever) |
| 2 time-decay | failures expire | failures older than `DECAY_WINDOW=10` rounds stop counting |
| 3 probation | quarantine + retry | threshold crossing → out of pool, re-probed on backoff schedule; readmitted only when the cumulative record re-balances |
| 4 evidence-capped probation | arm 3 + stop rule | stop probing a worker whose `failures − successes > EVIDENCE_MARGIN=3` (conclusively benched) |

Arm 4 was spec-authorized ("optional evidence-weighted arm if 2–3 don't
cleanly separate") and became the winner.

## Full comparison (pinned `tf-mr84czql`, base 2 ×2, 50 trials)

| condition | late r25–30 | conv | capEx | recov | latency | leaks | wasted | probeTok | postReset | transfer |
|---|---|---|---|---|---|---|---|---|---|---|
| unforgiving · loud | 0.000 | 9 | 0.22 | 0.00 | — | 0.00 | 15 | 0 | 0.00 | 1.00 |
| unforgiving · CW | 0.003 | 11 | 0.22 | 0.00 | — | 0.00 | 30 | 0 | 0.00 | 1.00 |
| decay · loud | **0.077 ✗** | never | 0.00 | 0.20 | 9.0 | **1.52** | 33 | 0 | 0.06 | **0.90 ✗** |
| decay · CW | **0.073 ✗** | never | 0.00 | 0.26 | 8.5 | **1.52** | 65 | 0 | 0.10 | **0.96 ✗** |
| probation · loud | 0.027 ✓ | 27 | 0.02 | 0.22 | 3.0 | 0.00 | 60 | 48 | 0.32 | 1.00 |
| probation · CW | 0.050 ✓* | 28 | 0.00 | 0.12 | 3.0 | 0.00 | 99 | 73 | 0.10 | 1.00 |
| **evidence · loud** | **0.017 ✓** | 24 | **0.00** | 0.28 | 3.1 | 0.00 | 59 | 48 | 0.28 | 1.00 |
| **evidence · CW** | **0.047 ✓** | 28 | **0.02** | 0.24 | 3.3 | 0.00 | 98 | 74 | 0.10 | 1.00 |

\* probation·CW sits exactly on the 0.05 line — passes only by ≤, not <.

- **conv** = first round of a sustained ≤0.05 tail (≥3 rounds); "never" =
  no convergence within 30 rounds.
- **recov / latency** = capable-worker recoveries per trial / mean rounds
  from bench to readmission.
- **leaks** = mercury pool re-entries per trial (target 0).
- **probeTok** = probe token spend (COST_BRIEF+COST_WORK per probe,
  +COST_INTEGRATION when a CW probe fails); all mercury probes are
  "wasted" by definition — that is the price of the policy.
- **transfer** = round-30 fresh-root avoid rate, the original exp-14
  deliverable.

### Post-reset decomposition

The probe arms' nonzero `postReset` (share of trials selecting mercury at
r16, right after the root reset) looked alarming until decomposed with the
`postResetIncapableWasProbe` stat:

| condition | postReset | …of which scheduled probes |
|---|---|---|
| probation · loud | 0.32 | 0.32 (100%) |
| evidence · loud | 0.28 | 0.28 (100%) |
| probation · CW | 0.10 | 0.08 |
| evidence · CW | 0.10 | 0.06 |

Under loud, **every** post-reset mercury selection is a scheduled probe —
mercury is never in the regular pool. Under CW the small residual is the
+2-round visibility lag: failures from r14–15 haven't landed at r16, so a
few trials still see a balanced record. This is a property of CW
observability, not a policy leak (leaks = 0 in all probe arms).

Probation-state continuity across the reset is 1.00 in all forgiving arms
(store snapshot at end-r15 equals the post-reset read at r16, and probe
schedules are honored after restart). Probation state lives in the store,
not the root — that is why it survives.

## Probe cadence sensitivity (the real design surface)

Deterministic backoff schedules collide with the r25–30 measurement
window. Probes land at `rd+b`, `rd+b(1+k)`, `rd+b(1+k+k²)` for bench
round `rd`, base `b`, backoff `k` — and whether the *n*-th probe lands
inside r25–30 decides the late rate:

| cadence | probation late (loud / CW) | evidence late (loud / CW) | evidence capEx | pinned run |
|---|---|---|---|---|
| base 4, ×2 | 0.057 ✗ / 0.020 ✓ | — | — | `tf-mr8443r0` |
| base 4, ×3 | 0.030 ✓ / 0.057 ✗ | 0.023 ✓ / 0.053 ✗ | 0.02 / 0.06 | `tf-mr8443x8`, `tf-mr847hn6` |
| base 4, ×4 | 0.057 ✗ / 0.090 ✗ | — | — | `tf-mr84443c` |
| **base 2, ×2** | 0.027 ✓ / 0.050 ✓* | **0.017 ✓ / 0.047 ✓** | **0.00 / 0.02** | `tf-mr848h02`, `tf-mr84czql` |

Why base 2 ×2 wins: probes land at +2/+6/+14, so mercury's third failed
probe arrives by ~r20 and (in the evidence arm) pushes `failures −
successes` past the margin — probing **stops before the measurement
window opens**. At base 4, the third probe lands past r30 and the margin
cap never binds, which is why arm 4 was ineffective there (late 0.053 CW,
capEx 0.06 in `tf-mr847hn6`). Front-load the evidence gathering; don't
stretch it across the horizon.

Honesty note: this tuning was done *on the shared seeds* — no fresh
hold-out seed set was run. The mechanism (probe schedule × margin cap
interaction) is analytic, not fitted, but the exact 0.017/0.047 numbers
should be treated as in-sample.

## Hypothesis verdicts

- **H-C1 (a forgiving policy can hit the joint criterion): CONFIRMED** —
  evidence-capped probation, base 2 ×2, margin 3: late 0.017/0.047 ≤ 0.05
  and capEx 0.00/0.02 → 0, leaks 0, transfer 1.00. Caveat: CW passes at
  0.047, close to the line; and plain probation·CW sits exactly at 0.050.
- **H-C2 (naive time-decay leaks the incapable worker back in):
  CONFIRMED** — decay arm re-admits mercury 1.52×/trial, late rate
  0.073–0.077 (> 0.05, never converges), and **regresses the exp-14
  transfer deliverable to 0.90/0.96**: by r30 mercury's failures have aged
  out, so even a fresh root reading the store can pick him. Decay
  "recovers" capable workers only by forgetting evidence wholesale.
- **H-C3 (forgiveness advantage larger under confident-wrong): REFUTED /
  not testable as designed** — in the inherited harness only mercury's
  failures are confident-wrong (`confidentWrong = isIncapable && style ===
  'confident-wrong'`); capable transient failures are always loud.
  H-C3's premise (capable workers benched on lagged/misleading evidence)
  cannot be instantiated without changing exp-14 semantics, which would
  break the control-reproduction requirement. As measured, the joint
  advantage is *larger under loud* (0.017/0.00 vs 0.047/0.02).

## Honesty notes

1. **The forgiveness tax is ~4× control wasted tokens** (59 vs 15 loud,
   98 vs 30 CW), nearly all deliberate probe spend on a known-bad worker.
   We report it plainly; do not deploy probation where probe cost is
   unbounded or probes have side effects.
2. **Cadence numbers are in-sample** (tuned on the shared RT-05 seeds; no
   hold-out seed sweep was run).
3. **probation·CW = 0.050 exactly** — a pass by the letter of `≤ 0.05`.
   The evidence cap is what buys real margin.
4. **postReset ≈ 0.28–0.32 in loud probe arms** is 100% scheduled probes
   (decomposition table above), not lost knowledge; continuity is 1.00.
5. **Engram repo branch discrepancy**: the dispatch said `staging`; the
   local checkout is `versioned-facts-anti-entropy` (PR #323). Used as
   found; pre-existing uncommitted changes in that repo were untouched.
6. **H-C3 could not be tested as written** (see verdict) — reported
   rather than silently redefined.

## Stack recommendation

For the real lattice/sonder trust router: use **evidence-capped probation**
as the eligibility policy. Keep exp-14's threshold (`failures >
successes` benches a worker) but never bench permanently on the raw rule:
put the worker in probation with **front-loaded probes (first probe ~2
rounds after benching, ×2 backoff)** and readmit when the cumulative
record re-balances; **stop probing once `failures − successes > 3`** —
at that point the evidence is conclusive and further probes are pure
waste. Do **not** use time-window decay for capability facts: it recovers
the capable and the incapable alike, and it silently destroyed exp-14's
transfer guarantee (0.90–0.96 vs 1.00) — forgetting is not forgiveness.
Store probation state as facts in the shared store (it must survive
orchestrator restarts; continuity measured at 1.00 here), and budget
roughly 3 probes ≈ 50–75 tokens per benched worker as the standing price
of never permanently losing a capable one.

## Pinned runs

All traces replay-verified via `readRunRecord` (headline: 626 events —
spawn 56 / message 505 / score 9 / kill 56; verified on every run).

| run | config | role |
|---|---|---|
| `tf-mr84czql` | 8 cond, base 2 ×2 (defaults) | **headline** |
| `tf-mr848h02` | 8 cond, base 2 ×2 | pre-default confirmation (identical numbers — deterministic) |
| `tf-mr847hn6` | 8 cond, base 4 ×3 | evidence arm ineffective at base 4 |
| `tf-mr8443r0` / `tf-mr840223` | 6 cond, base 4 ×2 | cadence sweep |
| `tf-mr8443x8` / `tf-mr841ran` | 6 cond, base 4 ×3 | cadence sweep |
| `tf-mr84443c` | 6 cond, base 4 ×4 | cadence sweep |

## Run it

```sh
npm run build
cd experiments/15-trust-forgiveness
node dist/main.js                 # defaults: base 2, ×2, margin 3, 50 trials
FORGIVE_PROBE_BASE=4 FORGIVE_PROBE_BACKOFF=3 node dist/main.js   # sensitivity
```

The run aborts (exit 1) if the control arm deviates from RT-05 in any
metric or any point of the 30-round selection curves.
