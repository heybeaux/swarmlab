# Design Review - Visual Lane

Date: 2026-07-08
Lane: Recovery visual / web design

## Design concept

The redesign treats the site like a control room that is lying to you.
Instead of a generic explainer page, the page now demonstrates the thesis in motion:

1. False green board:
   Three PASS rows can be flipped into visible FAIL rows, dropping the board from `100% GREEN` to `25% GREEN`.
   This makes "green is not correct" experiential instead of decorative.
2. Swarm capture simulator:
   A canvas-based five-seat quorum model lets the user change liar seats from 1 to 3.
   Honest agents never flip; the outcome changes only when vote arithmetic crosses the majority threshold.
3. Scroll-linked lesson rail:
   The seven lessons now sit beside a sticky progression rail that updates the active rule as each lesson card enters focus.
   This turns the page into a guided sequence instead of a stack of disconnected cards.

## What I built

- Rewrote `learning-package/site/index.html` around a stronger narrative structure: hero, live status-board reveal, animated swarm window, sticky lesson rail, simulator recap, checklist, formats, and CTA.
- Rewrote `learning-package/site/styles.css` with a darker control-room visual system, stronger type scale, glass-panel treatment, sticky rail, and responsive layouts for tablet and mobile.
- Rewrote `learning-package/site/app.js` to drive:
  - audience toggle copy switching
  - reveal-on-scroll behavior
  - false-green board flip state
  - checklist progress state
  - lesson-rail active tracking
  - canvas swarm simulation with liar-count slider

## Accuracy and content notes

- I only used claims already grounded in `SYNTHESIS.md` and `content/LESSONS.md`.
- The simulator deliberately stays simple and honest:
  - 5 total seats
  - liar seats adjustable from 1 to 3
  - honest flips fixed at 0
  - the threshold message matches the live finding that truth survives 1-2 liars and loses at 3
- I kept the required links:
  - `../pdf/swarmlab-client-report.pdf`
  - `../content/newsletter-sequence.md`
  - `../content/LESSONS.md`

## Perf and a11y notes

- No external fonts, scripts, images, or network dependencies.
- Canvas animation is self-contained and uses a single loop.
- Reduced-motion users get static rendering:
  - reveal animations are disabled
  - cursor aura is removed
  - the canvas draws once instead of animating continuously
- Layout is responsive with stacked fallbacks for narrower screens.
- Interactive controls remain native buttons and range input.

## Self-check

- `node --check learning-package/site/app.js` passed.
- Searched the site directory for external requests; only local files and inline/data URLs remain.
- HTML was spot-checked manually after rewrite.
- One caveat: `xmllint --html` reports HTML5 semantic tags as invalid because it uses an older parser, so that output is not a real browser error.

## Open questions

- The canvas simulator is intentionally explanatory, not data-dense. If Beaux wants a more brutal or more diagrammatic treatment, that can be pushed further without changing the structure.
- The audience toggle currently changes hero and CTA framing only. If needed, the lesson summaries could also shift tone between newsletter and client skins.
