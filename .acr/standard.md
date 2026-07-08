# SwarmLab

**Purpose:** Agent-run experiment lab for the heybeaux stack. SwarmLab builds controlled multi-agent experiments, records replayable traces, measures whether green signals hide wrong outcomes, and turns findings into production changes across Sonder, AOP, Lattice, Engram, Parliament, ACR, AWM, and Aegis.
**Repo:** https://github.com/heybeaux/swarmlab
**Status:** active
**Phase:** experiment/retest campaign complete through exp-17 and RT-08; first Aegis-wrapped retest landed
**Last verified:** 2026-07-08

## Runtime

- **Local path:** `/Users/beauxwalton/projects/swarmlab`
- **Tech:** TypeScript monorepo, npm workspaces, strict `tsc -b`
- **Build/typecheck:** `npm install && npm run typecheck`
- **Core package:** `core/` provides trace events, agent runtime seam, bus, score, replay
- **Experiments:** `experiments/NN-name/`, each with source, runs, README, replay-verified traces
- **Observatory:** `observatory/` Svelte app for browsing experiments and replaying traces
- **Canonical evidence ledger:** `SYNTHESIS.md`
- **Lifecycle plan:** `docs/STACK-LIFECYCLE.md`

## Dependencies

- **Depends on:** `@swarmlab/core`; for retests, links real stack packages via `file:` deps rather than reimplementing production logic
- **Used by:** Aegis (benchmark/rule/predictor evidence), Sonder/AOP/Lattice/Engram/Parliament/ACR/AWM maintainers
- **External:** local model/agent CLIs for live exhibitions when a spec calls for them

## Key contacts

- **Owner:** @beauxwalton
- **Contributors:** autonomous agent team; human writes charters/specs, agents write code

## Quick gotchas

- **Prime rule:** only agents write SwarmLab code. Beaux writes charters/specs; agents build, review, commit, and push.
- **Never fake a result.** A real red trace is better than a fake green one.
- **Retests must link real packages.** If a stack repo changed, SwarmLab retests via `file:` dependency to the real implementation; do not copy logic into the lab.
- **Commit/push after green units.** The team charter treats Git as shared memory and crash recovery.
- **Run IDs matter.** Claims in `SYNTHESIS.md` should trace to committed JSONL traces and README tables.
- **Green signal skepticism is the whole point.** Pass-rate, consensus, coverage, and agreement are suspect until compared to truth/fidelity/oracle metrics.

## Current evidence-backed stack priorities

1. Keep typed `payload_contract` semantics as a release gate for agent/project boundaries.
2. Use pinned criteria + grounded evidence for Parliament verdict certification.
3. Use Engram versioned facts + anti-entropy for memory fidelity and capability trust transfer.
4. Implement evidence-capped probation for delegation trust routing.
5. Require value-echo handoff manifests for delegation depth ≥2.
6. Consume verification tiers in high-risk audits; RT-08 now has an Aegis-wrapped retest proving Aegis reduces audit escape when inserted.
7. Feed proven findings into Aegis benchmark axes and shadow/enforcement policies.

## Where to learn more

- `README.md` — project overview and experiment list
- `TEAM.md` — autonomous team constitution and definition of done
- `JOURNAL.md` — chronological learning notes
- `SYNTHESIS.md` — cross-experiment findings and retest ledger
- `docs/STACK-LIFECYCLE.md` — development lifecycle and release cycle model
