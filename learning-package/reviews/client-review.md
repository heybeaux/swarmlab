# Client Collateral Review
**Lane:** client-collateral · **Date:** 2026-07-08

---

## What Changed

### client-facing-version.md

- **Executive summary tightened.** Reframed from general AI adoption framing to the specific failure mode: "success signals go green while the actual outcome is wrong, and nothing inside the system can tell." Removed soft language; landed harder on the thesis.
- **"Why this matters" section sharpened.** Added explicit contrast between capability questions (what AI can do) and reliability questions (how you know it did the right thing). The transition is the argument clients need to hear.
- **Evidence table added.** The nine-row pattern table from SYNTHESIS.md is now a first-class section — "The Pattern Across All Experiments" — before the seven lessons. This is the strongest credibility signal in the document and was buried; it needed its own heading.
- **Seven lessons restructured to client-risk → design-response framing.** Each lesson now leads with the mechanism, then the specific client exposure, then the design response. The original version did this but more weakly.
- **Lesson 2 (consensus) deepened.** Added the criterion-drift nuance: liars did not assert false facts — they shifted the question being answered. This is the sharpest real-LLM finding from exp-04 and it distinguishes this from naive "voting is bad" content.
- **"How heybeaux uses this" close rewritten.** The original was a bullet list of abstractions. The new version describes what we actually built (typed semantic contracts, pinned criterion gates, versioned memory, receipt-backed completion, inter-step review edges), why (each traced to a specific finding), and what the standard is. Short, credible, not self-promotional.
- **CTA rephrased.** "Suggested client CTA" removed as a label; the close section ends naturally with the engagement prompt.

### swarmlab-client-report.html

- **Cover redesigned.** Dark background (#0f1209) with green accent, large display type (54pt, weight 800), cover dek, and thesis block. Metadata grid at the bottom with use-case and source context. Much more appropriate for a polished leave-behind.
- **Typography system overhauled.** Body now uses `ui-serif` (Georgia fallback) for body text — more appropriate for a print document. Display headings use `ui-sans-serif` for contrast. Established a proper type scale: 54pt cover, 28pt section, 18pt h2, 13pt lesson title, 10.4pt body.
- **Lesson cards introduced.** Each lesson is now a card with monospace lesson number, title, body, and inline pill tags for risk and design response. No more h3/strong paragraphs — visually scannable for executives.
- **Evidence table styled.** Dark header row, alternating row tints, compact font — appropriate for a data-dense credibility section.
- **Principles rendered as a structured list.** Monospace numbering with separator lines; more considered than a plain `<ol>`.
- **Readiness checklist.** Each category gets a small-caps label with a rule line, then checkboxes rendered as empty bordered spans (print-safe, no external assets).
- **Close section.** Dark background panel matching the cover, with a green CTA line at the end.
- **All assets self-contained.** No external fonts, no network requests. System font stack only.
- **Print media query.** Covers color-exact printing for dark panels, removes borders in the report body, strips link underlines.

---

## Factual Risks / Things to Verify

1. **"99% quality improvement" (Lesson 4 / overnight cathedral).** SYNTHESIS.md says "0.99 quality lift from adding [an inter-step review edge]." I reproduced this as "99% quality improvement" — confirm this is the right reading of the metric before the document goes to clients. If the underlying scale matters (0.99 on a 0–1 quality score vs. a 99% relative lift) the framing should be adjusted.

2. **"Up to 84% of fields silently meant different things" (evidence table / Lesson 6).** SYNTHESIS.md says "worst cell 84.5% corrupt at 100% reported agreement" from exp-12. Rendered as "up to 84%" — technically accurate but double-check that the worst-cell framing is the right one to use for a non-technical audience vs. an average-case figure.

3. **"13% task completion" (economic agents row).** SYNTHESIS.md: "100% balance, 13% task completion." Used verbatim. Verify this is a replayed, not simulated-only, result and that it's appropriate to present without caveat to a non-technical audience. (It is a sim-only result per the honesty ledger — consider adding "in simulation" if that matters for your positioning.)

4. **"Truth rate from 92% to 56%" (consensus under lies row).** SYNTHESIS.md: "one confident liar dragged truth 0.92→0.56." Used as stated. This is from the sim sweep; the live-LLM sweep confirmed the tipping point but the specific numbers are from the sim. Consider whether that distinction matters for a client audience.

5. **The "how heybeaux uses this" close does not cite specific shipped stack components by name** (e.g., Sonder, Engram, Parliament, Lattice). This is intentional — the audience is non-technical and those names would need explanation. If Beaux wants to add them for credibility with a technically-oriented client, they can be added as a parenthetical or footnote layer.

---

## Open Questions

- Should the cover include a version number or date? Currently shows "2026" in the footer only.
- Is the readiness checklist intended as a printed worksheet (checkboxes to fill in) or a conversation guide? If the former, the check-box squares should be larger. If the latter, they could be removed.
- The evidence table includes sim-only results alongside live-LLM results without distinguishing them. Is that the right policy for a client document, or should a footnote acknowledge the distinction?
- The "how heybeaux uses this" close is written as a credibility/positioning close, not a commercial close. If this is going into a formal proposal, a more explicit next-step paragraph may be needed.
