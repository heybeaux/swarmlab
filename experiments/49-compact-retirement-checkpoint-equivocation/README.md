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
