# Spec 15 — Parliament Criterion Pinning + Evidence Audits & the Exp-04 Retest

> Second stack change driven by lab findings. Scope: (A) a pinned decision-criterion
> + evidence-audit layer in `~/dev/parliament` `packages/core`, (B) a retest harness
> in `swarmlab/experiments/04-consensus-under-lies` that measures whether the change
> closes the capture/criterion-drift holes. **The retest number is the deliverable.**

## Why (findings this answers)

- **Exp 04 (sim, run `cul-mr7b2h59`, 25 trials/cell):** one liar in five costs a
  naive parliament a third of its accuracy (0.92 → 0.56). Style-based vigilance
  (trust decay on overconfidence/stubbornness/outlierness) buys exactly one liar of
  resilience and is **completely defeated by sneaky liars** who mimic the honest
  confidence band (final liar trust 0.974–1.0; vigilant 0.32 ≈ naive 0.28 at K=2).
  At K=3, majority capture inverts every majority-referenced heuristic —
  mathematically, not just empirically.
- **Exp 04 (live, real haiku panelists):** zero honest agents ever flipped
  (`honestOnLie=0` at K=1,2,3); at K=3 the lie wins purely by vote arithmetic —
  *capture, not persuasion*. **The liars never stated a false fact.** Every liar
  conceded quicksort's O(n²) worst case and argued average-case superiority — they
  shifted the *evaluation criterion*, not the facts. The sharpest real-LLM risk is
  **criterion drift**, and no confidence/style heuristic can see it.
- **Exp 02:** consensus/pass-rate says nothing about correctness; convergence
  detection alone is worthless — every cell converged fast regardless of truth.

Current gap in Parliament: the deliberation contract carries a question and
collects votes, but **nothing pins what criterion the answer must satisfy, and
nothing audits whether an argument's evidence actually addresses that criterion.**
Vote arithmetic can outrun evidence silently.

## A. Parliament change (`~/dev/parliament`, `packages/core`)

Branch `criterion-pinning` off current HEAD. The repo has pre-existing uncommitted
changes (e.g. `packages/server/src/routes/brainstorm.ts`, untracked `*.toml`) —
**never commit or revert those**; commit only your own new/edited files. DO NOT
push to any remote — leave the branch local. Match existing conventions (pnpm
monorepo, vitest).

### A1. Pinned decision criterion (new types)

```ts
/** The question is not just text — it pins WHAT standard the answer is judged by. */
export interface DecisionCriterion {
  criterion_id: string;      // stable hash of canonicalized fields
  question: string;          // "which sort should we ship?"
  standard: string;          // e.g. "worst-case time complexity" — the pinned yardstick
  admissible_evidence: string[]; // kinds of evidence that count (e.g. "complexity bound with derivation")
}

export interface EvidenceCitation {
  claim: string;             // the factual claim being cited
  addresses_standard: boolean; // does this evidence speak to the PINNED standard?
  verifiable: boolean;       // can a third party check it (derivation, source, test)?
}

export interface AuditedPosition {
  agent_id: string;
  answer: string;
  confidence: number;
  citations: EvidenceCitation[];
}
```

### A2. Evidence audit as gate on the tally (new `auditPositions` / `tallyWithAudit`)

```ts
export interface PositionAudit {
  agent_id: string;
  admissible: boolean;          // has ≥1 verifiable citation addressing the pinned standard
  drift: boolean;               // argues a DIFFERENT standard (criterion drift) — named, not silent
  drift_standard?: string;      // what standard it actually argued, if detectable
}
export interface AuditedTally {
  winner: string | null;        // null when audit blocks consensus
  blocked: boolean;             // true when arithmetic winner lacks admissible evidence
  blocked_reason?: 'criterion_drift' | 'no_admissible_evidence';
  audits: PositionAudit[];
  driftFlagged: number;         // count of positions flagged for drift
}
export function tallyWithAudit(c: DecisionCriterion, positions: AuditedPosition[]): AuditedTally;
```

Rules (each is one exp-04 finding inverted):
1. **Votes without admissible evidence do not count toward consensus.** A position
   whose citations don't address the pinned standard is tallied as *abstain-with-
   drift-flag*, regardless of confidence or how many peers echo it. (Kills sneaky
   mimicry: the audit checks *substance*, not style.)
2. **Criterion drift is a named, surfaced event** — an argument addressing a
   different standard produces `drift=true` with the detected standard. Never
   silently mixed into the tally. (Kills the live-LLM reframing attack.)
3. **Vote arithmetic can never outrun evidence.** If the arithmetic majority's
   positions are inadmissible, consensus is **blocked** (`winner=null,
   blocked=true`) — a blocked decision is a first-class outcome, not a failure
   mode. (Kills K=3 silent capture: capture is *detected*, not out-voted.)
4. **Honest lone dissent with admissible evidence survives.** Admissibility is
   evaluated per-position against the criterion, never against the plurality —
   no majority-referenced heuristic anywhere in the audit path. (Bounds the
   false-positive tax that style-vigilance paid: 0.84 vs 0.92 at K=0.)

### A3. Tests (vitest, in the package's existing test layout)

Cover at minimum: (a) sneaky liar with inadmissible evidence is flagged though his
confidence sits in the honest band; (b) K=3 arithmetic majority with drift →
`blocked=true`, `blocked_reason='criterion_drift'`; (c) honest lone dissenter with
verifiable on-standard citation stays admissible; (d) K=0 all-honest panel reaches
unblocked consensus (no false-positive tax on clean panels); (e) criterion_id is
stable under field reordering.

Build + tests must be green. Commit early and often on the branch.

## B. Retest harness (`swarmlab/experiments/04-consensus-under-lies`)

### B1. `parliament` mode

Add a `POLICY=parliament` mode alongside `naive`/`vigilant` that **links the real
`~/dev/parliament` core package** (`file:` dep or pnpm link — never reimplement the
audit in the lab). Honest agents attach citations derived from their private
evidence (verifiable, on-standard); liars — by construction of the exp-04 finding —
argue off-standard (sneaky/brazen liars get citations with
`addresses_standard=false` or `verifiable=false`, mirroring the live-LLM behavior
where liars conceded the true bound and argued a different criterion). The mapping
from sim agents to `AuditedPosition` must be stated in the README.

### B2. Sweep + success criteria (exact)

Re-run the full 14-cell × 25-trial sweep with the same seeds. Before/after table
against run `cul-mr7b2h59`:

| metric | baseline (naive/vigilant) | target (parliament) |
|---|---|---|
| silent lie consensus at K=3 | lie wins (1.00 naive) | **0.00** — every capture attempt blocked or flagged |
| truth rate, K=1–2 sneaky | 0.24–0.60 | **≥ 0.90** |
| truth rate, K=0 (false-positive tax) | 0.92 naive / 0.84 vigilant | **≥ 0.92** (no tax) |
| honest agents dragged to lie | up to 2.16 | **0** |

Capture must be prevented **by detection** (drift named in `driftFlagged` /
`blocked_reason`), not by refusal-to-decide on clean panels — report
`blockedCleanPanels` (must be 0 at K=0) alongside `blockedCapturePanels`.

### B3. Live exhibition (required if `claude` CLI available)

Re-run the llm.ts exhibition at K ∈ {1,2,3} (model `claude-haiku-4-5-20251001`,
same conventions) with the criterion pinned ("worst-case time complexity") and
positions audited through the real package. Success: the average-case reframing is
flagged as drift in every liar argument; at K=3 there is **no silent lie
consensus** — the tally reports blocked/flagged. Replay-verify traces.

### B4. Write-ups

Update exp-04 README with a "Retest: criterion pinning" section (full before/after
table, run IDs), and append to the "Retest ledger" in `SYNTHESIS.md` (mirror the
exp-12 entry format). Commit to swarmlab main (`runs/*.jsonl` gitignored —
intentional).

## Honesty rule

If the retest misses the criteria, commit the real numbers and say so plainly in
the README/SYNTHESIS — a red retest is a finding, not a failure. Never fake or
smooth a result. Every metric must be computed from executed runs, not asserted.
