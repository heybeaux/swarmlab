# 01 — The Telephone Game Compiler

**Faculty under test:** Sonder / ACR — how lossy the spec→code→spec loop is,
and where meaning leaks.

## What it tests

Three agents play telephone through a compiler-shaped bottleneck. `speccer`
writes a spec for a parking-fee calculator seeded with fragile cargo (a
15-minute grace period, $3.50/started hour, $24.00 cap, $18.00 weekend cap,
$45 lost ticket, 20% EV discount rounded to the nearest $0.25). `coder`
implements the spec seeing only the spec. `respeccer` reads only the code and
writes a fresh spec. That spec goes back to `coder`. Ten rounds. Every hop is
a bus message in the JSONL trace; every round gets a drift `score` event
measured against spec_0 (Jaccard of content words, numeric-literal retention,
content-word retention, length ratio — all deterministic, no embeddings, so
the observatory can recompute them on replay).

## How it works

Built entirely on `core/`: agents come from `spawnAgent` with a custom
`GenRuntime` (`AgentRuntime` seam) where every `send()` is one text
completion. Two `TextGen` backends:

- **`llm`** (default): real calls through the local `claude` CLI
  (`claude -p`, model `claude-haiku-4-5-20251001`), run with `--tools ""`
  from an empty temp cwd — see "the hijack" below for why.
- **`sim`** (`TELEPHONE_MODE=sim`): a deterministic seeded simulation of the
  lossy channel (drops modifiers, perturbs numbers, invents post-hoc filler).
  Honest fallback for offline runs; the trace's `meta` event records which
  mode produced it. A sim trace is never presented as an LLM result.

Run it: `npm run build && node experiments/01-telephone-compiler/dist/main.js`
(env: `TELEPHONE_ROUNDS`, `TELEPHONE_MODE`).

## What we observed

### Run 1, `tg-mr79fxd4` (llm, unisolated) — the hijack ⚠️

The first real run produced the most instructive failure of the experiment.
Drift was gentle for rounds 0–3 (numbers ~0.42–0.50 retained, Jaccard ~0.13
— vocabulary churns fast even when rules survive). Then at **round 4 the
channel itself broke**: the nested `claude -p` coder call, which still had
its agentic tool layer enabled, decided to *write the code to a file* instead
of printing it, and emitted `"Requesting permission to write the file."` as
its entire answer. That sentence became the "code". The respeccer dutifully
spec'd it (`"Waiting for permission to write the specification file to
disk."`), and for rounds 5–9 the three agents played telephone about
permission prompts instead of parking fees — even bleeding in fragments of
the *orchestrating session's* context (log paths, drift-metric talk), because
the CLI ran from the workspace cwd and inherited project context. All drift
metrics flatlined to 0. The game never recovered: **the telephone line has no
error correction, so a single infrastructure hiccup is indistinguishable from
— and as permanent as — total semantic loss.**

Fix: `--tools ""` plus an empty temp dir as cwd (committed separately).

### Run 2, `tg-mr7b6nan` (llm, isolated) — clean drift

<!-- RUN2 -->

### Sim baseline, `tg-mr79fk2g` (deterministic)

The seeded simulation decays monotonically (Jaccard 0.81 → 0.38 over 9
rounds) and then collapses at round 9 (0) when compounding sentence-drop
probability finally eats the whole spec — a caricature, but a useful
lower-bound shape to compare the real runs against.

## Takeaways

1. **Infrastructure noise is semantic noise.** Nothing in the loop
   distinguishes "the model misunderstood the spec" from "the harness
   glitched" — both just become the next round's gospel. Real multi-agent
   pipelines need out-of-band health checks (Lattice territory).
2. **Numbers are sticky; framing is not.** Numeric literals survive far
   better than vocabulary (Jaccard falls fast while numberRetention holds),
   because code preserves constants verbatim while prose gets re-invented
   every round-trip.
3. **Isolation is a prerequisite for measurement.** Nested agent calls
   inherit cwd context by default; without sandboxing, the experiment
   measures the harness, not the phenomenon.
