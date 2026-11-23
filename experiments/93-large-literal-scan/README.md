# Exp93 — Large literal scan work

Pre-registered [Spec99](../../specs/99-large-literal-scan.md). New single-string
substring CPU boundary; no regex, decoder or wide target list. Results pending.


## Exp93 — Large literal scan work: local honest null

Spec99 pre-registration `f92ab04`; harness frozen `a8bf186` before observations.
Question: can one large string monopolize literal matching outside regex budgets?
This uses no regex, decoding or wide input lists; distinct from exp67/68/70/92.
Real current Aegis `9c06ee809849a3c60e15160388636f93ab04918d`, unchanged in both runs:
`lls-mwsy9z5z-35108` and `lls-mwsyau0t-35355` each pass22/22, seven stress
cases, seven paired small-input arms and eight controls. Zero runtime/infrastructure
failures, no false hits, preserved ownership and recovery. Source/dist and frozen
harness manifests plus raw evaluations and independently checked input hashes retained.

64 literal rules each scan a single128MiB flat string under512MB child heap.
Stress evaluation times range1386.9–1499.3ms across14 observations against the
predeclared1500ms bound. **Only0.7ms worst headroom: this is a near-threshold local
null, not robust latency evidence.** Two repetitions do not establish a confidence
bound across machines or scheduler conditions. No constants, thresholds or workloads
were tuned after observing results; no holdout was used. The external watchdog is
containment, not an Aegis deadline. No upper-bound guarantee for larger workloads.

No demonstrated local red means no Aegis patch or improvement claim. Fresh pinned
real-package CI must satisfy the same1500ms design; any CI red remains evidence and
blocks merge, rather than triggering threshold relaxation. Receipt verification
recomputes observations and rejects28 tamper cases. CI/merge results in nightly
ledger and experiment README. Full Aegis release and historical evidence checks
are regression verification only. No source .acr changes, no Territory refresh.

Next question for deduplication: does execution-permit expiry remain enforced when
an asynchronous store read crosses the expiry boundary before effect authorization?
This is a candidate for a future pre-registration, not a claim tested tonight.

Run frozen receipts: `node experiments/93-large-literal-scan/verify-receipts.mjs`.
Run real package: `AEGIS_REPO=/path/to/built/aegis node experiments/93-large-literal-scan/main.mjs`.
