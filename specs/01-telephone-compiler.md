# SwarmLab — `experiments/01-telephone-compiler/` Specification

> Written by the builder agent, per TEAM.md ("builder writes a proper spec FIRST").
> Faculty under test: **Sonder / ACR** — how much meaning survives repeated
> spec→code→spec translation, and where it leaks.

## Concept

The children's telephone game, played through a compiler-shaped bottleneck:

1. **Agent A (speccer)** writes a natural-language spec for a small program.
2. **Agent B (coder)** implements the spec as code. B sees only the spec.
3. **Agent C (respeccer)** reads ONLY the code — never the original spec — and
   writes a fresh natural-language spec describing what the code does.
4. C's spec goes back to B. Repeat for ~10 rounds.

Every hop is lossy in a *different direction*: English→code drops nuance and
intent; code→English drops rationale and invents post-hoc framing. After N
rounds, compare spec_N to spec_0 and see what meaning survived.

## Why this seed task

The round-0 spec (produced by Agent A from a fixed brief) describes a **parking
garage fee calculator** with deliberately quirky, easy-to-lose details: a grace
period, a daily cap, a lost-ticket flat fee, an EV discount with odd rounding.
Numbers and edge-case rules are the "fragile cargo" — they either survive the
trip verbatim or mutate visibly, which makes drift measurable without
embeddings.

## Agents & roles

| Agent       | Role                                  | Sees                    |
|-------------|---------------------------------------|-------------------------|
| `speccer`   | writes spec_0 from the fixed brief    | the brief only          |
| `coder`     | spec_r → code_r                       | current spec only       |
| `respeccer` | code_r → spec_{r+1}                   | current code only       |

All three are spawned through `core/spawn` with a custom `AgentRuntime`:

- **`llm` mode (default when available):** each `send()` shells out to the
  local `claude` CLI (`claude -p`, haiku model) — real model calls, real drift.
- **`sim` mode (fallback, `TELEPHONE_MODE=sim`):** a deterministic seeded
  simulation of the lossy channel (drops/perturbs modifiers and numeric
  literals at fixed rates). The trace records which mode ran; the README must
  state it honestly. **Never present a sim run as an LLM run.**

## Event shape (all via `core/` — standard `TraceEvent`s)

- `spawn` ×3 (speccer, coder, respeccer) with full `AgentSpec` (system prompts
  are part of the record).
- One `message` topic `meta` from `orchestrator` at start:
  `{ mode: 'llm' | 'sim', model, rounds, brief }`.
- Per round `r` (0-indexed):
  - `message` topic `spec`, from `speccer` (r=0) or `respeccer` (r>0) to
    `coder`, body `{ round: r, text: spec_r }`.
  - `message` topic `code`, from `coder` to `respeccer`, body
    `{ round: r, text: code_r }`.
  - `score` event with `scores = { round, jaccard, numberRetention,
    contentRetention, lengthRatio }` — spec_{r+1} measured against spec_0.
- `kill` ×3, then the writer closes.

## Drift metrics (computed locally, deterministic)

Against spec_0, for each spec_{r+1}:

- **jaccard** — Jaccard similarity of lowercased content-word sets (stopwords
  stripped). Overall vocabulary overlap.
- **numberRetention** — fraction of numeric literals in spec_0 (the fragile
  cargo: `15`, `24.00`, `0.25`…) still present verbatim. The sharpest signal.
- **contentRetention** — fraction of spec_0's salient content words that
  survive.
- **lengthRatio** — |spec_{r+1}| / |spec_0| in words. Detects bloat/atrophy.

No embeddings on purpose: metrics must be reproducible offline and replayable
by the observatory with zero API calls.

## Definition of Done

- `specs/01-telephone-compiler.md` (this file) committed first.
- `experiments/01-telephone-compiler/` builds on `core/` (spawn + bus + score +
  trace); typechecks clean via `npm run typecheck`; no `any` in public
  signatures.
- A real run under `runs/` as JSONL; `replay()` reads it back and a verifier
  checks event counts/shape.
- `README.md` explains what it tests, how it works, which mode produced the
  committed trace, and what drift was observed (with numbers).
- One-paragraph learning note appended to `JOURNAL.md`.
- Committed and pushed after every green unit.

## What it should teach

Where meaning leaks: do numbers survive better than intent? Does the spec
converge to a fixed point (stable attractor), oscillate, or bloat with
invented requirements? Which hop (English→code or code→English) loses more?
