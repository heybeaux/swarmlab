# Experiment 89 — Late lifecycle resolution

[Pre-registration](../../specs/95-late-lifecycle-resolution.md).

## RT-79 / exp89 — Late reads must preserve entry identity

Spec95 registered at `3e75853`; harness frozen at `ca10067` before observations.
New question: can late lifecycle resolution mistake another permit's retained
terminal proof for the original operation identity after an awaited read? Exp88
covered retirement/compaction writes; exp49 covered static plural conflicts.

Current Aegis `4744da93fe969032bd9b586730e4c8fe05986970` produced identical raw observations in
`llr-mwn8hwem-74816` and `llr-mwn8hwjz-74833`: **8/56 false terminal classifications**,
**16/24 drift hazards rejected**, **48/56 overall pass**. All16 positive controls,
8stable foreign conflicts,8outages, begin safety, immutable storage, recovery,
caller ownership, approval consumption and fixture controls pass. Infrastructure0.
Every route accepts foreign proof after the caller switches to its identity at read.
Other drift patterns already reject; they are controls, not claimed new failures.

Candidate `1b35ded5653ad7b9ae1cba251826f028d60aac35`, same frozen files/seed/scenarios/thresholds/command,
run `llr-mwn8krgp-76122`: **0 false classifications;24/24 hazards rejected;56/56 pass**.
The resolvers capture permit/approval identity before reads, check stability after
proof/authority awaits, and compare retained truth with entry IDs. Begin remains
blocked and read outages stay indeterminate. No stored records or caller objects
are mutated. Full tombstone fallback within plural resolution is also unit tested.

48new regression tests (12baseline failures);82focused tests pass. Full release passes build/typecheck/1753tests and58/58
historical gates; evidence verification passes77claims/189traces/1796assertions.
32verifier tamper cases reject; a fresh artifact run matches exact raw outcomes. Original red-red-green traces,
source/dist hashes and independent raw rescoring receipts are committed. Pinned
real-package CI requires exact observable outcomes and actual artifact hashes.
Existing evidence checks are regression verification, not novel evidence.

Limits: deterministic Bash fixture with host-seeded authenticated proof, not real
external effects, production DB/durability, hostile adapters, hidden ABA inside one
callback, post-return protection, deployment or learned predictor evidence.
Holdout unused; no tuned parameters. Source .acr unchanged; Territory not refreshed.
Next hypothesis: can an adapter retain and mutate a previously returned compact
proof while the resolver awaits plural authorities, changing terminal classification?
Deduplicate and pre-register separately before testing; no claim here.

Run `AEGIS_REPO=/absolute/built/aegis node experiments/89-late-lifecycle-resolution/main.mjs`; verify with `node experiments/89-late-lifecycle-resolution/verify-receipts.mjs`.

Runtime PR: [Aegis98](https://github.com/heybeaux/aegis/pull/98).
