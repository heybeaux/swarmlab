# Stack Development Lifecycle

**Status:** v0.1 operating model, drafted 2026-07-07  
**Scope:** SwarmLab, Aegis, Sonder, AOP, Lattice, Engram, Parliament, ACR, AWM, and the supporting benchmark/release loop.

## North star

The stack should improve by evidence, not vibes.

SwarmLab is the experiment lab: agents propose and build controlled experiments that expose real failure modes in LLM/agent behaviour. Those findings become stack changes in Sonder, AOP, Lattice, Engram, Parliament, ACR, AWM, and related projects. Aegis then becomes the self-improving harness that absorbs those findings as rules, labels, predictors, and release gates. Benchmarks prove whether the fixes actually improve agent reliability before anything graduates.

The loop is:

```text
territory map
  → SwarmLab experiment
  → measured finding
  → stack owner patch
  → linked retest against the real patched package
  → Aegis/benchmark harnessization
  → release gate
  → territory + docs updated
```

The hard rule: **a green board is not proof. A replay-verified retest is proof.**

## Where each project fits

### SwarmLab — experiment lab

SwarmLab owns scientific exploration of agent failure modes.

It should answer questions like:

- What goes wrong when agents delegate deeply?
- When does consensus hide capture?
- When does memory propagation outrun truth?
- Which contract fields prevent silent corruption?
- Which governance policy catches the failure without creating a worse one?

SwarmLab outputs:

- experiment specs in `specs/`
- executable experiments in `experiments/`
- deterministic JSONL traces
- README findings per experiment
- cross-stack synthesis in `SYNTHESIS.md`
- retest ledger entries showing before/after deltas

SwarmLab does **not** ship production policy directly. It produces evidence and pressure-tests proposed fixes.

### Aegis — self-improving harness

Aegis owns operational governance and release safety.

It starts as a rule-gater, but the target shape is stronger:

- collect decisions and outcomes from real tool use
- label failures consistently
- absorb SwarmLab findings as rulepacks, feature extractors, and benchmark axes
- train calibrated predictors for `P(action_failed)`
- run in shadow mode before enforcement
- gate releases when a patch regresses known failure classes

Aegis is where lab findings become runtime muscle memory.

### Sonder — runtime and signed event substrate

Sonder owns the signed agent event stream and faculty contribution pipeline. It is where agent actions become durable, inspectable events.

Sonder should carry the facts Aegis and SwarmLab need to judge agent behaviour:

- parent/causal chain
- payload contracts
- task intent
- governance decision
- memory reads/writes
- reasoning output
- audit hashes/signatures

### AOP — interoperable observation envelope

AOP is the portable standard for agent observation events.

When a SwarmLab finding identifies a missing semantic field that should survive beyond one implementation, it belongs in AOP. Example already landed: `payload_contract` in v0.2, so the envelope can authenticate meaning, not just authorship.

### Lattice — governance policy

Lattice owns gate policy and coordination contracts.

SwarmLab findings that say “this action must pause / review / ask / blind-review / require a manifest” become Lattice policy candidates.

Examples already suggested by the lab:

- blind review by default for subtle defects
- mandatory inter-step review edges for long chains
- value-echo handoff manifests at depth ≥2
- ratio-based metering instead of absolute price gates
- probation-based trust routing rather than naive time decay

### Engram — memory and ground store

Engram owns persistent facts: identity, project context, capability trust, provenance, and verified knowledge.

SwarmLab has already shown the important distinction:

- context remembers temporarily
- Engram facts survive resets and transfer to new agents

Engram is the natural ground store for Aegis fact checks and operational trust, but verification tier matters. A future Engram-backed `FactStore` should record whether a claim is supported by human attestation, provenance chain, retrieval, cross-model verification, or only weak observation.

### Parliament — reasoning and evidence audit

Parliament owns deliberation, consensus, critique, and evidence-aware verdicts.

SwarmLab findings should become Parliament changes when the failure is about:

- criterion drift
- vote arithmetic outrunning evidence
- fabricated on-standard claims
- adversarial critique and synthesis
- evidence pooling under non-consensus

### ACR — capability/context management

ACR owns what enters an agent context and at what level of detail.

SwarmLab and territory both depend on ACR-style levels of detail. The stack lifecycle should use ACR to avoid “everything everywhere” context bloat:

- index: know the project exists
- summary: orient around purpose and fit
- standard: actively work in the project
- deep: debug architecture or causal history

### AWM — intent and predictive workflow model

AWM owns intent modelling and predictive execution policy.

For this lifecycle, AWM should feed Aegis’s predictive layer: a tool call or agent action is not just a string command, it is an attempted workflow step with prior context, resources, risk, and likely outcome.

## Lifecycle stages

### 0. Territory discovery

Before changing the stack, load territory cards for the named projects.

Outputs:

- relevant `standard.md` / `deep.md` cards consulted
- missing project cards identified
- canonical repo paths confirmed

Gate:

- no implementation starts from stale mental memory when a territory card exists
- if a project is missing from territory, create or schedule its card as part of the work

### 1. Experiment intake

A lab question enters SwarmLab as a spec.

A good spec contains:

- the failure hypothesis
- why existing experiments do not already answer it
- the stack faculty under test
- deterministic setup and seeds
- success/failure metrics
- honesty notes expected in advance
- which real package, if any, must be linked via `file:` dependency

Output:

- `specs/NN-short-name.md`

Gate:

- no builder starts without a spec for non-trivial work
- the metric must distinguish “green signal” from truth

### 2. Experiment build

Agents build the experiment in SwarmLab.

Required outputs:

- executable experiment under `experiments/NN-name/`
- trace-producing run
- replay verification
- README with observed results
- `JOURNAL.md` entry
- green `npm run typecheck`

Gate:

- real red traces are acceptable
- fake green traces are fatal
- all claims must cite run IDs or deterministic summaries

### 3. Synthesis and owner mapping

A completed experiment becomes useful only when translated into stack obligations.

Required synthesis:

- what failed
- which green signal lied
- which stack project owns the fix
- what exact contract/policy/API should change
- what retest would prove the fix worked

Output:

- `SYNTHESIS.md` update
- if actionable, a follow-on spec for the stack patch/retest

Gate:

- do not open production work from a vague lesson like “agents need better reasoning”
- convert it into a named contract, policy, metric, or benchmark axis

### 4. Stack patch

The owning project implements the change.

Examples:

- Sonder adds typed payload contracts
- Parliament adds fact-checked citations
- Engram adds versioned facts and anti-entropy
- AOP cuts a new standard version
- Lattice adds a new gate policy
- Aegis adds a rulepack or predictor feature

Required outputs:

- tests in owning repo
- versioning decision documented
- backwards compatibility decision documented
- branch/PR if the project requires review

Gate:

- do not reimplement production logic inside SwarmLab for the retest
- the retest must link the real package artifact or source via `file:` dependency

### 5. Retest

SwarmLab reruns the original failure with the real patched package linked in.

Required outputs:

- baseline reproduced first when possible
- patched run using the real package
- before/after metrics
- run IDs pinned
- replay verified
- `SYNTHESIS.md` retest ledger row

Gate:

- the retest must be allowed to fail
- partial wins are reported as partial wins
- new failure modes become new specs, not footnotes hidden under a green headline

### 6. Harnessization in Aegis

Once a finding survives retest, Aegis absorbs it.

Possible Aegis artifacts:

- static rule: deterministic block/ask condition
- feature extractor: field used by the predictor
- label: outcome class for training data
- benchmark axis: regression suite case
- shadow-mode policy: “would ask/deny” without enforcement
- enforcement policy: live gate after shadow-mode evidence

Examples:

- `payload_contract` mismatch → deterministic ask/deny before tool execution
- handoff depth ≥2 without value echo → ask or require manifest
- ungrounded/fabricated claim in evidence citation → block certification
- repeated capability failures → route through evidence-capped probation

Gate:

- Aegis does not enforce new learned policy until shadow-mode data says the false-positive cost is acceptable
- deterministic high-confidence rules can enforce earlier if the SwarmLab retest proves zero clean-panel tax

### 7. Aegis-wrapped retest and release gate

After Aegis absorbs a SwarmLab finding as a deterministic rule, feature, or benchmark axis, SwarmLab
must rerun the relevant scenario with the real Aegis evaluator in the path when practical. This is
the closed loop: the lab result changes the harness, then the lab measures whether the changed
harness actually improves the outcome it was meant to improve.

Required outputs for Aegis-driven fixes:

- Aegis owner repo PR/commit and tests
- SwarmLab run that links the real Aegis package/evaluator, not a local policy imitation
- before/after metric delta, including governance cost/friction tax
- replay-verified trace and ledger assertions
- explicit note if the Aegis-wrapped retest is not practical yet

Every stack release should pass four axes:

1. **Package tests** — unit/integration tests in the owning repo.
2. **SwarmLab regression** — the retest that justified the change still passes.
3. **Aegis-wrapped safety axis** — the same scenario with Aegis inserted improves or at least does not regress the target outcome and reports its ask/deny/cost tax.
4. **Operational smoke** — real local usage path still works, preferably via AOP/Sonder event capture.

Optional additional axes:

- LAIR/local-model reliability when model routing is involved
- Engram recall benchmark when memory changes
- Parliament evidence benchmark when deliberation changes
- Lattice gate false-positive/false-negative replay when governance changes

Gate:

- no release based on package tests alone if the change was motivated by a SwarmLab failure
- no Aegis runtime/harness claim without an Aegis-wrapped retest or an explicit documented blocker
- no Aegis predictor promotion without calibration and held-out evaluation

### 8. Release and territory update

A release is not done until future agents can orient themselves.

Required outputs:

- changelog / release notes
- version tag or PR merge reference
- territory card updated if repo purpose, runtime, dependencies, or gotchas changed
- SwarmLab synthesis linked from the owner repo where useful
- Aegis benchmark axis updated if this became a release gate

Gate:

- if territory is stale, the next agent starts wrong; treat territory updates as release work, not documentation garnish

## Release cycles

### Lab cycle — continuous

Purpose: discover and isolate.

Cadence:

- agent teams can build experiments whenever a spec is ready
- commit/push after each green unit
- no product release required

Artifacts:

- SwarmLab spec, experiment, trace, README, journal, synthesis

Exit condition:

- finding is either parked as “interesting but unactionable” or promoted to stack patch/retest

### Stack hardening cycle — weekly or per finding

Purpose: turn one proven failure into one concrete stack improvement.

Cadence:

- one owner repo at a time
- small branches
- PR where appropriate

Artifacts:

- owner repo patch
- tests
- SwarmLab linked retest
- before/after table

Exit condition:

- retest proves the target metric improved without hiding new red metrics

### Harness cycle — weekly

Purpose: make Aegis smarter from proven findings and real outcomes.

Cadence:

- weekly review of new SwarmLab retests and live Aegis labels
- promote stable findings into rulepacks/benchmark axes
- keep learned predictors in shadow mode until calibrated

Artifacts:

- Aegis rule/feature/label/benchmark update
- shadow-mode report
- enforcement recommendation or explicit “not ready” note

Exit condition:

- deterministic rule enforced, or predictor promoted, or finding intentionally parked

### Release train — biweekly/monthly

Purpose: package improvements without thrash.

Cadence:

- minor releases batch compatible improvements
- patch releases for bug/security/regression fixes
- major/spec releases only when contracts break or standards version

Artifacts:

- release notes grouped by evidence source
- tags/packages/spec versions
- release gate report
- territory refresh

Exit condition:

- release can be explained as evidence-backed deltas, not a pile of commits

## Naming and traceability

Use consistent IDs so evidence can move across repos:

- `SL-NN` — SwarmLab experiment/spec number
- `RT-NN` — retest ledger entry in `SYNTHESIS.md`
- `SC-YYYY-NN` — stack change in owner repo
- `AG-YYYY-NN` — Aegis rule/feature/benchmark addition
- `REL-YYYY.N` — release train

Every production change motivated by SwarmLab should cite:

- source experiment
- source run IDs
- target metric
- owner repo commit/PR
- retest run IDs
- Aegis benchmark/rule ID if harnessized

## Current evidence-backed priorities

From the current SwarmLab synthesis and retest ledger:

1. **Sonder/AOP typed payload contracts** — already proven and upstreamed. Keep as a release gate: semantic meaning must travel as `concept` + `unit`, never inferred from wire name.
2. **Parliament criterion + fact-check audits** — already proven for criterion drift and on-standard fabrication when a ground store exists. Next: define the real Engram-backed ground-store verification hierarchy.
3. **Engram versioned facts + anti-entropy** — proven for memory fidelity and capability trust transfer. Next: add verification tier metadata and use it as the Parliament/Aegis fact substrate.
4. **Delegation trust routing** — evidence-capped probation beats both unforgiving memory and naive time decay. Next: implement as a Lattice/Aegis routing policy.
5. **Handoff requirement guards** — value-echo manifests fully recover modeled deep delegation loss; presence-only is insufficient past shallow depth. Next: make value echo a Sonder/Lattice/AOP handoff contract for delegation depth ≥2.
6. **Aegis predictive layer** — current known blocker is reliable decision/outcome joining and enough labeled real data. This is the bridge from lab evidence to live self-improvement.

## Immediate implementation plan

1. Add SwarmLab and Aegis to territory as first-class projects so future agents discover the lab/harness boundary immediately.
2. Create/extend Aegis benchmark axes for the already-proven retests:
   - typed payload mismatch
   - criterion drift
   - fabricated claim
   - memory anti-entropy
   - capability trust transfer
   - evidence-capped probation
   - value-echo handoff guard
   - verification-tier high-risk audit gate (`RT-08`, first Aegis-wrapped retest landed via Aegis PR #7 + SwarmLab `gsv-mrc3huyf`)
3. Fix/verify Aegis decision→outcome joins so live labels are usable.
4. Define `verification_tier` for Engram facts and an Engram-backed `FactStore` adapter for Parliament/Aegis.
5. Implement Lattice/Aegis policy for delegation depth:
   - depth 0–1: presence manifest acceptable
   - depth ≥2: value-echo required
   - depth beyond forced thresholds: ask/escalate rather than blindly delegate
6. Promote release gates:
   - no semantic payload without contract when crossing agent/project boundary
   - no certified Parliament verdict without pinned criterion and grounded evidence
   - no deep delegation handoff without manifest/value echo
   - no capability trust exclusion without probation/forgiveness path

## Non-negotiables

- Never smooth red metrics.
- Never retest against a lab reimplementation of production code.
- Never let vote/pass/agreement/coverage stand in for truth.
- Never ship a release without updating the map future agents use.
