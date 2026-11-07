# Experiment77 — Shared issuance acknowledgement recovery

Design: [Spec83](../../specs/83-shared-issuance-recovery.md), preregistration
`59244fa5dde8713492039ff3fa6e4ea93672fff1`; frozen harness `ec933f7734391ec00bdedcd7d9010646ca01d79e`.

Real Aegis `340cc7798d375f131c0e5181bfe213e0249296f2`, repeated runs
`sir-mw6382rf-91926` / `sir-mw6382w4-91948`: recovery **0/10**,
capability refusal **0/2**, complete cases16/28. No duplicate executions,
unsafe readback acceptance or infrastructure failures. Raw outcomes identical.
The baseline replay check fails in the two missing-capability cases because the
unsupported recovery request creates a permit and the final replay probe is its
first take; this is not evidence of duplicate execution.

Real candidate `103e343d351c694bdf9103208af30ec583ffbda8`, `sir-mw63a7ys-99583`:
recovery **10/10**, refusal **2/2**, cases **28/28**, all frozen thresholds pass.
Same immutable scenarios, oracle and commands. No-recovery control remains
blocked, retaining one ready record and permanent marker in every case.

Run from repo root:
```sh
AEGIS_REPO=/absolute/path/to/aegis node experiments/77-shared-issuance-recovery/main.mjs
node experiments/77-shared-issuance-recovery/verify-receipts.mjs
node experiments/77-shared-issuance-recovery/test-verifier.mjs
```
Frozen verifier recomputes raw outcomes and binds three content-addressed traces,
package manifests, identity, times and thresholds. Live verifier additionally
requires actual source/dist bytes, exact clean pinned SHA, fresh timestamps and
raw equality with the admitted candidate. Workflow exp77 runs the real package.

Aegis owns recovery option validation, capability refusal and exact readback.
Host owns authentic consumption identity, durable atomic issuance, coherent
marker+ready reads, atomic take and fresh authorization. Multiple hosts may
recover the same handle; only finalization authorizes execution. No database
or external effect runs here. No deployment, malicious adapter, marker cleanup,
crash-after-take or tuned holdout claim. Existing strict callers are unchanged.

Linked runtime: [Aegis86](https://github.com/heybeaux/aegis/pull/86). Runtime pin103e343; docs-only head2e5e6df. CI and merge evidence recorded independently in nightly ledger.
