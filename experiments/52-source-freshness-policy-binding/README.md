# Experiment 52 — Source freshness policy binding

**Pre-registered:** 2026-10-02T06:33:51Z before harness implementation or baseline execution.  
**Spec:** [`specs/58-source-freshness-policy-binding.md`](../../specs/58-source-freshness-policy-binding.md)  
**Seed:** `source-freshness-policy-binding-v1`

Tests whether real Aegis binds individually fresh-looking observations to one authenticated canonical freshness-policy identity/version, source-version namespace, and exact maximum-age rule. Exp-51 / RT-41 validates the observation but assumes the policy interpreting it. Exact frozen scenarios, metrics, thresholds, ownership boundaries, commands, and limitations are in Spec 58. No LLM judges success.

Results are intentionally blank until the pre-registration commit exists and the new harness runs.

## Results — current Aegis red, patched Aegis green

Baseline built Aegis `5f548ce`, run `sfpb-muqlb7j6`, allowed every frozen policy-envelope mismatch (`unsafePolicyMismatchAllowRate=1`), detected none (`policyMismatchDetectionRate=0`), reached `0.3889` exact accuracy, and exposed no RT-42 policy hit. RT-41 observation preservation metrics and the deterministic fixture were green.

Patched built Aegis runtime `8f95e15`, run `sfpb-muqld2ku`, reached unsafe policy-mismatch allow rate `0`, detection/accuracy/API availability `1`, and every current-policy, exact-boundary, newer-source-version, recovery, low-risk, and RT-41 preservation metric `1` on the identical frozen roster. Hosts still own truthful policy authentication, canonical monotonic policy truth, cross-host distribution/consensus, and adapter completeness.
