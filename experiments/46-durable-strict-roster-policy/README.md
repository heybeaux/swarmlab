# Experiment 46 - Durable strict-roster policy continuity

**Pre-registered:** 2026-09-23T06:44:00Z, before implementation or baseline execution.  
**Spec:** [`specs/52-durable-strict-roster-policy.md`](../../specs/52-durable-strict-roster-policy.md)  
**Seed:** `durable-strict-roster-policy-v1`

Exp-45 proved capability continuity only while one Aegis-created process-local context survives.
This experiment destroys that context or hands the operation to a peer host and asks whether an
exact operation/permit-bound durable marker preserves strict current-roster policy.

The three arms are a process-local fallback control, a deterministic shared durable-policy fixture,
and real built Aegis. Machine-owned scenarios and exact expected triples judge success; no LLM does.
Green requires full durable-policy failure detection, zero restored authority, exact accuracy,
public durable selection/resolve/begin API availability, every control/safety metric at one, and full
ASK/consume coverage. Exact scenarios, thresholds, ownership, holdout discipline, and baseline and
post-fix commands are frozen in Spec 52. `durable-strict-roster-policy-holdout-v1` is reserved and
unused.

## Result

Baseline `dsr-mudqgx1i` against Aegis `444f04a0538ab679e1eee3442565c24989ba00b5`
was reproducibly red: durable-policy detection `0`, unsafe authority restoration `1`, exact
resolution accuracy `0.0667`, and public durable strict-roster API availability `0`. The strict
fixture was fully green.

Aegis `83e802c735c35ac1fd25b102728fb02e09d02c59` adds a host-owned atomic durable-marker
contract plus selection/readback and resolve/begin boundaries. The same frozen roster reran as
`dsr-muf62rva`: detection `1`, authority restoration `0`, accuracy/API availability `1`, and every
secondary control, failure-safety, ASK, and consume metric `1`.

The host still owns linearizable marker durability, cross-host visibility, roster authenticity, and
retention. This deterministic adapter experiment does not certify a production database.
