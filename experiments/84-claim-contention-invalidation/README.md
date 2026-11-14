# Exp84 — Claim contention retains invalidation

[Pre-registration / frozen design](../../specs/90-claim-contention-invalidation.md).

## RT-74 / exp84 — Losing a claim must not erase invalidation

Spec90 pre-registration `41d8c50ca335ba3521574edb42e6fff23ddc4ba5`, frozen harness
`72ca11106bf6c90e255be99b8167489211ff73b6`. This tests actual competing real-Aegis finalizers;
exp83 covered transport failures and explicitly excluded undefined claims.
Two tools x normal/lost prepare acknowledgement x nine modes = 36 deterministic cases.

Baseline `53200335d71b81494470693737c635fea5af1226`, runs `cci-mwg3acz8-13833` and
`cci-mwg3ad4a-13851` have identical raw observations: **16/16 unsafe recoveries**,
invalidation0/16, uncertainty0/12, **8/36 scenarios pass**. Rival claims, ordinary
controls, real approval consumption, fixture and state checks all pass; infrastructure0.
Candidate `7c00391db7e79857934eb25eb3051278bc489bdc`, unchanged design, run `cci-mwg3dlnl-15251`:
**0/16 unsafe recoveries**, invalidation16/16, uncertainty12/12, **36/36 pass**.

Aegis checks remembered prepare drift and live input drift before returning from an
empty claim. Confirmed burn returns invalid_snapshot; false/throwing burn and a rival
that already started return uncertainty. Unchanged contention preserves not_taken,
including its lost-prepare retry flag. A started effect remains fenced; no rollback
or claim that an external effect was cancelled. Host quarantine remains necessary.

18 new tests (14 baseline failures),53 focused tests pass. Two existing assertions
reinjected fresh drift on replay and expected not_taken: now explicitly require
invalid_snapshot, then verify unchanged replay still returns not_taken. Frozen exp84
oracle/thresholds unchanged. Exp79all29 and exp83all32 pass as regressions only.
Full release **1637 tests**,58/58 historical gates, one worker with unchanged25ms
regex budget. Receipt rescoring and37tamper controls pass. CI builds pinned real Aegis
and checks fresh raw response equality plus complete source/dist hashes.

Scope: deterministic atomic storage contract, no external effect, production durability,
deployment, hostile adapter or trained predictor proof. No holdout tuning. Prepare-false,
immutable-invalid input without drift, elapsed expiry, unseen ABA and post-return
mutation remain untested. Source .acr unchanged; Territory refresh not needed.
Next hypothesis: can prepare returning false after existing operation contention
similarly hide observed drift? Deduplicate before pre-registration; no claim tonight.

Run with `AEGIS_REPO=/absolute/path/to/built/aegis node experiments/84-claim-contention-invalidation/main.mjs`.
Verify admitted evidence: `node experiments/84-claim-contention-invalidation/verify-receipts.mjs`.
Tamper controls: `node experiments/84-claim-contention-invalidation/test-verifier.mjs`.

Runtime PR: [Aegis](https://github.com/heybeaux/aegis/pull/93); exact CI/merge state is recorded independently in the nightly ledger.
