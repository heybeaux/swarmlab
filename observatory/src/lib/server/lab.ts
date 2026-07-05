import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { marked } from 'marked';
import type {
  ExperimentDetail,
  ExperimentSummary,
  RunSummary,
  TraceEvent
} from '$lib/types';

/** Monorepo root: observatory/ lives one level below it. */
const LAB_ROOT = resolve(process.cwd(), '..');
const EXPERIMENTS_DIR = join(LAB_ROOT, 'experiments');

const ID_RE = /^[\w.-]+$/;

function assertSafeId(id: string): void {
  if (!ID_RE.test(id)) throw new Error(`invalid id: ${id}`);
}

async function readReadme(expDir: string): Promise<string | null> {
  try {
    return await readFile(join(expDir, 'README.md'), 'utf8');
  } catch {
    return null;
  }
}

function firstParagraph(md: string): string {
  const lines = md.split('\n');
  const para: string[] = [];
  for (const line of lines) {
    const s = line.trim();
    if (s.startsWith('#') || s.startsWith('>')) continue;
    if (s === '') {
      if (para.length > 0) break;
      continue;
    }
    para.push(s);
  }
  return para.join(' ').replace(/[*_`]/g, '');
}

/** Pull a "faculty: X" or "Faculty under test: X" hint out of the README. */
function facultyOf(md: string): string | null {
  const m = md.match(/faculty(?:\s+under\s+test)?\s*[:—-]\s*([^\n.]+)/i);
  return m ? m[1].trim().replace(/[*_`]/g, '') : null;
}

async function listRunFiles(expDir: string): Promise<string[]> {
  try {
    const files = await readdir(join(expDir, 'runs'));
    return files.filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    return [];
  }
}

export function parseTrace(jsonl: string): TraceEvent[] {
  const events: TraceEvent[] = [];
  for (const line of jsonl.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const ev = JSON.parse(s) as TraceEvent;
      if (ev && typeof ev === 'object' && 't' in ev && 'ts' in ev) events.push(ev);
    } catch {
      // skip malformed lines — a real red trace beats a fake green one
    }
  }
  return events;
}

function summarizeRun(id: string, file: string, events: TraceEvent[]): RunSummary {
  const agents = new Set<string>();
  let messages = 0;
  let scores: Record<string, number> | null = null;
  for (const ev of events) {
    if (ev.t === 'spawn') agents.add(ev.agentId);
    if (ev.t === 'message') messages++;
    if (ev.t === 'score') scores = ev.scores;
  }
  return {
    id,
    file,
    events: events.length,
    agents: agents.size,
    messages,
    scores,
    startedAt: events.length ? events[0].ts : null,
    endedAt: events.length ? events[events.length - 1].ts : null
  };
}

export async function listExperiments(): Promise<ExperimentSummary[]> {
  let dirs: string[];
  try {
    dirs = await readdir(EXPERIMENTS_DIR);
  } catch {
    return [];
  }
  const out: ExperimentSummary[] = [];
  for (const id of dirs.sort()) {
    const expDir = join(EXPERIMENTS_DIR, id);
    try {
      if (!(await stat(expDir)).isDirectory()) continue;
    } catch {
      continue;
    }
    const md = await readReadme(expDir);
    const runs = await listRunFiles(expDir);
    out.push({
      id,
      name: id.replace(/^\d+-/, '').replace(/-/g, ' '),
      description: md ? firstParagraph(md) : 'No README yet.',
      faculty: md ? facultyOf(md) : null,
      runCount: runs.length,
      status: runs.length > 0 ? 'has-runs' : 'no-runs'
    });
  }
  return out;
}

export async function getExperiment(id: string): Promise<ExperimentDetail | null> {
  assertSafeId(id);
  const expDir = join(EXPERIMENTS_DIR, id);
  try {
    if (!(await stat(expDir)).isDirectory()) return null;
  } catch {
    return null;
  }
  const md = await readReadme(expDir);
  const runFiles = await listRunFiles(expDir);
  const runs: RunSummary[] = [];
  for (const file of runFiles) {
    const raw = await readFile(join(expDir, 'runs', file), 'utf8');
    runs.push(summarizeRun(file.replace(/\.jsonl$/, ''), file, parseTrace(raw)));
  }
  return {
    id,
    name: id.replace(/^\d+-/, '').replace(/-/g, ' '),
    description: md ? firstParagraph(md) : 'No README yet.',
    faculty: md ? facultyOf(md) : null,
    runCount: runs.length,
    status: runs.length > 0 ? 'has-runs' : 'no-runs',
    readmeHtml: md ? await marked.parse(md) : '<p><em>No README yet.</em></p>',
    runs
  };
}

export async function getTrace(expId: string, runId: string): Promise<TraceEvent[] | null> {
  assertSafeId(expId);
  assertSafeId(runId);
  try {
    const raw = await readFile(join(EXPERIMENTS_DIR, expId, 'runs', `${runId}.jsonl`), 'utf8');
    return parseTrace(raw);
  } catch {
    return null;
  }
}
