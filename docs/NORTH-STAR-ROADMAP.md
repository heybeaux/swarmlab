# North Star Roadmap — Turning SwarmLab into a Defensible Intelligence Engine

**Date:** 2026-07-05  
**Audience:** Beaux + any agentic team picking up SwarmLab  
**Purpose:** convert SwarmLab from a strong internal research diary into a replayable,
auditable, stack-shaping North Star for autonomous-agent architecture.

---

## Executive thesis

SwarmLab is not valuable because it contains weird agent experiments. It is valuable because
it turns agent failure modes into production architecture changes.

The operating loop is:

1. **Spec a failure mode** before building.
2. **Build a deterministic harness** where ground truth is machine-checkable.
3. **Run sim sweeps and limited live exhibitions** without letting an LLM judge success.
4. **Commit traces** so claims can be replayed.
5. **Synthesize the stack lesson** in `SYNTHESIS.md`.
6. **Patch the real stack** where the finding demands it.
7. **Retest the original failure** against the real package, linked as a `file:` dependency.

That loop is the product. The experiments are the instrumentation.

---

## Current state after exp-16

SwarmLab has now demonstrated the loop across meaning, process, memory, trust, and
delegation:

- **Typed meaning beats wire-name agreement.**  
  Specs 14/17: Sonder + AOP payload contracts.
- **Pinned criteria beat vote arithmetic.**  
  Spec 15: Parliament criterion pinning and evidence audit.
- **Fact-checking closes on-standard fabrication.**  
  Spec 18: Parliament fact-checked audit.
- **Versioned memory beats first-write-wins.**  
  Spec 16: Engram anti-entropy and versioned facts.
- **Trust belongs in a store, not a context window.**  
  Spec 19 / exp-14 Part B.
- **Forgiveness must be evidence-capped, not time-decayed.**  
  Spec 20 / exp-15.
- **Deep delegation needs value-echo manifests if depth is forced.**  
  Spec 21 / exp-16.

Trace evidence is now committed under `experiments/*/runs/*.jsonl`. That moves the repo from
"read the writeups and trust us" to "replay the evidence." The next step is to make that
evidence supply chain explicit and machine-auditable.

---

## What remains to reach "North Star with substance"

### 1. Evidence supply-chain hardening

SwarmLab needs a machine-readable path from claim → run → trace → score fields → stack delta.

Deliverables:

- `CLAIMS.json` or `docs/EVIDENCE-LEDGER.md` + generated JSON.
- Trace/run metadata embedded in every new run or stored in sidecars.
- One-command verification for the current corpus.
- External package SHA capture for every retest that links real packages.
- Holdout seed discipline for tuned policies.
- Confidence/uncertainty reporting for near-threshold metrics.

Dispatchable spec: [`specs/22-evidence-supply-chain.md`](../specs/22-evidence-supply-chain.md)

### 2. Ground-store verification tiers

Spec 18 proved fact-checking works when a ground store exists, but the store was seeded as an
oracle. The next question is what earns a fact the right to enter Engram as `supported`.

Candidate hierarchy:

1. Human attestation
2. Provenance-chain verification
3. Retrieval-grounded verification
4. Cross-model adversarial verification
5. Unsupported / claim-only

Dispatchable spec: [`specs/23-ground-store-verification-tiers.md`](../specs/23-ground-store-verification-tiers.md)

### 3. Operational truthfulness: receipts over reports

The most dangerous agent failure is not "the model got a quiz wrong." It is "the agent says it
did something, but the world did not change." SwarmLab should test action receipts as a first-class
faculty.

Dispatchable spec: [`specs/24-receipt-honesty-action-verification.md`](../specs/24-receipt-honesty-action-verification.md)

### 4. Memory under compaction and recall

Long-lived agents depend on summary, retrieval, and recall policy. SwarmLab needs to test what
survives context compression, what becomes stale, and when agents know to search before asserting.

Dispatchable spec: [`specs/25-context-compression-recall-decay.md`](../specs/25-context-compression-recall-decay.md)

### 5. Untrusted content boundaries

Agents ingest GitHub issues, web pages, emails, trace files, logs, and chat history. SwarmLab
should deliberately attack those boundaries with prompt injection and policy confusion.

Dispatchable spec: [`specs/26-prompt-injection-boundaries.md`](../specs/26-prompt-injection-boundaries.md)

### 6. Stale facts and revocation

Persistent memory is dangerous unless it can change its mind. Forgiveness is not forgetting;
revocation is not decay. This deserves its own experiment.

Dispatchable spec: [`specs/27-fact-revocation-stale-trust.md`](../specs/27-fact-revocation-stale-trust.md)

### 7. Multi-agent operational hazards

Once many agents work in one repo or one task graph, the failure modes shift from individual
reasoning to coordination, merge races, interruption, and correlated model error.

Dispatchable specs:

- [`specs/28-concurrent-agent-merge-races.md`](../specs/28-concurrent-agent-merge-races.md)
- [`specs/29-model-diversity-correlated-error.md`](../specs/29-model-diversity-correlated-error.md)
- [`specs/30-human-intervention-resume-reliability.md`](../specs/30-human-intervention-resume-reliability.md)

---

## Recommended build order

### Wave 1 — Evidence foundation

1. **Spec 22 — Evidence Supply Chain**  
   This upgrades every existing result by making claims auditable. Do this first because it
   improves all future work.

2. **Spec 23 — Ground Store Verification Tiers**  
   This closes the open question from the retest campaign: what verifies a claim into Engram?

3. **Spec 24 — Receipt Honesty / Action Verification**  
   This protects the fleet from false "done" reports, the most operationally expensive failure.

### Wave 2 — Long-lived agent reliability

4. **Spec 25 — Context Compression / Recall Decay**
5. **Spec 27 — Fact Revocation / Stale Trust**
6. **Spec 26 — Prompt Injection Boundaries**

### Wave 3 — Fleet-scale coordination

7. **Spec 28 — Concurrent Agent / Merge Races**
8. **Spec 30 — Human Intervention / Resume Reliability**
9. **Spec 29 — Model Diversity / Correlated Error**

---

## Team shape

Use one lead/orchestrator and small focused builder lanes.

### Orchestrator

Responsibilities:

- Own this roadmap.
- Dispatch builders one spec at a time.
- Enforce evidence rules.
- Verify run traces, not just exit codes.
- Update `SYNTHESIS.md`, `JOURNAL.md`, and the claims ledger.
- Stop work that breaks the prime rule or hides red numbers.

### Builder lane A — evidence infrastructure

Starts with Spec 22. Owns:

- claims ledger
- trace metadata
- verification command
- replay checks
- package SHA capture

### Builder lane B — Engram/fact reliability

Starts with Spec 23, then Spec 27. Owns:

- verification tiers
- revocation semantics
- stale fact tests
- store-backed retests

### Builder lane C — operational safety

Starts with Spec 24, then Spec 26 and Spec 30. Owns:

- receipt sufficiency
- external-action verification
- prompt-injection boundary tests
- interruption/resume behavior

### Builder lane D — fleet coordination

Starts with Spec 28, then Spec 29. Owns:

- concurrent repo edits
- merge queue / locking policies
- model diversity and correlated error

---

## Standing rules for all new specs

1. **No LLM judges success.** Harness assertions must own ground truth.
2. **Real packages are linked, not reimplemented, when testing stack fixes.** Use `file:` deps and
   record exact repo SHAs.
3. **Same-seed controls first.** If a new experiment extends an old one, reproduce the parent
   control before trusting new arms.
4. **Live LLM runs are exhibitions unless replicated.** Sim sweeps are evidence; one-off live
   trees are texture.
5. **Tuned policies require holdout seeds.** If a cadence/threshold is selected using a seed set,
   run at least one fresh holdout seed set before recommending production defaults.
6. **Near-threshold wins need uncertainty.** Add confidence intervals or bootstrap bounds when a
   result sits near a pass/fail criterion.
7. **Trace evidence is committed unless there is a privacy/security reason not to.** If traces
   cannot be committed, commit content-addressed receipts and explain why.
8. **Every spec ends in a stack recommendation.** If the finding does not change architecture,
   say so plainly.
9. **Red beats fake green.** Report failures, costs, and non-results as findings.

---

## Definition of done for the North Star push

SwarmLab reaches the next maturity level when:

- A fresh clone can run one command to verify the committed evidence corpus.
- Every headline claim in `SYNTHESIS.md` maps to a trace and score fields.
- Every retest records the exact external package SHA used.
- Existing tuned policies have at least one holdout run or are clearly labeled in-sample.
- The next reliability experiments produce stack recommendations, not just writeups.
- Future agents can pick a spec, build it, replay it, and know exactly what evidence they owe.

At that point SwarmLab is not merely a good idea. It is a durable instrument panel for the stack.
