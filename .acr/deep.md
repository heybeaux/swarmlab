# SwarmLab — Deep

Loaded when designing new experiments, interpreting retest evidence, or deciding how SwarmLab findings should affect the production stack.

## Architecture

```text
specs/             human/agent-written experiment specs
core/              spawn/bus/score/trace substrate
experiments/       one executable experiment per failure question
observatory/       Svelte replay/navigation UI
SYNTHESIS.md       cross-stack evidence and retest ledger
JOURNAL.md         chronological lessons
TEAM.md            autonomous team constitution
```

Every experiment emits JSONL trace events through `@swarmlab/core`:

- `spawn`
- `message`
- `score`
- `kill`

The replay API is load-bearing. If a claim cannot be replayed or traced to a deterministic summary, treat it as provisional.

## Operating model

SwarmLab follows an evidence loop:

1. write a spec with hypotheses and metrics
2. build the experiment with trace/replay
3. run deterministic sweeps and any clearly-labeled live exhibitions
4. document results in the experiment README and `JOURNAL.md`
5. synthesize stack implications in `SYNTHESIS.md`
6. patch the owning stack repo
7. retest in SwarmLab against the real patched package via `file:` dependency
8. promote the finding into Aegis as a rule, feature, label, or benchmark axis
9. when practical, rerun the same SwarmLab scenario with the real Aegis evaluator in the path and pin the delta
10. update territory/release docs so future agents inherit the map

`docs/STACK-LIFECYCLE.md` is the canonical lifecycle and release-cycle document.

## Findings that currently shape the stack

- **Typed contracts:** exp-12 showed schema agreement can silently corrupt meaning. Sonder typed payload contracts and AOP v0.2 `payload_contract` killed false-friend corruption in retest.
- **Criterion drift:** exp-04 showed real models mislead by reframing the decision criterion rather than stating false facts. Parliament pinned criteria and evidence audits block silent capture.
- **Fact checking:** adapted exp-04 attacks fabricated on-standard claims. Parliament `FactStore` support closes the hole when a ground store exists.
- **Memory fidelity:** exp-08 showed coverage and truth are orthogonal. Engram versioned facts + anti-entropy heal corruption instead of throttling spread.
- **Delegation trust:** exp-14 showed persistent Engram capability facts let a brand-new root avoid an incapable delegate; context windows do not.
- **Forgiveness:** exp-15 showed naive time decay is dangerous and evidence-capped probation recovers capable workers without reopening incapable-worker leaks.
- **Handoff guards:** exp-16 showed presence manifests are insufficient for deep delegation; value-echo manifests fully recover the modeled loss at depth ≥2.
- **Verification tiers / Aegis-wrapped audits:** exp-17 showed evidence is not boolean; RT-08 plus Aegis PR #7 added a high-risk audit gate, and retest `gsv-mrc3huyf` proved Aegis-wrapped audit escape falls 0.188 → 0.063 with measured governance cost tax 0.106.

## Boundaries

- SwarmLab **does** produce experiments, metrics, traces, retests, synthesis, and stack recommendations.
- SwarmLab **does not** own production enforcement. Lattice/Aegis own runtime gates; owner repos own implementation; territory owns orientation.
- SwarmLab **does not** certify a change unless the retest links real implementation code.
- SwarmLab **does not** certify an Aegis runtime/harness claim unless an Aegis-wrapped retest exists or the blocker is explicit.

## Release implications

Any production release motivated by SwarmLab evidence should carry:

- source experiment ID
- source run IDs
- owner repo patch/PR
- retest run IDs
- before/after metrics
- Aegis rule/benchmark ID if harnessized
- updated territory card if project purpose/status changed

## Known gaps / next implementation targets

- Aegis needs stable decision→outcome joins and enough labeled data for its predictive layer.
- Engram-backed `FactStore` needs verification tiers (`attestation`, `provenance`, `retrieval`, `cross_model`, etc.).
- Parliament/Engram still need the full RT-08 verification-envelope rollout; the current Aegis-wrapped retest proves the audit gate only.
- Lattice/Aegis need production delegation-depth policy for value-echo handoffs and evidence-capped probation.
