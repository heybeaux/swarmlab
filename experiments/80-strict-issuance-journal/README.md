# Exp80 — Strict issuance identity through effect journals

Pre-registered design: [Spec86](../../specs/86-strict-issuance-journal.md).

Run the real built package:
```
AEGIS_REPO=/absolute/path/to/aegis node experiments/80-strict-issuance-journal/main.mjs
```
Results pending. The hypothesis is journal compatibility with strict issuance,
with preserved signature and cross-issuance identity validation.

## RT-70 / exp80 — Strict issuance identity must survive effect journals

Spec86 pre-registrationd7f3a86 selected the strict/journal composition gap,
explicitly deferred by exp79. Initial oracle used approval.status rather than
approval.event; diagnostic runs sij-mwadlgts-45129 and sij-mwadlj1s-45210 are retained
but not admitted. Correctionec63394 changes only observation fields and asserts
exit2/0; scenarios and thresholds unchanged, before any Aegis patch.

Admitted baseline `a52fc456d07a05527931c6b2c690e1f09c94ad27` runs `sij-mwadm3oo-46577` and
`sij-mwadm5kq-46665` have identical raw observations. Strict lifecycle **0/10**,
negative **16/16**, legacy/simple controls all pass, **18/28cases**. Strict permits
are burned because journal validation recomputes only legacy IDs. Runtime
`67b57ac7871347119973aee1da24f155716a979e`, same frozen design, `sij-mwadqqbj-62323`:
strict lifecycle **10/10**, negative **16/16**, **28/28pass**. This includes Bash
and ProcessInput, success/failure receipts, lost prepare acknowledgement, recovered
handles, fresh consumption separation and corrupt readback. No infrastructure faults.

Aegis now retains issuanceId in strict records and recomputes the same domain-
separated ID at journal boundaries, preserving signature/approval binding and legacy
validation. Malformed, absent or changed metadata does not downgrade. The host must
retain the field. Old strict records lack it: exact recovery/journal validation
fail closed; drain or reapprove, never remint or silently switch to legacy mode.
Mixed-version migration is not established. No database, external-effect or deployment
proof; authentic authority, atomic storage and truthful consumption identity remain
host responsibilities. Holdout reserved unused; .acr untouched.

20new unit tests (four fail on baseline after unit-fixture corrections),84focused
tests and release1574tests+58historical gates pass. Exp77all28 and exp79all29 pass
as regressions, not novel evidence. Frozen receipts independently recompute scores;
34tamper controls reject. Dedicated CI runs the pinned real package and checks fresh
raw response equality. Exact PR/CI/merge state is recorded in the nightly ledger.

Next hypothesis: mutable authority during resume/start read or begin CAS may change
invalid input to valid before validation, separately from initial finalization.
Deduplicate and pre-register that asynchronous lifecycle boundary before running.

Runtime PR: [Aegis89](https://github.com/heybeaux/aegis/pull/89); executable pin67b57ac, docs-only head69fdb89.
