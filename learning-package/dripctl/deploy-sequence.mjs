#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const apiKey = process.env.DRIPCTL_API_KEY;
const tenantId = process.env.DRIPCTL_TENANT_ID;
const baseUrl = (process.env.DRIPCTL_BASE_URL || 'https://api.dripctl.dev').replace(/\/+$/, '');

if (!apiKey || !tenantId) {
  console.error('Missing DRIPCTL_API_KEY or DRIPCTL_TENANT_ID.');
  process.exit(1);
}

const templates = JSON.parse(
  await readFile(new URL('./templates/swarmlab-green-is-not-correct.json', import.meta.url), 'utf8'),
);
const templateById = new Map(templates.templates.map((template) => [template.id, template]));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function markdownToHtml(markdown) {
  const blocks = [];
  const lines = String(markdown || '').split(/\r?\n/);
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    blocks.push(`<ul>${list.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
    list = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    if (trimmed === '---') {
      flushParagraph();
      flushList();
      blocks.push('<hr>');
      continue;
    }
    if (trimmed.startsWith('- ')) {
      flushParagraph();
      list.push(trimmed.slice(2));
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks.join('\n');
}

function templateHtml(template) {
  const body = markdownToHtml(template.bodyMarkdown);
  const cta = template.ctaMarkdown ? `<div class="cta-block">${markdownToHtml(template.ctaMarkdown)}</div>` : '';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; padding: 0; background: #f7f4ed; color: #1f2933; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    .container { max-width: 640px; margin: 0 auto; padding: 40px 24px; background: #fffdf7; }
    .eyebrow { color: #5c7f4c; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 18px; }
    p { font-size: 16px; line-height: 1.65; margin: 0 0 18px; }
    ul { margin: 0 0 18px 22px; padding: 0; }
    li { font-size: 16px; line-height: 1.6; margin-bottom: 8px; }
    strong { color: #111827; }
    code { background: #f0eadc; border-radius: 4px; padding: 1px 5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    hr { border: 0; border-top: 1px solid #ded6c6; margin: 28px 0; }
    .cta-block { margin-top: 30px; padding-top: 22px; border-top: 1px solid #ded6c6; color: #53606a; }
    .footer { margin-top: 36px; color: #78838c; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="eyebrow">SwarmLab</div>
    ${body}
    ${cta}
    <div class="footer">You received this because you requested the SwarmLab learning package.</div>
  </div>
</body>
</html>`;
}

function templateText(template) {
  return [template.bodyMarkdown, template.ctaMarkdown]
    .filter(Boolean)
    .join('\n\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1');
}

function send(name, templateId) {
  const template = templateById.get(templateId);
  if (!template) throw new Error(`Missing exported template body for ${templateId}`);
  return {
    type: 'send',
    name,
    template: templateId,
    subject: template.subject,
    html: templateHtml(template),
    text: templateText(template),
  };
}

function waitOneDay() {
  return { type: 'wait', delay: '1d' };
}

const sequence = {
  name: 'swarmlab-green-is-not-correct',
  trigger: 'swarmlab.lead.signup',
  definition: {
    steps: [
      send('welcome', 'swarmlab-green-not-correct-welcome'),
      waitOneDay(),
      send('lesson-1-green-is-not-correct', 'swarmlab-green-not-correct-lesson-1'),
      waitOneDay(),
      send('lesson-2-confident-liar', 'swarmlab-green-not-correct-lesson-2'),
      waitOneDay(),
      send('lesson-3-rubber-stamp-review', 'swarmlab-green-not-correct-lesson-3'),
      waitOneDay(),
      send('lesson-4-overnight-rot', 'swarmlab-green-not-correct-lesson-4'),
      waitOneDay(),
      send('lesson-5-memory-drift', 'swarmlab-green-not-correct-lesson-5'),
      waitOneDay(),
      send('lesson-6-semantic-handoff', 'swarmlab-green-not-correct-lesson-6'),
      waitOneDay(),
      send('lesson-7-receipts', 'swarmlab-green-not-correct-lesson-7'),
      waitOneDay(),
      send('checklist', 'swarmlab-green-not-correct-checklist'),
    ],
  },
  optimizationConfig: {
    level: 'suggestions',
    bounds: {
      timing: '+/-12 hours',
      templates: true,
      addSteps: false,
      removeSteps: false,
    },
  },
};

console.log(`Loaded and inlined ${templates.templates.length} email templates for ${templates.sequence}.`);

const url = new URL('/api/v1/sequences', baseUrl);
url.searchParams.set('tenantId', tenantId);
const response = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(sequence),
});

const text = await response.text();
if (!response.ok) {
  console.error(`DripCtl deploy failed: HTTP ${response.status}`);
  console.error(text);
  process.exit(1);
}
console.log(text || 'Sequence deployed.');
console.log('Template bodies were inlined into send steps. DripCtl does not have a first-class template import endpoint yet.');
