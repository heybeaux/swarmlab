# SwarmLab Learning Package

A non-technical learning package built from `heybeaux/swarmlab` findings.

## What is inside

- `content/LESSONS.md` — canonical source of truth: seven lessons, audience framing, proof points, and translation notes.
- `content/newsletter-sequence.md` — lead-magnet email sequence: welcome + seven lessons + conversion email.
- `content/client-facing-version.md` — client-facing version of the same ideas, written as a credibility artifact.
- `pdf/swarmlab-client-report.html` — print-ready client report source.
- `pdf/swarmlab-client-report.pdf` — generated PDF distribution artifact.
- `site/index.html` — interactive mini-site.
- `site/styles.css`, `site/app.js` — animated static site assets.

## Positioning

Core sentence:

> Green is not correct. Agreement is not truth. Fidelity is not meaning.

The package teaches non-technical people how AI teams fail by mapping SwarmLab experiments to familiar human-team failure modes: rubber-stamping, reframing, meetings that agree on the wrong thing, stale facts, missing receipts, and handoff loss.

## Recommended use

1. **Newsletter lead magnet:** publish the email sequence as a 7-day course. Use the mini-site as the opt-in landing page.
2. **Client resource:** send the PDF before discovery calls to establish credibility around agent reliability.
3. **Share team:** use `LESSONS.md` as facilitator notes for internal learning sessions.

## Local preview

From the repository root:

```bash
cd learning-package
npm run preview
# open http://127.0.0.1:8877/
open pdf/swarmlab-client-report.pdf
```

## Vercel deployment

`learning-package/` is a standalone static Vercel project.

```bash
cd learning-package
npm run check
vercel
vercel --prod
```

The build copies `site/` to `dist/` so the mini-site is served at `/`, with PDF and source content available at:

- `/pdf/swarmlab-client-report.pdf`
- `/content/newsletter-sequence.md`
- `/content/LESSONS.md`

The site includes `/api/subscribe`, a Vercel serverless function that fires the DripCtl sequence trigger. Configure these env vars in Vercel:

```bash
DRIPCTL_API_KEY=***
DRIPCTL_TENANT_ID=...
DRIPCTL_BASE_URL=https://api.dripctl.dev # optional
DRIPCTL_SEQUENCE_EVENT=swarmlab.lead.signup # optional
```

## DripCtl sequence

DripCtl artifacts live in `dripctl/`:

- `dripctl/sequences/swarmlab-green-is-not-correct.ts` — sequence-as-code using `@dripctl/sdk` builders.
- `dripctl/templates/swarmlab-green-is-not-correct.json` — extracted email template payloads.
- `dripctl/deploy-sequence.mjs` — deploy helper for the current REST API.

Deploy once DripCtl creds are available:

```bash
cd learning-package
DRIPCTL_API_KEY=*** DRIPCTL_TENANT_ID=... node dripctl/deploy-sequence.mjs
```
