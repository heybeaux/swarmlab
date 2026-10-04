# Experiment 53 — Source freshness policy authority consensus

**Pre-registered:** 2026-10-03T06:34:20Z, before harness implementation or baseline execution.  
**Spec:** [`specs/59-source-freshness-policy-authority-consensus.md`](../../specs/59-source-freshness-policy-authority-consensus.md)  
**Seed:** `source-freshness-policy-authority-consensus-v1`

Tests whether real Aegis requires every expected independently authenticated source-freshness policy authority to present the same exact current policy envelope before consequential fact use. Exp-52 / RT-42 validates one host envelope; execution-journal and lifecycle authority experiments test different truth objects and effects. The frozen roster, metrics, thresholds, ownership boundaries, and exact commands are in Spec 59. No LLM judges success.

Results are intentionally blank until this pre-registration is committed and the new harness runs.

## Results — current Aegis red, patched Aegis green

Baseline built Aegis `19ab9dc`, run `sfpac-mus0r5kr`, allowed every frozen authority failure (`unsafeAuthorityDisagreementAllowRate=1`), detected none, reached `0.3636` exact accuracy, and exposed no RT-43 hit. The consensus fixture plus RT-41/42 controls were green.

Patched built Aegis `cbdf4aa`, run `sfpac-mus0sxzz`, reached unsafe disagreement allow rate `0`, detection/accuracy/API availability `1`, and every agreement, order, conflict, roster, invalid-evidence, recovery, stale-observation, and low-risk preservation metric `1` on the identical roster. Hosts retain responsibility for authority independence/authentication, complete enumeration, and linearizable reads.
