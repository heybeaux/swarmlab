# Experiment 87 — Policy selection attestation integrity

Pre-registration: [Spec93](../../specs/93-policy-selection-integrity.md).

```sh
AEGIS_REPO=/absolute/path/to/built/aegis node experiments/87-policy-selection-integrity/main.mjs
node experiments/87-policy-selection-integrity/verify-receipts.mjs
node experiments/87-policy-selection-integrity/test-verifier.mjs
```

`main.mjs` preserves red runs and returns a machine-readable result; exit0 alone is
not success. The verifier recomputes every metric from raw scenario responses and
checks hashes, package identity, scenarios, thresholds and repeated baseline equality.
For fresh live verification use `--run RESULT_JSON --since START_MS --sha EXACT_SHA
--repo AEGIS_PATH`; it also checks actual artifacts and equality with admitted green.

No LLM judge. Two tools, real consumed approvals, strict issuance, truthful atomic
policy storage; the real public selector is the only policy under test. Reused
provenance/storage scaffolding does not count as novelty.


## RT-77 / exp87 — Selection receipts must describe the retained binding

Spec93 pre-registered at commit `ec322432b3896cd88b36b741c0cde4e3366d80a9`;
frozen harness `bd1983d` before observations. New mechanism: a caller changes
permit/approval identity while strict policy bind/read awaits. Aegis constructs its
receipt using entry IDs but compares the retained marker against the changed IDs.
This differs from exp46 stable conflicts and exp86 execution-wrapper authority.
Exp86 remains separate and unmerged; exp87 is based on current origin/main.

Baseline `d9d50b0fab3ae76cbe53457d5ef3c7a05bd359ef`, runs `psi-mwkdngk3-21746` and
`psi-mwkdngp9-21764`, identical raw observations: **8/26 false receipts**,
**0/16 drift hazards rejected**, **10/26 overall pass**. All6 positive controls,
4stable conflicts, real approval consumption, storage isolation, caller ownership
and fixture controls pass. Infrastructure0. Eight additional accepted drift cases
retain the original marker correctly but violate selection input stability.

Candidate `0459356d7570f684077111f2068724606d98a695`, same frozen design,
run `psi-mwkdptxa-22799`: **0 false receipts, 16/16 hazards rejected, 26/26 pass**.
The selector captures entry permit/approval identity, checks it after each await,
and validates readback against the captured binding. It passes a separate marker
object to storage. Identity drift returns no attestation and never deletes a
successfully persisted marker. Clean original-input reselection remains possible.
This is selection attestation; it is NOT an execution or full revocation decision.

16new regression tests (11baseline failures); 78focused tests pass. Full release
passes build/typecheck/1671tests and58/58 historical gates. SwarmLab evidence:
75claims/183traces/1724assertions. Independent raw rescoring and32verifier tamper
rejections pass; fresh artifact verification checks the actual complete source/dist
manifest and exact raw outcomes. CI builds the pinned real package. These existing
suites are regression verification, not new evidence. Original red traces retained.

Limits: deterministic atomic detached storage, no production DB/durability,
external effect, deployment, hostile adapter, hidden ABA inside one callback,
post-return protection or trained predictor claim. Holdout unused. Source .acr
unchanged; no Territory refresh. CI/merge state is tracked independently in the
nightly ledger. Next hypothesis: can retirement/compaction attestation mix mutable
entry identity and awaited terminal proof? Deduplicate before selecting it.

Runtime PR: [Aegis96](https://github.com/heybeaux/aegis/pull/96).
