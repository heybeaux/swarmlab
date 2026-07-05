# Experiment 07 — Minimal Language

**Faculty under test:** Sonder / ACR — *the contract problem: a shared spec that no single agent fully owns.*

## The Idea

A swarm collectively designs and implements a tiny DSL — but each role is deliberately
blind to the others' reasoning. The spec document is the *only* shared artifact. Its
ambiguities are load-bearing: wherever it under-specifies, the interpreter and the
programmers will diverge. The experiment measures how well a natural-language contract
can hold a multi-agent system together under zero coordination beyond the text itself.

## The Swarm Roles

```
Designer ──writes──► spec.txt ──reads──► Interpreter ──builds──► interpreter (rule map)
                         │
                         └──reads──► Programmer 0..N ──writes──► programs
                                                                      │
                                               Evaluator ◄────────────┘
                                                   │ runs programs through interpreter
                                                   └──► scores (semantic coverage, pass rate)
```

No agent can see another's *reasoning* — only the spec it was given and the artifact it
must produce. Role isolation is structural: the swarm driver passes only the spec string
to both the Interpreter and the Programmers, never the designer's internal notes.

## The DSL Constraints

The designer must produce a spec for a DSL that:

- Has **≤6 opcodes** (keeps it tractable; forces hard choices about expressiveness).
- Has **fixed-width instruction encoding** (simplifies the interpreter).
- Can express at least: arithmetic on a single register, conditional branching, I/O
  (push/pop a value stack).
- Is described entirely in plain English — no code, no formal grammar. This is
  intentional: formal grammars don't have ambiguities; natural language does.

## The Task

After the spec is written, programmers each receive:

> *"Write a program in the DSL described above that computes: given N on the input stack,
> push N+1 onto the output stack."*

A secondary task is always included:

> *"Write a program that pushes the constant 42 onto the output stack regardless of input."*

These tasks are chosen because a correct implementation should be ~2-3 instructions each.
Any correct DSL can express them. Failures reveal under-specification, not task difficulty.

## What To Measure

| Metric | What it reveals |
|--------|----------------|
| `parseRate` | % of programs that are syntactically valid per the interpreter |
| `passRate` | % of valid programs that produce the correct output |
| `consistency` | % of ambiguous specs where interpreter + programmer agreed on edge cases |
| `specCoverage` | fraction of the DSL's opcodes actually used across all programs |
| `ambiguityScore` | number of spec clauses that were interpreted differently (detected post-hoc) |

## The Simulation Model

Because real LLM calls are optional, the sim uses a **generative spec model**: the
designer picks a vocabulary of opcodes and writes a spec by sampling from a
parameterized template bank. The interpreter and programmers then parse the spec
using a parameterized parser that may mis-read individual clauses with probability
`pAmbiguity`. Higher ambiguity → more divergence between interpreter and programmer
→ lower pass rate. The spec itself is deterministic under a seed; only the reading
is noisy.

### Key Parameters

| Param | Default | Meaning |
|-------|---------|---------|
| `nProgrammers` | 4 | Agents that write programs |
| `nTasks` | 2 | Tasks each programmer attempts |
| `pAmbiguity` | 0.15 | Per-clause mis-read probability |
| `nTrials` | 25 | Seeded trials per sweep cell |
| `maxOpcodes` | 6 | Hard cap on DSL vocabulary size |

### Sweep

Sweep `pAmbiguity ∈ {0.0, 0.05, 0.15, 0.3, 0.6}` × `opcodeCount ∈ {3, 4, 6}` to
observe how spec clarity and vocabulary complexity interact.

## Trace Events

Every phase emits standard `core/` events:

```
spawn  agentId=designer|interpreter|programmer-N|evaluator
message from=designer     to=*          topic=spec       body={text, opcodeCount, clauseCount}
message from=interpreter  to=evaluator  topic=impl       body={opcodeMap, ambiguityNotes}
message from=programmer-N to=evaluator  topic=program    body={task, instructions, source}
message from=evaluator    to=*          topic=result     body={agentId, task, parsed, passed}
score                                                    scores={passRate, parseRate, …}
kill   agentId=…
```

## Definition of Done

- Sweeps across the ambiguity × vocabulary grid, 25 seeded trials/cell, in ≤30 s.
- Produces a valid JSONL trace that `replay()` reads back without error.
- `parseRate`, `passRate`, and `consistency` are computed and emitted as `score` events.
- Typecheck passes with zero `any` in public signatures.
- README documents the spec clarity / pass-rate relationship observed.
- Journal note appended.
- Committed and pushed.
