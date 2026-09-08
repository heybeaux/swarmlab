# Experiment 29 — Approval Execution Checkpoint & Revocation TOCTOU

**Pre-registered at:** 2026-09-08T06:45:00Z  
**Local scheduling date:** 2026-09-07 America/Vancouver  
**Spec:** [Spec 35](../../specs/35-approval-execution-checkpoint.md)

This README pre-registers the experiment before implementation or observation. The authoritative
hypotheses, novelty analysis, ten fixed scenarios, state-transition order, arms, deterministic
ground truth, metrics, locked thresholds, holdout discipline, compatibility requirements, Aegis
ownership boundary, and exact baseline/post-fix commands are in Spec 35. Results will be appended
without changing those terms.


## Admitted result

The real-Aegis baseline run `aec-mtsaq222` at
`c1c1245be65e0e15dfe8595f9fae9fcd85a2e11e` reproduced the pre-registered TOCTOU failure.
After successful approval consumption it executed all six unsafe authority-transition/missing-
checkpoint cases and replayed the consumed authority a second time:

- every unsafe and permit-replay execution rate: `1.000`
- execution refresh coverage: `0.000`
- execution accuracy: `0.300`
- checkpoint availability: `0.000`

The failure is attributable to a missing lifecycle phase, not a broken fixture: initial ask and
consume coverage were both `1.000`; three stable authority controls executed; and the ideal
execution-checkpoint arm rejected every unsafe/replay case without blocking a control.

Aegis commit `bb4ffac4fb2c17389227fd2ec30ecabab2061386` adds the smallest general host contract:
`createExecutionPermit` binds a post-consumption permit to the exact approved action and current
principal/delegation state; `finalizeExecutionPermit` atomically consumes it against a fresh
host-supplied authorization/delegation snapshot, burns it on mismatch, validates per-link
revocation and attenuation, and rejects replay/concurrency by construction. The existing boolean
approval consumption API remains compatible. Aegis does not claim safety for hosts that omit the
final checkpoint or supply false currentness metadata.

The unchanged ten scenarios reran against that committed package as `aec-mtsatwg1`: every unsafe
and replay execution rate moved to `0.000`, legitimate block remained `0.000`, refresh coverage and
accuracy moved to `1.000`, and ask/consume/checkpoint coverage were all `1.000`. Both admitted
traces contain 54 events and replay-verify. Reserved holdout remains unused.
