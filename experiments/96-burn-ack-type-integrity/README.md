# Experiment96 — Burn acknowledgement type integrity

## RT-86 / exp96 — Truthiness is not a durable burn acknowledgement

[Spec102](../../specs/102-burn-ack-type-integrity.md) pre-registration `e98c181c0a8b8278f18e3448306979ed76ad1d56`;
frozen harness `4adc740dd3c93d70fe54b53ed257a3a5e48f11ba`. New question: malformed runtime burn
responses across finalization, resolution and start. Exp82 tested false/throws;
exp76 validated CREATE evidence; neither tested nonboolean BURN evidence. Storage
mechanics are reused, not counted as novelty. Bash/ProcessInput, three APIs, nine
modes =54 cases; controls use real approval consumption and strict permit issuance.

Baseline Aegis `1e969bc025a5b2af3a4a614481f1f7f73582ff48`, runs `bat-mwx8khl7-86391` and `bat-mwx8khr3-86409`:
identical raw observations; **24/42 uncertain acknowledgements falsely reported
as definitive invalidation,30/54 scenarios correct**. All24 truthy malformed returns
leave authorization startable by a clean adapter. Strict true/false, null, throw-after,
valid controls, state, fixture, approval and ownership checks pass; infrastructure0.

Candidate `a0881abc031d0b1f5955f570c05d534b1eb86146`, run `bat-mwx8mq43-87449`: **0/42 false definitive reports,
54/54 scenarios correct**, same command/seeds/scenarios/thresholds and frozen files.
Aegis requires literal true at all three burnEffect checks. No stronger revocation
claim: indeterminate operations still need host quarantine and reconciliation.

30new tests (18fail on baseline),89focused tests pass. Raw red/red/green traces,
source/dist manifests and independent rescoring receipts retained;36tamper cases
reject. Full release, historical evidence, relevant old experiments and GitHub CI
are recorded separately as regression verification, never new experiment evidence.

Limits: intentionally malformed JavaScript/JSON adapter responses; conforming boolean
adapters unaffected. A dishonest literal true cannot be detected by type checks.
No real database, external effect, production deployment or predictor improvement
claim. Holdout reserved unused, no tuning. No .acr changes or Territory refresh.
Next new hypothesis: can a truthy nonboolean beginEffect CAS acknowledgement grant
execute without an actual started transition? Deduplicate before selecting.

Runtime PR: [Aegis103](https://github.com/heybeaux/aegis/pull/103).

Local regression verification passed: 1,891 release tests and 58/58 historical gates;
SwarmLab 82 claims, 204 traces, 1,943 assertions. Exp82 and exp95 both pass against
the candidate. These are regressions, not new evidence. GitHub CI remains separate.
