# Exp88 — Lifecycle transition entry binding

[Spec94](../../specs/94-lifecycle-transition-entry.md) is the frozen pre-registration.

Run: `AEGIS_REPO=/absolute/path/to/built/aegis node experiments/88-lifecycle-transition-entry/main.mjs`.
Replay: `node experiments/88-lifecycle-transition-entry/verify-receipts.mjs`.
Tamper checks: `node experiments/88-lifecycle-transition-entry/test-verifier.mjs`.

The runner records metrics even on red; inspect `passed` and use the verifier.


## RT-78 / exp88 — Lifecycle transitions must retain entry identity

Spec94 pre-registered at `4d29974`; harness frozen at `3a51dcd` before observations.
This tests terminal-proof ingestion and active-to-retired / retired-to-compacted
transitions. Exp47/48 cover static lifecycle proofs; exp87 covers initial selection.
A changing caller handle must not substitute foreign terminal truth or turn a
foreign retained tombstone/checkpoint into a success attestation.

Baseline `90bd6b1aa0bbe6821d455939611b935788002679`, runs `lte-mwlt3ghr-99601` and
`lte-mwlt3gmz-99617`, identical raw outcomes: **10/32 false attestations**,
**0/14 drift hazards rejected**, **18/32 overall pass**. Two retirement cases
actually transition a foreign active marker after a foreign journal read changes
the caller ID. Eight additional false attestations accept existing foreign proof;
four remaining drift cases attest the correct retained state after ignoring observed
drift. All12 positive controls,6 stable conflicts, approval consumption, caller
ownership, and independent storage fixtures pass. Infrastructure0.

Candidate `2baf564bf2b6d94cb049966ce5ba444d2c17c0f7`, run `lte-mwlt73lc-1281`:
**0 false attestations;14/14 drift hazards rejected;32/32 pass**. Same frozen files,
seed, scenarios, thresholds and command. Aegis captures entry permit/approval IDs,
checks after every await, and uses entry IDs for terminal evidence/CAS/readback.
Already-persisted transitions remain intact; original-input retries succeed.

34 new regression tests (18 baseline failures); all502 hook tests pass. Full
release passes build/typecheck/1705tests and58/58 historical gates. SwarmLab evidence
verification and independent raw rescoring are regression checks, not new experiments.
32 verifier tamper cases reject; pinned CI builds the actual candidate and compares
fresh raw outcomes plus complete source/dist hashes. CI/merge state remains tracked
separately in the nightly ledger. Original red traces and content hashes retained.

Limits: Bash-only deterministic host fixture; authentic terminal records are seeded
using real issued permit records. No real external effect, production DB/durability,
hostile adapter, hidden ABA within a callback, post-return protection, deployment or
trained-predictor claim. Holdout unused. Source .acr unchanged; no Territory refresh.
Next hypothesis: do late lifecycle resolvers preserve their entry identity across
awaited proof reads and plural-authority checks? Deduplicate before selection.

Runtime PR: [Aegis](https://github.com/heybeaux/aegis/pull/97).
