# 02 — Adversarial Pair Programming

**Faculty under test:** Lattice / AWM — whether adversarial pressure between two
agents editing the same artifact converges to a fixed point or explodes, and
whether working memory can hold contradictory constraints without collapse.

## What it tests

Two agents alternate on the same file, one round each. `coder` owns
`solution.ts` — a single pure `classify(n)` function. `breaker` owns `tests.ts`
— a growing suite. Each round the coder publishes its current code; the breaker
probes it (black-box, it never sees the oracle) for one input where the output
is wrong and files a single failing test; the coder then rewrites `classify` to
pass the *whole* accumulated suite. Repeat.

The hidden target is a FizzBuzz-family classifier with overlapping,
precedence-sensitive rules — the fragile cargo: `zero > neg > prime > fizzbuzz
> buzz > fizz > number`, later rules overriding earlier ones. A naive coder
nails the common cases and botches the precedence edges, so the breaker has a
rich but *finite* seam of legitimate bugs to mine — which makes convergence
observable rather than asymptotic.

The twist that stresses AWM: with probability `PAIR_POISON` the breaker files a
**poisoned test** — same input, but the *wrong* expected label (it lies about
the oracle). Poison injects a permanent contradiction into the coder's
constraint set. A coder that blindly satisfies "all tests" will ship a program
that is fully green yet *wrong*.

## The honesty seam (never fake a result)

Every test is **executed** against the code, in both modes (`src/oracle.ts`).
The `pass` count in a `score` event is the literal count of tests the current
implementation satisfies when run — not a model's claim. To make this airtight
offline, the coder's artifact is modelled as an ordered rule list
(`src/code.ts`) that both **compiles to a real executable function** (the
harness runs it) and **renders to readable TypeScript** (stored verbatim in the
trace). The agents propose; the harness disposes.

## How it works

Built entirely on `core/`: both agents come from `spawnAgent` (real
spawn/kill + `AgentSpec` records). Game moves run through a `PairAgents` seam
with two backends:

- **`llm`** (default): real calls through the local `claude` CLI (`claude -p`,
  `claude-haiku-4-5-20251001`), isolated with `--tools ""` from an empty temp
  cwd — the isolation lesson inherited from experiment 01. The breaker returns
  `INPUT|EXPECTED`; the coder returns a rule list. Unparseable output fails the
  move honestly (breaker gives up; coder no-ops) rather than inventing a result.
- **`sim`** (`PAIR_MODE=sim`, or when the CLI is absent): a deterministic seeded
  simulation of the two agents' *judgement only*. The breaker does a real
  exhaustive scan of the input domain for a genuine code-vs-oracle disagreement;
  the coder does a real, evidence-gated generalization + residue-pinning repair.
  Test outcomes are always executed for real. The `meta` event records the mode;
  a sim trace is never presented as an LLM result.

Run it: `npm run build && node experiments/02-adversarial-pair/dist/main.js`
(env: `PAIR_ROUNDS`, `PAIR_MODE`, `PAIR_POISON`, `PAIR_SEED`).

## What we observed

### Sim, fair fight (`PAIR_POISON=0`) — convergence in 3 rounds

The adversarial pressure **converges to a fixed point**. Rounds 0–2 each surface
one new bug class (a divisibility/prime/edge input the naive coder gets wrong);
each bug lets the coder install one *structural* rule, generalizing the whole
class rather than memorizing the input. By round 3 the breaker scans the entire
`[-30, 100]` domain and finds **no remaining honest bug — it gives up**. Churn
goes to 0, pass-rate is 1.0, and `converged` latches at round 5 (after a
3-round quiet window). Final state: **3 tests, 3 rules, code === oracle.** This
is the "test-hardening" story: the breaker's pressure drives the coder to the
correct generalization, then evaporates.

### Sim, poisoned fight (`PAIR_POISON=0.3`) — green but wrong

A single control parameter changes everything. With 30% of the breaker's tests
being lies, **pass-rate stays 1.0 the entire run** — the coder always satisfies
its suite, including the poison, by pinning each lie as an exact-input override.
But `oracleConsistent` flips to **0**: the shipped program is now *wrong* at
every poisoned input. And convergence is **delayed from round 5 to round 29**,
because each lie about (say) a prime input *vetoes* the coder installing the
`prime` rule class — so generalization collapses and the coder is forced back
into memorization, forcing the breaker to enumerate nearly the whole domain (27
tests) before it runs out of honest bugs. **A green suite is not a correct
program.**

### Sim, heavy poison (`PAIR_POISON=0.8`) — generalization fully suppressed

At 80% poison, structural generalization never installs at all; the coder
degrades to pure case-memorization of an almost-entirely-corrupt suite.
`converged` never fires within 25 rounds, `oracleConsistent=0`, 24/25 tests are
lies. The phase transition is smooth in the poison rate: honest pressure hardens
the code; bad-faith pressure dissolves its ability to generalize.

### LLM (`ap-mr7abao5`, `claude-haiku-4-5`, isolated, 4 rounds) — an honest red

The real run is the opposite of the crisp sim, and more instructive for it. Two
pathologies, both faithfully captured (not smoothed over):

- **The breaker gave up on rounds 0–2** — handed obviously-incomplete code (no
  negative / zero / prime handling at all), the haiku breaker returned `GIVEUP`
  or unparseable output three times running. Without the oracle in front of it,
  it could not *tell* that `classify(0)` or `classify(-4)` was wrong. The sim
  breaker, which scans the domain against the real oracle, catches these
  instantly; the LLM breaker, reasoning from behaviour alone, is far weaker at
  spotting sins of omission.
- **When it finally acted, it filed a lie, and the coder hallucinated.** Round 3
  the breaker asserted `classify(0) === "fizzbuzz"` — poisoned (oracle: `0 →
  "zero"`), a real mistake about intent. The coder, told to satisfy it, emitted a
  malformed rule list including `always => "String(n)"` (the literal string, not
  the number) that clobbered everything and **failed even the poisoned test**
  (`pass=0, passRate=0`). The parser stored exactly what the model produced
  rather than inventing a repair — a genuine red trace.

So the committed sim traces show the *clean* dynamics (convergence, poison
collapse) the harness was built to measure; the LLM trace shows the *messy
reality* the harness has to survive: weak black-box breakers that miss omissions,
and coders that produce green-looking-but-broken output. The honesty seam held —
every `pass` count in every trace is executed, and the red run is reported red.

## Takeaways

1. **Adversarial pressure converges when the fight is fair.** A breaker that only
   files honest bugs drives the coder to the correct fixed point and then
   *disarms itself* — it literally runs out of things to break. No explosion.
2. **Churn leads pass-rate as a convergence signal.** Pass-rate is pinned at 1.0
   in every poisoned run and tells you nothing; `churn → 0` (the code stops
   moving) and `oracleConsistent` are the honest indicators of whether the fight
   actually settled *correctly*.
3. **One liar doesn't explode the system — it corrupts it quietly.** Poison
   doesn't cause oscillation here (tests never conflict on the same input); it
   causes *generalization collapse*. The swarm stays green, stays stable, and
   ships a wrong program — the worst kind of failure because every dashboard is
   green. This is the AWM lesson: trusting your own test suite unconditionally
   makes a single bad-faith constraint indistinguishable from ground truth.

## Live run (real LLM)

- **Mode / model:** `llm`, `claude-haiku-4-5-20251001` (4 rounds, poisonRate=0, integer-label oracle).
- **Trace:** `runs/ap-mr7fzdfy.jsonl` (replay-verified).
- **Key metrics (final):** `finalPassRate=1`, `finalTests=1`, `poisonedTests=0`,
  `oracleConsistent=1`, `everConverged=0` (`convergedAtRound=-1`), `meanChurn=0.274`.
- **Live vs sim:** the standout live finding is that the real black-box breaker is *weak* —
  it filed only one test the whole run and never drove churn to zero, so `everConverged=0`
  even though pass-rate sits at a green 1.0. That is exactly takeaway #2 playing out against a
  real model: **pass-rate is a useless convergence signal** (it's pinned at 1.0 while `churn`
  stays at 0.274, i.e. the code is still moving). The sim can manufacture a diligent breaker
  that disarms itself; the live haiku breaker under-tests and quietly leaves the fight
  unfinished — a green dashboard over an unconverged system, which is the AWM failure mode in
  miniature.
