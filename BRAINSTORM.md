# SwarmLab — The Original 12 (canonical brainstorm)

The seed ideas. Each becomes an experiment on `core/`. Numbers are idea IDs (used as the
`experiments/NN-*` prefix), not build order. Detailed specs live in `specs/` for some; for the
rest, this file IS the brief — the builder writes a `specs/NN-*.md` first, then builds.

**1. The Telephone Game Compiler** — Agent A writes a spec in English. Agent B implements it.
Agent C reads only the code (not the spec) and re-writes the spec. Repeat 10x. Watch semantic
drift. *Teaches: how lossy the spec→code→spec loop is, and where meaning leaks.*

**2. Adversarial Pair Programming** — Two agents: one writes code to pass tests, one writes tests
to break the code. Alternate on the same file forever. *Teaches: emergent test-hardening, whether
adversarial pressure converges or explodes.*

**3. The Prompt Darwinism Arena** — Spawn 8 agents with mutated system prompts, same task, score
outputs, breed the winners into the next generation. *Teaches: prompt evolution, fitness functions
for LLM behavior.* (detailed spec: `specs/03-prompt-darwinism.md`)

**4. Consensus Under Lies** — 5 agents must agree, but 1-2 are secretly instructed to mislead.
Watch if the honest majority routes around the liars. *Teaches: Byzantine fault tolerance with
LLMs.* (detailed spec: `specs/04-consensus-under-lies.md`)

**5. The Bug Telephone** — One agent injects a subtle bug. A chain of reviewer agents each get a
short window to find it. Measure how far down the chain it survives. *Teaches: where review breaks
down, review-depth economics.*

**6. Self-Modifying Swarm** — Agents rewrite each other's system prompts mid-run based on
performance. No human in the loop. *Teaches: runaway dynamics, why you need governance.*
(detailed spec: `specs/06-self-modifying-swarm.md`)

**7. The Minimal Language** — A swarm designs a tiny DSL, writes its interpreter, then writes
programs in it — each step a different agent that can't see the others' reasoning. *Teaches:
language design as emergent negotiation.*

**8. Rumor Mill (Gossip Protocol)** — Agents can only talk to 2 neighbors. Plant a fact in one.
Measure how it propagates/mutates across the mesh. *Teaches: gossip protocols, epidemic
algorithms, info decay.*

**9. The Overnight Cathedral** — One spec, agents build iteratively over a long horizon. Each
commit reviewed by the next agent. *Teaches: unsupervised long-horizon agent work, and drift.*

**10. Economic Agents** — Each agent gets a token budget; they must "pay" to call each other.
Watch what collaboration patterns emerge under scarcity. *Teaches: mechanism design, why scarcity
shapes architecture.*

**11. The Reverse Engineer** — Agent A builds something and hides the source. Agent B can only
probe its behavior (black box) and must reconstruct it. *Teaches: black-box inference, behavioral
testing.*

**12. Schema Negotiation** — Two agents that need to exchange data but were given different data
models must negotiate a shared protocol with no human referee. *Teaches: emergent protocol design.*

**13. Team's Choice** — the team invents its own, in addition to the twelve. See `specs/13-team-choice.md`.
