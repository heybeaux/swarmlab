#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const apiKey = process.env.DRIPCTL_API_KEY;
const tenantId = process.env.DRIPCTL_TENANT_ID;
const baseUrl = (process.env.DRIPCTL_BASE_URL || 'https://api.dripctl.dev').replace(/\/+$/, '');

if (!apiKey || !tenantId) {
  console.error('Missing DRIPCTL_API_KEY or DRIPCTL_TENANT_ID.');
  process.exit(1);
}

const sequence = {
  name: 'swarmlab-green-is-not-correct',
  trigger: 'swarmlab.lead.signup',
  definition: {
    steps: [
      { type: 'send', name: 'welcome', template: 'swarmlab-green-not-correct-welcome', subject: 'The lab where AI teams fail on purpose' },
      { type: 'wait', duration: '1 day' },
      { type: 'send', name: 'lesson-1-green-is-not-correct', template: 'swarmlab-green-not-correct-lesson-1', subject: 'Green is not correct' },
      { type: 'wait', duration: '1 day' },
      { type: 'send', name: 'lesson-2-confident-liar', template: 'swarmlab-green-not-correct-lesson-2', subject: 'The confident liar does not need to lie' },
      { type: 'wait', duration: '1 day' },
      { type: 'send', name: 'lesson-3-rubber-stamp-review', template: 'swarmlab-green-not-correct-lesson-3', subject: 'More reviewers can make work worse' },
      { type: 'wait', duration: '1 day' },
      { type: 'send', name: 'lesson-4-overnight-rot', template: 'swarmlab-green-not-correct-lesson-4', subject: 'Overnight work rots' },
      { type: 'wait', duration: '1 day' },
      { type: 'send', name: 'lesson-5-memory-drift', template: 'swarmlab-green-not-correct-lesson-5', subject: 'A fact can be everywhere and wrong' },
      { type: 'wait', duration: '1 day' },
      { type: 'send', name: 'lesson-6-semantic-handoff', template: 'swarmlab-green-not-correct-lesson-6', subject: 'Same word, different meaning' },
      { type: 'wait', duration: '1 day' },
      { type: 'send', name: 'lesson-7-receipts', template: 'swarmlab-green-not-correct-lesson-7', subject: '“I did it” is not a receipt' },
      { type: 'wait', duration: '1 day' },
      { type: 'send', name: 'checklist', template: 'swarmlab-green-not-correct-checklist', subject: 'The false-green checklist' }
    ]
  },
  optimizationConfig: {
    level: 'suggestions',
    bounds: {
      timing: '±12 hours',
      templates: true,
      addSteps: false,
      removeSteps: false
    }
  }
};

const templates = JSON.parse(await readFile(new URL('./templates/swarmlab-green-is-not-correct.json', import.meta.url), 'utf8'));
console.log(`Loaded ${templates.templates.length} email templates for ${templates.sequence}.`);

const url = new URL('/api/v1/sequences', baseUrl);
url.searchParams.set('tenantId', tenantId);
const response = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(sequence)
});

const text = await response.text();
if (!response.ok) {
  console.error(`DripCtl deploy failed: HTTP ${response.status}`);
  console.error(text);
  process.exit(1);
}
console.log(text || 'Sequence deployed.');
console.log('NOTE: current DripCtl API deploys sequence definitions by template reference. Import template bodies into the active provider/template store when that endpoint exists.');
