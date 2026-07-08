const DRIPCTL_BASE_URL = process.env.DRIPCTL_BASE_URL || 'https://api.dripctl.dev';
const DRIPCTL_SEQUENCE_EVENT = process.env.DRIPCTL_SEQUENCE_EVENT || 'swarmlab.lead.signup';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function dripctl(path, body) {
  const apiKey = process.env.DRIPCTL_API_KEY;
  const tenantId = process.env.DRIPCTL_TENANT_ID;
  if (!apiKey || !tenantId) {
    const err = new Error('DripCtl is not configured');
    err.statusCode = 503;
    throw err;
  }

  const url = new URL(`/api/v1${path}`, DRIPCTL_BASE_URL.replace(/\/+$/, ''));
  url.searchParams.set('tenantId', tenantId);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : undefined; } catch { parsed = text; }

  if (!response.ok) {
    const err = new Error(typeof parsed?.message === 'string' ? parsed.message : `DripCtl HTTP ${response.status}`);
    err.statusCode = response.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const source = String(body.source || 'swarmlab-learning-package').slice(0, 80);
    const skin = String(body.skin || 'newsletter').slice(0, 40);

    if (!isEmail(email)) return json(res, 400, { error: 'Enter a valid email address.' });

    const subscribedAt = new Date().toISOString();
    const userResult = await dripctl('/users/upsert', {
      email,
      status: 'active',
      source,
      tags: ['swarmlab', 'lead-magnet', skin],
      metadata: {
        source,
        skin,
        leadMagnet: 'green-is-not-correct',
        subscribedAt
      }
    });

    await dripctl('/events', {
      eventType: DRIPCTL_SEQUENCE_EVENT,
      userId: userResult?.user?.id || email,
      payload: {
        email,
        recipientEmail: email,
        source,
        skin,
        leadMagnet: 'green-is-not-correct'
      },
      priority: 'medium',
      tags: ['swarmlab', 'lead-magnet', skin]
    });

    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('subscribe failed', err);
    const status = err.statusCode || 500;
    const safeMessage = status === 503
      ? 'Email signup is not configured yet.'
      : 'Could not subscribe right now. Please try again later.';
    return json(res, status >= 400 && status < 600 ? status : 500, { error: safeMessage });
  }
}
