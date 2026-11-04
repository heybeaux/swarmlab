# Experiment74 — Process-target execution checkpoint

Pre-registration: [Spec80](../../specs/80-process-execution-target.md). No results yet.

## RT-64 / exp74 — Process lifetime must survive into execution permits

Spec80 pre-registration3596654 (package-manager setup correction235a666), frozen harness812c6c4, precede all observations. This is the post-consumption target checkpoint intentionally excluded by exp73, not a replay of approval identity or delegation checks. Real fetched Aegis `85d451dbb9a8d956023514b2cf1e360d6913fbc0` runs `pet-mw1sxdo3-29192` and `pet-mw1sxdrw-29210` have identical24 raw rows: **16/16 hazardous finalizations authorized**, target binding0/20, valid controls8/8, one-shot replay24/24, consumption24/24, ownership24/24, infrastructure0.

Candidate `26f269567ab7ba335577f0b556b088c3adde5f15`, SAME immutable design `pet-mw1t0mch-35427`: **0/16 unsafe authorizations**, valid controls8/8, bound process records20/20, replay24/24; all thresholds pass. New ProcessInput permits retain detached host/session/generation and tool discriminator; creation rejects unavailable target, shared snapshot validator rechecks target on finalization/resume/start. Nonprocess permits remain compatible. Seventeen new focused tests transition16red/1pass to17green; prior15 generation tests pass. Tests cover reconciled and journal APIs beyond the experiment's local/shared variants.

Three26-event raw traces plus source/dist manifests and content-addressed receipts retained. Verifier recomputes every metric/check, compares live raw responses with pinned green, validates actual artifact roster/bytes, exact clean SHA and fresh run identity;29 tamper controls rejected. Negative stale-snapshot controls remain6/6 authorized: a truthful fresh host snapshot is required. No actual process execution, host deployment, cryptographic identity, post-finalization atomic write guarantee or tuned holdout claim. Old outstanding process permits lack a discriminator: host must drain/reapprove them before adoption; no automatic safe migration is claimed.

Regression checks are separate from novelty: exp73 all frozen thresholds pass; full Aegis release and SwarmLab evidence results are logged in nightly artifacts. Static evidence catalogue does not execute RT64. Source .acr unchanged; no Territory refresh. CI/PR/landing status is recorded separately, never inferred from local green. Next hypothesis: whether permit authority can be recreated from the same consumed-approval ID after the prior permit is finalized; must deduplicate and pre-register tomorrow.
