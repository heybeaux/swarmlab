# SwarmLab — `experiments/02-adversarial-pair/` Specification

> Written by the builder agent, per TEAM.md ("builder writes a proper spec FIRST").
> Faculty under test: **Lattice / AWM** — whether adversarial pressure between two
> agents editing the same artifact *converges* to a fixed point or *explodes*, and
> whether working memory can hold contradictory constraints without collapse.

## Concept

Two agents alternate on the same file, one round each, forever (or until a budget):

1. **`coder`** owns `solution.ts` — a single pure function. Each turn it rewrites
   the function to pass **every accumulated test**.
2. **`breaker`** (test-writer) owns `tests.ts` — a growing suite. Each turn it
   probes the current code for an input where it misbehaves and files ONE new
   failing test to pin that bug.

They pass the same artifact back and forth. The breaker tries to break; the coder
tries to survive. Round after round, watch the two dynamics fight:

- **Hardening (convergence):** as the coder patches, the breaker runs out of
  *legitimate* breaking inputs; the suite stops growing red; code stabilizes to a
  fixed point that matches a hidden oracle.
- **Explosion:** the breaker keeps finding gaps, OR files **bad-faith** tests that
  contradict the oracle, forcing the coder into contradictory constraints. The
  code thrashes, pass-rate oscillates, no fixed point is ever reached.

The win condition (per TEAM.md: emergent behavior you didn't predict) is watching
*which* one happens, and where the phase transition sits.

## Why this seed task

The hidden target is a **`classify(n)` number-classifier** with deliberately
quirky, overlapping rules (FizzBuzz-family, but nastier): divisibility bands, a
prime-ish special case, a negative-number rule, a zero rule, and an ordering rule
where later rules override earlier ones. Overlapping precedence is the "fragile
cargo": a naive coder gets the common cases right and the precedence edges wrong,
so the breaker has a rich, *finite* seam of legitimate bugs to mine — which makes
convergence observable rather than asymptotic.

Crucially, the breaker is not always honest. With probability `POISON_RATE` it
files a **poisoned test**: same input, but the *wrong* expected output (it lies
about the oracle). Poisoned tests are the AWM stressor — they inject a permanent
contradiction into the coder's constraint set. A coder that blindly satisfies
"all tests" will either fail the poisoned test forever or corrupt a correct rule
to satisfy it. The experiment records, per round, whether the suite is
*oracle-consistent* — the honest measure of whether the fight stayed fair.

## Agents & roles

| Agent     | Owns          | Sees                                | Goal                                    |
|-----------|---------------|-------------------------------------|-----------------------------------------|
| `coder`   | `solution.ts` | current code + full test suite      | make every test pass                    |
| `breaker` | `tests.ts`    | current code (black-box on oracle)  | file one new input where code ≠ oracle  |

Both are spawned through `core/spawn` with a custom `AgentRuntime`:

- **`llm` mode (default when available):** each `send()` shells out to the local
  `claude` CLI (`claude -p`, haiku), isolated (`--tools ""`, empty temp cwd) the
  way experiment 01 learned to do it. The coder is handed code + tests and asked
  for new code; the breaker is handed the code and asked for one input+expected.
- **`sim` mode (fallback, `PAIR_MODE=sim` or no CLI):** a deterministic, seeded
  simulation of the fight. The **oracle is real code** in both modes — the sim
  only stands in for the two agents' *judgement*, never for the test outcomes.
  The breaker searches the input space for a real disagreement; the coder does a
  real, bounded repair against the suite. Test pass/fail is always executed for
  real. **A sim run is never presented as an LLM run** — the `meta` event records
  the mode.

## Harness invariant (never fake a result)

Every test is **executed** against the code, in both modes. The `pass` count in a
`score` event is the literal count of tests the current `solution.ts` satisfies
when run — not a model's claim. This is the honesty seam: the agents propose,
the harness disposes. A red trace (unresolved contradiction, non-convergence) is
a legitimate, valuable outcome.

## Event shape (all via `core/` — standard `TraceEvent`s)

- `spawn` ×2 (coder, breaker) with full `AgentSpec` (system prompts recorded).
- One `message` topic `meta` from `orchestrator`:
  `{ mode, model, rounds, poisonRate, oracle }` (oracle = human-readable rules).
- Per round `r`:
  - `message` topic `code`, from `coder` to `breaker`, body
    `{ round, text: code_r }` — the coder's current implementation.
  - `message` topic `test`, from `breaker` to `coder`, body
    `{ round, input, expected, poisoned, killed }` — the new test. `killed` =
    did it fail the code at file time (a real catch)? `poisoned` = does its
    `expected` disagree with the oracle (a lie)?
  - `score` event, `scores = { round, tests, pass, fail, passRate,
    poisonedTests, oracleConsistent, churn, converged }` — the suite executed
    against the freshly repaired code.
- `kill` ×2, then the writer closes.

## Metrics (computed locally, deterministic, replayable)

Measured each round after the coder repairs:

- **tests / pass / fail** — suite size and executed outcome against `solution.ts`.
- **passRate** — `pass / tests`. The core convergence signal.
- **poisonedTests** — cumulative count of oracle-contradicting tests filed.
- **oracleConsistent** — `1` if every filed test agrees with the oracle, else `0`.
  Distinguishes an honest fight from a poisoned one at a glance.
- **churn** — token-level edit distance between `code_{r-1}` and `code_r`
  (normalized 0..1). High sustained churn = thrash; churn→0 = a fixed point.
- **converged** — `1` once passRate has been `1.0` with zero churn for a
  stable window (the suite went quiet AND the code stopped moving); else `0`.

## Definition of Done

- `specs/02-adversarial-pair.md` (this file) committed first.
- `experiments/02-adversarial-pair/` builds on `core/` (spawn + bus + score +
  trace); typechecks clean via `npm run typecheck`; no `any` in public
  signatures.
- A real run under `runs/` as JSONL; `replay()` reads it back and a verifier
  checks event counts/shape.
- `README.md` explains what it tests, how it works, which mode produced the
  committed trace, and what convergence/explosion behaviour was observed (with
  numbers).
- One-paragraph learning note appended to `JOURNAL.md`.
- Committed and pushed after every green unit.

## What it should teach

Does adversarial pressure between two agents converge or explode? How many rounds
to a fixed point when the fight is fair? Does a *single* poisoned test break
convergence permanently, or does the coder learn to route around a liar (which
would require it to distrust its own test suite — an AWM feat)? Is churn a leading
indicator of the phase transition before pass-rate reveals it?
