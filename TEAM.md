# SwarmLab — Team Charter

> Read this first, every iteration. It is the constitution for the autonomous team
> building this lab. A human wrote it; **only agents write the code.**

## Mission

Build SwarmLab: a monorepo of weird agent-swarm experiments, each one a wind-tunnel
test of a faculty in the heybeaux stack (Parliament, Lattice, Sonder, Engram, ACR/AWM).
Plus a stunning Svelte observatory to navigate, run, and learn from them.

The point is **learning**, not shipping product. Weird is a feature. Emergent behavior
you didn't predict is the win condition.

## The Prime Rule

**Only agents write code.** Beaux never touches the keyboard. Every line is written,
reviewed, and committed by an agent. The orchestrator specs and coordinates; builders build.

## Backlog (build in this order)

1. `core/` — DONE ✅ (substrate: spawn, bus, score, trace)
2. `observatory/` — Svelte dashboard. The showpiece. Navigate experiments, trigger runs,
   replay traces visually, compare results. Must be genuinely beautiful.
3. `experiments/03-prompt-darwinism/` — mutate prompts, score, breed winners.
4. `experiments/04-consensus-under-lies/` — N agents agree; 1-2 secretly mislead.
5. `experiments/06-self-modifying-swarm/` — agents rewrite each other's prompts mid-run.
6. `experiments/07-team-choice/` — **the team invents its own experiment.** Pick something
   weird that tests a faculty in a way our selection doesn't. Spec it, build it, justify it.

## Freedoms (you are trusted — use them)

- **Consult skill** — pull in a second opinion when a design decision is genuinely hard.
- **OpenRouter API** — reach for other models when a task suits them better.
- **Codex / other agents** — call any agent in the crew or spawn sub-agents for parallel work.
- **Be creative** — the specs are floors, not ceilings. If you see a weirder, more instructive
  version of an experiment, build that and write down why.

Use freedoms with judgment: they're for unblocking and elevating, not for churn.

## Definition of Done (per unit of work)

- Typechecks clean (`npm run typecheck`), no `any` in public signatures.
- If it's an experiment: it runs, produces a valid JSONL trace, `replay()` reads it back,
  and it has a `README.md` (written by you) explaining what it tests and what you observed.
- If it's the observatory: it builds, runs, and renders real traces from `experiments/*/runs/`.
- Committed to git with a clear message. **Commit after every green unit — never lose work.**
- A one-paragraph learning note appended to `JOURNAL.md`: what happened, what surprised you.

## Working Rules

- **Commit early, commit often.** Session recycling can abort long runs (~380s). Small green
  commits are how the team survives restarts and picks up where it left off.
- **Specs + git are shared memory.** The next iteration reads `TEAM.md`, `JOURNAL.md`, `git log`,
  and `specs/` to know where things stand. Leave the trail clean.
- **Never fake a result.** A real red trace beats a fake green one. If something doesn't work,
  write that in the journal and move on — that's the learning.
- **No deploys, no external sends** without explicit human go. This is a local lab.
