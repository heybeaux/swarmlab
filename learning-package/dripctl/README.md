# DripCtl integration — Green Is Not Correct

This folder converts the SwarmLab newsletter lead magnet into DripCtl-ready artifacts.

## Files

- `sequences/swarmlab-green-is-not-correct.ts` — typed sequence-as-code using `@dripctl/sdk` builders.
- `templates/swarmlab-green-is-not-correct.json` — extracted email template payloads from `content/newsletter-sequence.md`.
- `deploy-sequence.mjs` — direct REST deploy helper for the current DripCtl API.

## Trigger

The landing page calls `/api/subscribe`, which creates/upserts the user and fires:

```text
swarmlab.lead.signup
```

The sequence listens for that event.

## Vercel env vars

Set these on the Vercel project:

```bash
DRIPCTL_API_KEY=...
DRIPCTL_TENANT_ID=...
DRIPCTL_BASE_URL=https://api.dripctl.dev # optional
DRIPCTL_SEQUENCE_EVENT=swarmlab.lead.signup # optional
```

## Deploy sequence

```bash
cd learning-package
DRIPCTL_API_KEY=... DRIPCTL_TENANT_ID=... node dripctl/deploy-sequence.mjs
```

Note: the current DripCtl API stores sequence steps with `template` references. The full email bodies are exported here as JSON so they can be imported into whichever provider/template store DripCtl exposes next.
