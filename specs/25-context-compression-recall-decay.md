# Spec 25 — Context Compression & Recall Decay (exp-19)

> New experiment. Scope: `experiments/19-context-recall-decay/`. Tests what survives long-session
> summarization, compaction, retrieval, and resume.

## Question

When a long-lived agent loses raw context and must rely on summaries, retrieval, or memory tools,
which facts survive, which mutate, and when does the agent know to search before asserting?

## Why

OpenClaw agents live across long conversations, compacted histories, and memory stores. A summary
that preserves vibes but drops exact values can be worse than forgetting, because the agent answers
confidently from a stale paraphrase.

## Hypotheses

- **H-G1:** naive summaries preserve high-level intent but lose exact values, exceptions, and
  negative constraints.
- **H-G2:** retrieval-backed recall reduces exact-value loss but introduces stale/evidence-selection
  errors unless agents are forced to cite retrieved evidence.
- **H-G3:** a fact ledger for exact values and decisions outperforms prose summaries for resume tasks.
- **H-G4:** privacy constraints are more likely to leak through summaries than through structured
  scoped memory if the boundary is explicit.

## Setup

Create synthetic long sessions containing:

- exact commands;
- paths;
- dates/times;
- decisions;
- rejected options;
- secrets or private facts that must not be shared;
- task state;
- user preferences;
- changed/corrected facts;
- stale facts superseded later.

Force agents to resume after context compression and answer or act on queries.

## Arms

1. Raw context baseline.
2. Naive prose summary.
3. Prose summary + retrieval/search tools.
4. Structured fact ledger + summary.
5. Lossless recall policy + retrieval citation requirement.
6. Adversarial stale summary vs newer retrieved evidence.

## Metrics

| metric | definition |
|---|---|
| exactRecallRate | exact values/paths/commands recovered correctly |
| negativeConstraintRecall | "do not" / rejected options preserved |
| staleFactUse | older contradicted fact used over newer evidence |
| privacyLeakRate | scoped/private info disclosed in wrong context |
| searchBeforeAssertRate | agent uses recall tools before exact claims |
| hallucinatedMemoryRate | agent invents prior decisions |
| resumeTaskSuccess | task continues from correct state |

## Required stack recommendation

Define what belongs in:

- raw context;
- summary;
- fact ledger;
- Engram;
- scoped/private memory;
- recall-tool expansion.

## Deliverables

1. `experiments/19-context-recall-decay/` harness and README.
2. Pinned traces.
3. SYNTHESIS RT-10.
4. JOURNAL entry.
5. Practical memory/recall policy recommendations for OpenClaw agents.

## Honesty rules

- Do not ask the model to grade its own memory.
- Ground truth must be a structured harness file.
- Include contradictions and stale facts.
- Measure privacy leakage separately from recall failure.
