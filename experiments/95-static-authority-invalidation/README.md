# Experiment95 — Static authority invalidation

## RT-85 / exp95 — Stable authority can still be invalid

Spec101 pre-registration `f68653d987918c14fd054291605b563b6c72192e`; frozen harness
`66f5288d79c857b683ce36a516ea8fa9d4a6d21b`. This tests immutable-invalid entry authority
when journal claim throws or loses contention. Exp79/83/84 test mutation and
explicitly exclude this static-invalid boundary. Exp94 tests elapsed leases on
other finalizers. Reused storage/provenance mechanics are not the new evidence.

Baseline Aegis `beffd514ea144bfdcf13531cbc9d87760bbc55b4`, runs
`sai-mwvt5ktv-55914` and `sai-mwvt5kzi-55932`: identical raw observations,
**33/33 invalid grants recoverable;18/57 scenarios correct**, uncertainty12/18.
All57 paired controls,19 rival claims, approval/fixture/state/ownership checks pass;
infrastructure0. Static revoked/unchecked/structural/digest/consumer/process-generation
inputs never change, but absent claim results bypassed validation against the grant.

Candidate `ff5da736e94a675b122cc741046c87228da0873d`, run `sai-mwvt8cdf-57287`:
**0/33 unsafe recoveries;57/57 scenarios correct;18/18 truthful uncertainties**.
Same scripts/seeds/scenarios/thresholds/command. Aegis reads retained operation truth
on absent claims, checks exact ownership and static snapshot, and requires confirmed
burn before definitive invalidation. Valid recovery still begins once; failed
read/burn never pretends durable invalidation. Caller-owned inputs stay untouched.

45 new unit tests (33 fail against baseline),631 hook tests pass. Full release check
passes build/typecheck/tests and58/58 historical gates. Exp83/84/85 reruns all pass
as regression verification only. Independent receipt rescoring and35 tamper cases
pass; pinned-package CI verifies fresh observations and source/dist artifact hashes.
GitHub CI/merge outcomes are recorded separately in the nightly ledger.

Limits: deterministic atomic host adapter, authentic plain data, immutable operation
binding and mandatory begin CAS assumed; no external effect, production durability,
hostile-storage, unseen ABA, post-return race, deployment or predictor claim.
Uncertain operations require host quarantine. No tuned parameters; holdout unused.
No .acr edits or Territory refresh. Prior incomplete86/90 and honest-null93 remain
separate. Next hypothesis: can truthy nonboolean burn acknowledgements be mistaken for confirmed
durable invalidation during finalization or resume?
Deduplicate against existing acknowledgement-attestation work before selecting.

See [Spec101](../../specs/101-static-authority-invalidation.md) for exact design and commands.

Linked PRs: [Aegis102](https://github.com/heybeaux/aegis/pull/102) and [SwarmLab86](https://github.com/heybeaux/swarmlab/pull/86).
