# 07 — Minimal Language

**Faculty under test:** Sonder / ACR — *the contract problem.*

## What it tests

A swarm designs a tiny DSL collaboratively, but each role is *deliberately blind to the
others' reasoning*. The spec document is the only shared artifact. The experiment
measures how well a natural-language contract can hold a multi-agent system together.

Four roles, all isolated:

1. **Designer** — picks an opcode vocabulary (≤6 opcodes) and writes a spec in plain
   English. Some clauses are "fuzzy" — ambiguous phrasings that a careful reader might
   interpret differently.
2. **Interpreter** — reads only the spec and builds an opcode map. Fuzzy clauses trigger
   independent misreadings.
3. **N Programmers** (4) — also read only the spec and write programs for two tasks:
   "push N+1 onto output given N on input" and "push the constant 42 onto output".
4. **Evaluator** — the only agent with ground truth. Runs each program through the
   interpreter and scores correctness.

The key isolation: interpreter and programmers read the spec independently. Even if both
misread the same fuzzy clause, they may mis-read it *differently* — producing programs
that look correct to the programmer but fail at runtime, or pass runtime but give wrong
answers.

## Results

Swept `pAmbiguity ∈ {0.0, 0.05, 0.15, 0.3, 0.6}` × `opcodeCount ∈ {3, 4, 6}`,
25 seeded trials per cell.

```
p0-o3          | parse=1.00 pass=0.00 consist=1.00 cov=0.67 misread=0.00
p0-o4          | parse=1.00 pass=1.00 consist=1.00 cov=1.00 misread=0.00
p0-o6          | parse=1.00 pass=1.00 consist=1.00 cov=0.67 misread=0.00
p0.05-o3       | parse=1.00 pass=0.00 consist=0.97 cov=0.67 misread=0.00
p0.05-o4       | parse=1.00 pass=1.00 consist=1.00 cov=1.00 misread=0.00
p0.05-o6       | parse=1.00 pass=0.96 consist=0.95 cov=0.67 misread=0.04
p0.15-o3       | parse=1.00 pass=0.00 consist=0.87 cov=0.67 misread=0.08
p0.15-o4       | parse=1.00 pass=0.86 consist=0.82 cov=1.00 misread=0.16
p0.15-o6       | parse=1.00 pass=0.96 consist=0.85 cov=0.67 misread=0.08
p0.3-o3        | parse=1.00 pass=0.00 consist=0.70 cov=0.67 misread=0.16
p0.3-o4        | parse=1.00 pass=0.78 consist=0.64 cov=1.00 misread=0.36
p0.3-o6        | parse=1.00 pass=0.56 consist=0.38 cov=0.67 misread=0.80
p0.6-o3        | parse=1.00 pass=0.00 consist=0.33 cov=0.67 misread=1.12
p0.6-o4        | parse=1.00 pass=0.40 consist=0.29 cov=1.00 misread=1.32
p0.6-o6        | parse=1.00 pass=0.34 consist=0.18 cov=0.67 misread=2.04

summary:
  meanPassRate  @ pAmb=0.0:  0.667
  meanPassRate  @ pAmb≥0.3:  0.347
  pass rate drop:             0.320
  meanConsistency @ pAmb=0.0: 1.000
  meanConsistency @ pAmb≥0.3: 0.420
  consistency drop:           0.580
```

## What we observed

**1. Parse rate stays at 1.00 throughout.** Grammar is not the failure mode. The
spec's syntax is unambiguous — all programs are syntactically valid no matter how badly
the semantics were misread. The bugs are invisible at the structural layer and only
surface when you actually run the programs. This is the contract problem in miniature:
*syntax validation passes; semantic divergence is silent*.

**2. The 3-opcode spec fails at zero ambiguity.** With only 3 opcodes (LOAD, STORE, ADD),
there's no PUSH instruction — and without PUSH, neither the programmer nor the
interpreter can express a constant literal. The `const42` task always fails, giving
`pass=0.00` at all ambiguity levels. A spec that is internally consistent but
*expressively incomplete* is a silent failure: every program is syntactically correct,
none produce the right answer. The designer chose a vocabulary that can't cover the
required task space, and nothing in the evaluation pipeline flags it until runtime.

**3. Ambiguity degrades consistency sharply, and consistency predicts pass rate.** At
`pAmbiguity=0` consistency is 1.00; at `pAmbiguity=0.6` it drops to 0.18–0.33. When
programmer and interpreter disagree on what `ADD` or `STORE` means, the programmer's
program is semantically wrong under the interpreter — even though it would be correct
under their own reading. Pass rate tracks consistency closely: `p0.6-o4` has
`consist=0.29`, `pass=0.40`. The spec no longer holds the system together.

**4. More opcodes amplify ambiguity damage.** At `pAmbiguity=0.6`, moving from 4 to 6
opcodes drops consistency from 0.29 to 0.18 and increases mean misread clauses from
1.32 to 2.04. Each additional fuzzy clause is an independent failure point. A richer
vocabulary with ambiguous semantics is worse than a smaller clear one.

**5. There is a "safe range" around 5% ambiguity.** At `pAmbiguity=0.05`, performance
is essentially perfect for 4- and 6-opcode specs (pass=1.00 and 0.96). A small amount
of natural-language fuzziness doesn't break the contract — the spec is resilient to
incidental ambiguity. The breakage accelerates past 15%.

## The Sonder/ACR argument

This is a concrete, measurable instance of the contract problem. The spec is the only
shared coordination mechanism; every divergence from it is undetectable until the
evaluator runs programs through the interpreter. Three properties ACR/Sonder need to
enforce, made visible here:

- **Semantic versioning for specs.** A spec that changes even one fuzzy clause can break
  the interpreter-programmer contract silently — parse rate stays 1.00, nothing looks
  broken. Sonder's event bus needs semantic checksums, not just syntax validation.

- **Ambiguity scoring at design time.** The designer should be required to emit a
  clause-level ambiguity score as part of the spec artifact. Clauses with "soft"
  phrasings ("brings into scope", "saves the current top") score high; the system should
  refuse to propagate a spec whose ambiguity score exceeds a threshold.

- **Expressiveness floor.** The 3-opcode failure is a completeness check that runs at
  design time, not evaluation time. ACR should gate spec propagation on task-coverage
  smoke tests before any interpreter or programmer sees the spec.

## Run it

```bash
npm run build
node experiments/07-minimal-language/dist/main.js
```

Env knobs: `ML_TRIALS`, `ML_PROGRAMMERS`, `ML_MAX_OPCODES`, `ML_SEED`.

## Files

- `types.ts` — DSL types: `DslSpec`, `Instruction`, `Program`, `InterpreterImpl`, `TrialResult`.
- `designer.ts` — spec generation from a parameterized opcode pool + template bank.
- `interpreter.ts` — spec parsing with a divergence model + program execution engine.
- `programmer.ts` — program synthesis from a given spec reading.
- `evaluator.ts` — correctness scoring: parse rate, pass rate, consistency, coverage.
- `main.ts` — sweep runner, core spawn/bus/trace wiring, replay verification.
- `runs/*.jsonl` — traces (replay-verified).
