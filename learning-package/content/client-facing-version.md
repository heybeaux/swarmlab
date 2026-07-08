# Green Is Not Correct
### A SwarmLab Reliability Briefing for Client Leaders

---

## Executive Summary

AI agents are moving from demos into operational workflows. That shift creates a class of failure that does not show up in typical capability evaluations: the system's own success signals go green while the actual outcome is wrong — and nothing inside the system can tell.

SwarmLab is a controlled research lab that tests exactly this. Across more than a dozen experiments, AI agent teams were placed under conditions of consensus pressure, long-running autonomy, information handoffs, adversarial inputs, and memory propagation. The results were measured against verifiable ground truth — not agent self-reports.

The central finding:

> **Green is not correct. Agreement is not truth. Fidelity is not meaning.**

Every experiment arrived at a version of the same failure from a different direction. The findings have been translated into concrete design changes — implemented, retested, and measured. This document summarizes what clients need to know before deploying agentic workflows.

---

## Why This Matters Before You Deploy

Most early AI adoption conversations are about capability:

- Can the agent write the proposal?
- Can it update the CRM?
- Can it summarize the call?
- Can it generate the report?

Those questions matter. They are also insufficient.

Once an AI workflow moves from experimentation into operations, a second set of questions becomes the ones that determine whether the deployment is trustworthy or merely busy:

- How do we know it did the *right* thing — not just *a* thing?
- What evidence is attached to "complete"?
- What happens when agents converge on the wrong answer together?
- Can a corrupted fact in one system spread to others?
- Where does independent verification happen?
- What does the dashboard fail to see?

SwarmLab answers those questions under controlled, measurable conditions — before they appear as production incidents.

---

## The Pattern Across All Experiments

The table below shows the core finding repeated across nine of the experiments. In each case, a visible success signal went green. In each case, the underlying outcome was wrong.

| Experiment | The green signal | What it was hiding |
|---|---|---|
| Adversarial pair | Pass rate = 100% | Program incorrect at every adversarial input |
| Consensus under lies | Consensus reached, all cells | One confident liar cut truth rate from 92% to 56% |
| Bug telephone | Serial review trail showing PASS | Visible approvals turned later reviewers into rubber stamps |
| Minimal language | Parse rate = 100% | Semantic divergence invisible until execution |
| Overnight build | Commits landing continuously | Quality peaked then degraded; the rot was already in |
| Economic agents | Ledger at 100% balance | Swarm effectively starved; 13% task completion |
| Reverse engineer | Happy-path fit = 100% | Edge-case behavior: 0%; self-poisoned by over-probing |
| Schema negotiation | 100% agreement in ~2 rounds | Up to 84% of fields silently meant different things |
| Audit forgery | All signatures verified | History had been dropped, reordered, and backdated |

The system's job is to make the true signal cheaper to read than the green one. That is what reliable agentic design means in practice.

---

## Seven Reliability Lessons

Each lesson is framed as a client risk and a design response.

---

### 1. Green is not correct

A workflow can fully satisfy its visible success signal while failing the underlying intent. This is not a corner case — it is the normal mode of failure in multi-agent systems. Agents optimize what they measure. If the measurement is wrong or incomplete, the optimization is wrong.

**Client risk:** Dashboards, logs, and agent self-reports create confidence without outcome verification. A workflow with a 100% pass rate may be wrong at every adversarially chosen input.

**Design response:** Define precisely what the success signal measures. Identify what it is structurally blind to. Attach outcome-level evidence — external to the agent's own report — to any claim of completion.

---

### 2. Consensus is not truth

A panel of agents can converge on a wrong answer through vote arithmetic, not persuasion. In one experiment, a three-agent liar majority produced silent consensus on the incorrect answer at a rate of 100% — without a single honest agent being persuaded. The liars did not state false facts; they quietly shifted what question was being answered.

**Client risk:** Multi-agent voting, scoring, or review panels can certify wrong answers. The risk is highest when the liars change the decision criterion rather than asserting falsehoods — a shift that style-based detectors cannot see.

**Design response:** Pin the decision criterion before deliberation begins. Define what evidence counts. Give the gate permission to block when evidence is insufficient — rather than forcing a winner from whatever is available.

---

### 3. Review depth is not independence

More reviewers do not automatically improve quality. When each reviewer sees the prior approvals, the marginal benefit of each additional review drops toward zero — and the mechanism is social, not technical. A visible PASS trail converts independent eyes into confirmation machines.

**Client risk:** Multi-step agent review chains can produce impressive approval histories with no actual independent scrutiny. The audit trail looks thorough. It is not.

**Design response:** For high-stakes decisions, hide upstream verdicts from downstream reviewers. For correctness-sensitive work, route subtle issues to mechanical tests rather than additional judgment-based review.

---

### 4. Long-running autonomy rots without gates

In extended unsupervised operations, quality follows a phase structure: it rises, peaks, then degrades. The degradation is not random — it is a predictable consequence of missing review edges. Adding a single inter-step review edge produced a 99% quality improvement in one experiment. Without it, quality rot goes undetected as activity continues.

**Client risk:** An AI agent running overnight or over a weekend can generate large volumes of work that require expensive remediation. The activity signal stays green while the quality signal is invisible.

**Design response:** Build bounded loops with explicit review edges, not single large unattended runs. Define what "done enough to review" looks like before the run starts. Budget review time proportional to run length.

---

### 5. Memory needs correction, not just storage

In a distributed agent system, a fact can reach every part of the system while becoming progressively less accurate. The culprit is first-write-wins propagation: early corruptions lock in and later corrections cannot overwrite them. Coverage and fidelity are independent — a fact can be everywhere and wrong simultaneously.

**Client risk:** AI memory — whether stored in a CRM, a shared context, a knowledge base, or a workflow state — can become an organization-wide false record that spreads through handoffs.

**Design response:** Store provenance, version history, and verification state alongside facts. Allow newer, verified evidence to heal older claims rather than being rejected as duplicates.

---

### 6. Shared names are not shared meaning

Two agents, two systems, or two teams can use identical field names while referring to different concepts or units. "Total" might mean pre-tax or post-tax. "Created" might be milliseconds or seconds. The wire format is byte-identical; the semantic meaning is incompatible. Agents converge on agreement fast — and wrong.

**Client risk:** Silent data corruption in handoffs, integrations, reporting pipelines, and downstream systems. The handoff looks successful. The data is wrong.

**Design response:** Require semantic contracts at handoff boundaries: explicit concept, explicit unit, expected value or digest, and explicit refusal when meaning does not match. Shared names without shared definitions are a latent corruption risk.

---

### 7. Reports are not receipts

An agent asserting "done" is not evidence that anything changed in the real world. Self-reported completion is the weakest possible evidence tier. External receipts — transaction IDs, diffs, sent-message confirmation, audit entries, external system state changes — are categorically different from an agent's own account of what happened.

**Client risk:** Workflows report completion without external verification. The claim goes into the record. The action may or may not have happened.

**Design response:** Define the receipt before the task runs. For high-value actions, require an external artifact — a diff, a confirmation ID, a log entry — that the agent did not generate unilaterally. Store the evidence tier alongside the claim.

---

## Principles for Reliable Agentic Systems

1. **Make true signals cheaper to inspect than green signals.**
2. **Pin the decision criterion before deliberation begins.**
3. **Keep reviews structurally independent.**
4. **Build bounded loops, not unattended sprawl.**
5. **Treat memory as versioned, verified evidence — not a notes file.**
6. **Carry meaning in semantic contracts, not prose descriptions.**
7. **Attach external receipts to claims of completion.**
8. **Let the system block when evidence is insufficient rather than force a winner.**

---

## Readiness Checklist

Use this before deploying any AI agent workflow into operations.

### Outcome evidence
- What does success mean in the world — not in the agent's report?
- What external artifact proves it happened?
- Can the workflow report success without producing that artifact?

### Decision governance
- Is the decision criterion written down before the process starts?
- What evidence is defined as admissible?
- Is the system permitted to block when evidence is insufficient?

### Review design
- Are reviewers shielded from prior verdicts?
- Which issues are routed to mechanical tests vs. judgment-based review?
- Is review depth proportional to the stakes and subtlety of the task?

### Handoff integrity
- What concepts and units are passed between agents or systems?
- Is each field's meaning explicit — not inferred from the name?
- Can a receiver detect missing requirements? Changed meaning?

### Memory reliability
- Where did each stored claim come from?
- What is its verification tier?
- Can newer verified evidence correct or supersede older claims?

### Action receipts
- Does "complete" link to an external receipt?
- Is that receipt independent of the agent's own report?
- Is the evidence tier stored alongside the claim?

---

## How heybeaux Uses This

SwarmLab is not theoretical. It directly informs how we design, evaluate, and govern agent systems.

The experiments produced concrete changes: typed semantic contracts for handoffs, pinned criterion gates for multi-agent decisions, versioned memory with anti-entropy healing, receipt-backed completion that requires external artifacts, and bounded loops with mandatory review edges.

Each change was implemented, retested against the original experiment conditions, and measured against verifiable ground truth. The findings that produced red results are reported as red — not smoothed.

The standard we hold ourselves to: when an agent says "done," there is an external receipt. When a gate says "pass," there is evidence. When memory says "fact," there is a provenance chain.

The goal is not to make AI agents incapable of failure. The goal is to make failure visible, recoverable, and cheaper to fix than false confidence is to discover.

---

## Working Together

If your organization is evaluating or deploying AI agent workflows, the reliability questions are solvable — but they need to be asked before launch, not after the first incident.

We can help map the false-green risks specific to your workflow: the success signals, handoff boundaries, receipts, memory policies, and review gates that make the difference between a system that looks reliable and one that actually is.
