# Experiment 49 - Compact retirement checkpoint equivocation

**Pre-registered:** 2026-09-29T06:47:00Z before harness implementation or baseline output.  
**Spec:** [`specs/55-compact-retirement-checkpoint-equivocation.md`](../../specs/55-compact-retirement-checkpoint-equivocation.md)

This experiment tests whether RT-39's single authenticated compact strict-roster retirement proof can
become a false terminal-certainty restore point when independent lifecycle authorities disagree after
the full tombstone is gone. It is distinct from exp-42's execution-journal revision checkpoint:
exp-49 governs compact strict-roster lifecycle truth, exact terminal classification, and a different
adapter/policy boundary.

Frozen arms, 19 scenarios, deterministic truth, metrics, thresholds, seed, holdout discipline,
ownership boundary, and exact baseline/post-fix commands are in Spec 55. No LLM judges success.
`aegis-wrapped` must invoke the built real hook public API; API absence is a measured failure and is
never replaced by a local policy copy.

## Result

Baseline `crce-munqi4mz` used real built Aegis `40b6a033194438393608075cb7516aeab4a12e44`. The deterministic plural fixture was fully green, but the Aegis arm exposed no plural compact-lifecycle authority API, detected `0/6` conflicts, returned false terminal certainty in all six conflict/rollback scenarios, and scored `4/19` exact (`resolutionAccuracy=0.21052631578947367`).

Aegis candidate `e04db90ae4dddfe50b34df1de66d03c08adf400e` adds an independently authenticated authority shape, optional plural lifecycle store contract, exact shape/identity/verification/operation/self-binding validation, exact agreement with the local compact record, and explicit resolve/begin entry points. The unchanged frozen roster reran as `crce-munqnsnf`: detection `1`, false terminal certainty `0`, exact accuracy/API `1`, and every secondary metric `1`.

Setup-only traces from contract repair and dirty-source iteration are deliberately not admitted. Hosts still own authority independence/authentication, complete enumeration, linearizable reads, retention, and physical GC; this does not certify a production transparency service.
