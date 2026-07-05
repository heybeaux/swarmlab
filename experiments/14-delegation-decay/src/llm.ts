/**
 * Live haiku exhibition — real claude-haiku-4-5-20251001 delegation trees.
 *
 * Three cells, one trial each: d0 (a single agent implements all 20
 * requirements — the baseline), d2b2, and d3b3. Delegators receive their brief
 * as plain requirement lines and must SPLIT and RESTATE them for their
 * children (telephone-style: restating is where drop/drift live). Leaves emit
 * a config JSON fragment. Reassembly is mechanical; `assess()` classifies
 * every requirement with harness assertions — no LLM ever judges success.
 *
 * Fork detection is mechanical too: a relational requirement counts as forked
 * iff its two keys were emitted by different leaves.
 *
 * EXHIBITION, NOT EVIDENCE: 1 trial/cell, token proxy = chars/4. The 25-trial
 * seeded sim in maina.ts is the measurement instrument.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MessageBus,
  TraceWriter,
  readRunRecord,
  spawnAgent,
  StubRuntime,
  type AgentHandle,
  type TraceEvent,
} from '@swarmlab/core';
import { round3 } from './rng.js';
import { assess, N_REQUIREMENTS, requirementText } from './task.js';
import { ClaudeCliGen, claudeCliAvailable, extractJson, pool } from './gen.js';

if (!claudeCliAvailable()) {
  console.error('claude CLI not available — skipping live exhibition');
  process.exit(1);
}

const CELLS = [
  { id: 'd0', depth: 0, branching: 1 },
  { id: 'd2b2', depth: 2, branching: 2 },
  { id: 'd3b3', depth: 3, branching: 3 },
] as const;

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `dd-llm-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '14-delegation-decay' });
const bus = new MessageBus({ trace });
const runtime = new StubRuntime();
const gen = new ClaudeCliGen();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    part: 'A-live',
    mode: 'llm',
    model: gen.model,
    trialsPerCell: 1,
    requirements: N_REQUIREMENTS,
    cells: CELLS.map((c) => c.id),
    note: 'exhibition, not evidence — sim sweep dd-a is the instrument',
  },
});

const DELEGATOR_SYSTEM =
  'You are a delegation node in an engineering org. You receive a brief of configuration ' +
  'requirements and must divide the work among your sub-workers. Restate each requirement ' +
  'in your own words as you would when writing a hand-off brief. Assign every piece of work ' +
  'to exactly one sub-worker. Reply with ONLY a JSON array containing one array of ' +
  'requirement strings per sub-worker, nothing else.';

const LEAF_SYSTEM =
  'You are a configuration worker. Implement every requirement in your brief. Reply with ' +
  'ONLY a JSON object mapping config keys (snake_case strings) to integer values, nothing else.';

interface LeafResult {
  agent: string;
  config: Record<string, number>;
}

async function runLeaf(cellId: string, agent: string, lines: readonly string[]): Promise<LeafResult> {
  const config: Record<string, number> = {};
  // An empty brief is a real delegation outcome (everything for this worker was
  // dropped upstream) — record an empty fragment, don't call the model. Likewise
  // an unparseable leaf reply means the worker produced nothing usable.
  if (lines.length > 0) {
    const reply = await gen.gen(LEAF_SYSTEM, `Your brief:\n${lines.join('\n')}`);
    try {
      const raw = extractJson(reply) as Record<string, unknown>;
      for (const [k, v] of Object.entries(raw)) {
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) config[k] = n;
      }
    } catch {
      console.log(`  (leaf ${agent}: unparseable reply, counted as empty fragment)`);
    }
  }
  bus.publish({
    from: `${cellId}:${agent}`,
    to: `${cellId}:a0`,
    topic: 'fragment',
    body: { keys: Object.keys(config), values: config },
  });
  return { agent, config };
}

async function runNode(
  cell: (typeof CELLS)[number],
  agent: string,
  lines: readonly string[],
  level: number,
): Promise<LeafResult[]> {
  if (level >= cell.depth) return [await runLeaf(cell.id, agent, lines)];
  const reply = await gen.gen(
    DELEGATOR_SYSTEM,
    `You have ${cell.branching} sub-workers. Divide this brief among them:\n${lines.join('\n')}`,
  );
  const parsed = extractJson(reply);
  if (!Array.isArray(parsed)) throw new Error(`delegator ${agent} did not return an array`);
  const briefs: string[][] = [];
  for (let i = 0; i < cell.branching; i += 1) {
    const b = parsed[i];
    briefs.push(Array.isArray(b) ? b.map((x) => String(x)) : []);
  }
  const jobs = briefs.map((brief, i) => {
    const child = `${agent}.${i}`;
    bus.publish({
      from: `${cell.id}:${agent}`,
      to: `${cell.id}:${child}`,
      topic: 'brief',
      body: { level, items: brief.length, brief },
    });
    return () => runNode(cell, child, brief, level + 1);
  });
  return (await pool(jobs)).flat();
}

interface CellOutcome {
  id: string;
  survival: number;
  reinterpreted: number;
  dropped: number;
  integration: number;
  tokens: number;
}

const outcomes: CellOutcome[] = [];

for (let c = 0; c < CELLS.length; c += 1) {
  const cell = CELLS[c];
  if (!cell) continue;
  const charsBefore = gen.charCount;

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'cell',
    body: { cell: cell.id, depth: cell.depth, branching: cell.branching, mode: 'llm' },
  });

  // Spawn the whole tree through core so the run replays in the observatory.
  const handles: AgentHandle[] = [];
  const spawnNode = async (id: string, level: number): Promise<void> => {
    const role = level === 0 ? (cell.depth === 0 ? 'solo' : 'root') : level < cell.depth ? 'mid' : 'leaf';
    handles.push(
      await spawnAgent(
        {
          id: `${cell.id}:${id}`,
          model: gen.model,
          systemPrompt: role === 'leaf' || role === 'solo' ? LEAF_SYSTEM : DELEGATOR_SYSTEM,
        },
        { runtime, trace },
      ),
    );
    if (level < cell.depth) {
      for (let i = 0; i < cell.branching; i += 1) await spawnNode(`${id}.${i}`, level + 1);
    }
  };
  await spawnNode('a0', 0);

  console.log(`cell ${cell.id}: running live tree (d=${cell.depth}, b=${cell.branching})…`);
  const leaves = await runNode(cell, 'a0', requirementText().split('\n'), 0);

  // Mechanical reassembly + fork detection from leaf fragments.
  const config = new Map<string, number>();
  const keySource = new Map<string, string>();
  for (const leaf of leaves) {
    for (const [k, v] of Object.entries(leaf.config)) {
      config.set(k, v);
      keySource.set(k, leaf.agent);
    }
  }
  const forked = new Set<string>();
  const { REQUIREMENTS } = await import('./task.js');
  for (const req of REQUIREMENTS) {
    if (req.kind !== 'relational') continue;
    const sa = keySource.get(req.keyA);
    const sb = keySource.get(req.keyB);
    if (sa !== undefined && sb !== undefined && sa !== sb) forked.add(req.id);
  }

  const outcomeMap = assess(config, forked);
  let satisfied = 0;
  let reinterpreted = 0;
  let dropped = 0;
  let integration = 0;
  const perReq: Record<string, string> = {};
  for (const [id, o] of outcomeMap.entries()) {
    perReq[id] = o;
    if (o === 'satisfied') satisfied += 1;
    else if (o === 'reinterpreted') reinterpreted += 1;
    else if (o === 'dropped') dropped += 1;
    else integration += 1;
  }
  const tokens = Math.round((gen.charCount - charsBefore) / 4);

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'verdict',
    body: {
      cell: cell.id,
      survival: round3(satisfied / N_REQUIREMENTS),
      reinterpreted,
      dropped,
      integration,
      forked: [...forked],
      perReq,
      tokensProxy: tokens,
    },
  });

  for (const h of handles) {
    await h.kill();
    bus.removeAgent(h.id);
  }

  const out: CellOutcome = {
    id: cell.id,
    survival: round3(satisfied / N_REQUIREMENTS),
    reinterpreted,
    dropped,
    integration,
    tokens,
  };
  outcomes.push(out);

  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      cellIndex: c,
      depth: cell.depth,
      branching: cell.branching,
      requirementSurvival: out.survival,
      driftReinterpreted: round3(reinterpreted / N_REQUIREMENTS),
      driftDropped: round3(dropped / N_REQUIREMENTS),
      integrationTax: round3(integration / N_REQUIREMENTS),
      tokensProxy: tokens,
    },
  });

  console.log(
    `${cell.id.padEnd(5)} | survival=${out.survival.toFixed(3)} reint=${reinterpreted} ` +
      `drop=${dropped} seam=${integration} tokens≈${tokens}`,
  );
}

const d0 = outcomes[0];
if (d0) {
  const amp: Record<string, number> = { d0Tokens: d0.tokens };
  for (const o of outcomes.slice(1)) {
    amp[`${o.id}CostAmp`] = round3(o.tokens / Math.max(1, d0.tokens));
  }
  trace.append({ t: 'score', ts: Date.now(), scores: amp });
  console.log('cost amplification vs d0:', JSON.stringify(amp));
}

// --- replay verification -------------------------------------------------------------

const written = trace.toRunRecord();
const replayed = await readRunRecord(traceFile);
const count = (events: readonly TraceEvent[], t: TraceEvent['t']): number =>
  events.filter((e) => e.t === t).length;
const kinds: readonly TraceEvent['t'][] = ['spawn', 'message', 'score', 'kill'];
for (const kind of kinds) {
  const a = count(written.events, kind);
  const b = count(replayed.events, kind);
  if (a !== b) throw new Error(`replay mismatch for ${kind}: wrote ${a}, replayed ${b}`);
}
console.log(
  `replay verified: ${replayed.events.length} events ` +
    `(${kinds.map((k) => `${k}=${count(replayed.events, k)}`).join(' ')})`,
);
console.log(`trace: ${traceFile}`);
