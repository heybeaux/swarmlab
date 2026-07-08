# Editorial Review — LESSONS.md + newsletter-sequence.md

Reviewer: editorial lane. Scope: prose, hooks, and factual fidelity against SYNTHESIS.md / README.md. Structure preserved (7-lesson spine + welcome/checklist emails). No wholesale restructure.

## What I changed

**Voice & prose**
- Killed the choppy one-sentence-per-line rhythm where it dragged (welcome email, emails 1/2/5/7). Kept short lines where they land a punch; merged the rest into real paragraphs.
- Tightened every hook and subject line. Reordered Email 0 subjects so the strongest ("The lab where AI teams fail on purpose") leads.
- Collapsed redundant bullet preambles ("For AI memory and human organizations:" etc.) into cleaner lead-ins.
- De-sycophantized and de-hedged ("The public package should avoid overclaiming" → "The package does not overclaim").

**Sharper, faithful detail (added from SYNTHESIS, not invented)**
- Lesson 1 / Email 1: added the concrete economic-agents numbers — 100% balanced ledger, **13% task completion** — instead of the vague "too starved to communicate."
- Lesson 2 / Email 2: named the finding as **capture, not persuasion**; made explicit that liars *never stated a false fact* and reframed the yardstick, and that **zero honest agents flipped at any level**. This is the single strongest and most defensible result in the suite.
- Lesson 5 / Email 5: added the "reached everyone *faster* because correction spreads too" payoff (RT-03 healing result), and "barely half-faithful" worst-cell texture (fidelity ~0.574).
- Lesson 6 / Email 6: added the byte-identical false-friend point and the handshake-vs-runtime type framing.
- Email 4 / Lesson 4: promoted the **"we lived it — the loop rotted into a dead account overnight"** anecdote to a prominent beat. It's the most visceral hook in the deck and it's true (SYNTHESIS exp-09 note).

**Made two soft/stale claims firmer where the repo now supports it**
- Lesson 7: the old text said "the roadmap identifies receipt honesty as a *next* failure mode." RT-08 (verification tiers) has shipped, so I rewrote it as a delivered result and added that cross-model agreement is a *correlated-error channel*.

## Factual risks I caught and corrected

1. **Rubber-stamp lesson was overstated (Lesson 3 / Email 3).** SYNTHESIS is explicit that the rubber-stamp *tax* is a **sim result** and is **difficulty-dependent**: live haiku caught the injected bug every rep (`rubberStampTax=0`); the tax bites in the *middle of the difficulty curve* (subtle bugs), not universally. The originals implied a universal live effect. I added the "on an obvious defect, caught every time; the tax lands on subtle bugs" caveat to both, which actually *strengthens* the operational rule (route subtle defects to mechanical gates). This was the biggest fidelity gap.

2. **No invented numbers.** I only used figures already in SYNTHESIS (13% completion, ~half-faithful, K=1/2 vs K=3). No experiment or metric was introduced that isn't in the repo.

3. **"Dropped to zero by detection/refusal" (Lesson 6) verified** — RT-01 shows false-friend miss rate → 0.00 by detection, and pairs correctly refuse to agree on an unreconcilable contract. Kept, with the refusal mechanism made explicit.

## Open questions for Scout

- **Lesson 3 framing:** I softened the rubber-stamp claim to match the sim/live split. If you want the punchier universal version for the lead magnet, we should add a one-line footnote that the live catch rate was perfect on the obvious bug — otherwise a technical reader who opens the repo will catch the gap. My call: current version is safer and still lands the rule.
- **Lesson 7 / "receipt honesty":** LESSONS.md still frames Lesson 7 partly as forward-looking. Since RT-08 shipped, do you want the client-facing PDF to cite the tier order (`human_attestation > provenance_chain > fresh retrieval > cross_model > unsupported`) as a concrete deliverable, or keep it conceptual for the non-technical newsletter? I kept the newsletter conceptual.
- **Number in Email 1:** I used "13% of the work got done." Confirm you're comfortable putting a specific figure in a non-technical email — it's accurate and it's a great gut-punch, but it invites "which experiment?" replies. I think it's worth it.
- **Email 8 client CTA:** unchanged, but worth a pass for whatever the current booking link / offer is.

Files touched: `content/LESSONS.md`, `content/newsletter-sequence.md`, `reviews/editorial-review.md`. Did not touch site/, pdf/, or client-facing-version.md.
