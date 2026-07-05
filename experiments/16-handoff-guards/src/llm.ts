/**
 * exp-16 live exhibition — real claude-haiku-4-5-20251001 d3b3 trees under
 * each guard tier, mirroring exp-14's live d3b3 (where 7/7 losses were silent
 * drops at 9.3× cost). One d0 solo baseline + one d3b3 tree per tier.
 *
 * The guard is HARNESS-LEVEL and the model is never told it exists: after a
 * delegator splits its brief, the harness checks the child briefs against a
 * requirement manifest (mechanical key/value scan — no LLM judges anything)
 * and repairs them before the children run.
 *  - presence: every manifest key must appear in some child brief; a missing
 *    key back-fills the parent's own line into the lightest child.
 *  - value-echo: additionally, lines mentioning a manifest key must contain
 *    the expected value among their integers; a mismatch appends a CORRECTION
 *    line carrying the parent's canonical text.
 *
 * Parser caveats (honest): key detection is substring match on snake_case key
 * names; value verification is "expected integer appears in the line" — a
 * drifted value can be masked when the expected number coincides with another
 * number in the same line (e.g. an offset constant), and a delegator that
 * RENAMES a key defeats presence matching (would surface as a false drop
 * flag + back-fill). Flags are therefore reported as counts, not attributed
 * false/true mid-tree. EXHIBITION, NOT EVIDENCE — the 25-trial seeded sim in
 * main.ts is the instrument.
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
import { round3 } from '@swarmlab/experiment-14-delegation-decay/dist/rng.js';
import {
  assess,
  N_REQUIREMENTS,
  REQUIREMENTS,
  requirementText,
} from '@swarmlab/experiment-14-delegation-decay/dist/task.js';
import {
  ClaudeCliGen,
  claudeCliAvailable,
  extractJson,
  pool,
} from '@swarmlab/experiment-14-delegation-decay/dist/gen.js';
import { TIERS, type GuardTier } from './guards.js';

if (!claudeCliAvailable()) {
  console.error('claude CLI not available — skipping live exhibition');
  process.exit(1);
}

const DEPTH = 3;
const BRANCHING = 3;

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `hg-llm-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '16-handoff-guards' });
const bus = new MessageBus({ trace });
const runtime = new StubRuntime();
const gen = new ClaudeCliGen();

bus.publish({
  from: 'moderator',
  to: '*',
  topic: 'meta',
  body: {
    experiment: 'handoff-guards',
    mode: 'llm',
    model: gen.model,
    cells: ['d0', ...TIERS.map((t) => `d3b3-${t}`)],
    note: 'exhibition, not evidence — sim sweep hg-mr853iu8 is the instrument',
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

/** Harness-side manifest entry: what a node's brief must preserve. */
interface ManifestEntry {
  id: string;
  keys: string[];
  expect: Record<string, number>;
  /** the parent's own text for this requirement — the back-fill payload */
  line: string;
}

function canonicalManifest(): ManifestEntry[] {
  const lines = requirementText().split('\n');
  return REQUIREMENTS.map((r, i) => {
    const line = lines[i] ?? '';
    return r.kind === 'unary'
      ? { id: r.id, keys: [r.key], expect: { [r.key]: r.value }, line }
      : {
          id: r.id,
          keys: [r.keyA, r.keyB],
          expect: { [r.keyA]: r.param + r.offset, [r.keyB]: r.param },
          line,
        };
  });
}

const mentions = (lines: readonly string[], key: string): boolean =>
  lines.some((l) => l.includes(key));

interface GuardTally {
  dropFlags: number;
  valueFlags: number;
  backfills: number;
  corrections: number;
  unverifiable: number;
  manifestChars: number;
}

function guardChildBriefs(
  tier: GuardTier,
  manifest: readonly ManifestEntry[],
  briefs: string[][],
  tally: GuardTally,
  onFlag: (kind: 'drop' | 'value', reqId: string, child: number) => void,
): void {
  if (tier === 'unguarded') return;
  tally.manifestChars += JSON.stringify(
    tier === 'presence' ? manifest.map((m) => m.id) : manifest.map((m) => ({ id: m.id, expect: m.expect })),
  ).length;
  for (const m of manifest) {
    const all = briefs.flat();
    const missing = m.keys.filter((k) => !mentions(all, k));
    if (missing.length > 0) {
      // Presence check failed: some key of this requirement appears in no
      // child brief. Back-fill the parent's line into the lightest child.
      tally.dropFlags += 1;
      tally.backfills += 1;
      let target = 0;
      for (let i = 1; i < briefs.length; i += 1) {
        if ((briefs[i]?.length ?? 0) < (briefs[target]?.length ?? 0)) target = i;
      }
      briefs[target]?.push(m.line);
      onFlag('drop', m.id, target);
      continue;
    }
    if (tier !== 'value-echo') continue;
    // Value echo: every line mentioning a manifest key must carry the
    // expected value among its integers.
    for (const [key, expected] of Object.entries(m.expect)) {
      let corrected = false;
      for (let ci = 0; ci < briefs.length && !corrected; ci += 1) {
        const withKey = (briefs[ci] ?? []).filter((l) => l.includes(key));
        if (withKey.length === 0) continue;
        const ints = withKey.flatMap((l) => (l.match(/-?\d+/g) ?? []).map(Number));
        if (ints.length === 0) {
          tally.unverifiable += 1;
          continue;
        }
        if (!ints.includes(expected)) {
          tally.valueFlags += 1;
          tally.corrections += 1;
          briefs[ci]?.push(`CORRECTION (manifest check): ${m.line}`);
          onFlag('value', m.id, ci);
          corrected = true;
        }
      }
    }
  }
}

/** Restrict a manifest entry to the keys a child's brief actually mentions. */
function childManifest(manifest: readonly ManifestEntry[], brief: readonly string[]): ManifestEntry[] {
  const out: ManifestEntry[] = [];
  for (const m of manifest) {
    const keys = m.keys.filter((k) => mentions(brief, k));
    if (keys.length === 0) continue;
    const expect: Record<string, number> = {};
    for (const k of keys) {
      const v = m.expect[k];
      if (v !== undefined) expect[k] = v;
    }
    out.push({ id: m.id, keys, expect, line: m.line });
  }
  return out;
}

interface LeafResult {
  agent: string;
  config: Record<string, number>;
}

async function runLeaf(cellId: string, agent: string, lines: readonly string[]): Promise<LeafResult> {
  const config: Record<string, number> = {};
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
  cellId: string,
  tier: GuardTier,
  agent: string,
  lines: readonly string[],
  manifest: readonly ManifestEntry[],
  level: number,
  tally: GuardTally,
): Promise<LeafResult[]> {
  if (level >= DEPTH) return [await runLeaf(cellId, agent, lines)];
  // Haiku occasionally returns non-array JSON; retry the malformed call up to
  // 3 times (a transport retry, not a content nudge — same prompt verbatim).
  let parsed: unknown;
  for (let attempt = 1; ; attempt += 1) {
    const reply = await gen.gen(
      DELEGATOR_SYSTEM,
      `You have ${BRANCHING} sub-workers. Divide this brief among them:\n${lines.join('\n')}`,
    );
    parsed = extractJson(reply);
    if (Array.isArray(parsed)) break;
    if (attempt >= 3) throw new Error(`delegator ${agent} did not return an array after 3 attempts`);
    console.error(`retry: delegator ${agent} returned non-array (attempt ${attempt})`);
  }
  if (!Array.isArray(parsed)) throw new Error('unreachable');
  const briefs: string[][] = [];
  for (let i = 0; i < BRANCHING; i += 1) {
    const b = parsed[i];
    briefs.push(Array.isArray(b) ? b.map((x) => String(x)) : []);
  }
  guardChildBriefs(tier, manifest, briefs, tally, (kind, reqId, child) => {
    bus.publish({
      from: `${cellId}:${agent}.${child}`,
      to: `${cellId}:${agent}`,
      topic: 'guard-flag',
      body: { tier, level, reqId, kind },
    });
  });
  const jobs = briefs.map((brief, i) => {
    const child = `${agent}.${i}`;
    bus.publish({
      from: `${cellId}:${agent}`,
      to: `${cellId}:${child}`,
      topic: 'brief',
      body: { tier, level, items: brief.length, brief },
    });
    return () => runNode(cellId, tier, child, brief, childManifest(manifest, brief), level + 1, tally);
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
  manifestTokens: number;
  tally: GuardTally;
}

const outcomes: CellOutcome[] = [];

async function runCell(cellId: string, tier: GuardTier, depth: number): Promise<void> {
  const charsBefore = gen.charCount;
  const tally: GuardTally = {
    dropFlags: 0,
    valueFlags: 0,
    backfills: 0,
    corrections: 0,
    unverifiable: 0,
    manifestChars: 0,
  };

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'cell',
    body: { cell: cellId, tier, depth, branching: depth === 0 ? 1 : BRANCHING, mode: 'llm' },
  });

  const handles: AgentHandle[] = [];
  const spawnNode = async (id: string, level: number): Promise<void> => {
    const role = level === 0 ? (depth === 0 ? 'solo' : 'root') : level < depth ? 'mid' : 'leaf';
    handles.push(
      await spawnAgent(
        {
          id: `${cellId}:${id}`,
          model: gen.model,
          systemPrompt: role === 'leaf' || role === 'solo' ? LEAF_SYSTEM : DELEGATOR_SYSTEM,
        },
        { runtime, trace },
      ),
    );
    if (level < depth) {
      for (let i = 0; i < BRANCHING; i += 1) await spawnNode(`${id}.${i}`, level + 1);
    }
  };
  await spawnNode('a0', 0);

  console.log(`cell ${cellId}: running live tree (tier=${tier})…`);
  const leaves =
    depth === 0
      ? [await runLeaf(cellId, 'a0', requirementText().split('\n'))]
      : await runNode(cellId, tier, 'a0', requirementText().split('\n'), canonicalManifest(), 0, tally);

  const config = new Map<string, number>();
  const keySource = new Map<string, string>();
  for (const leaf of leaves) {
    for (const [k, v] of Object.entries(leaf.config)) {
      config.set(k, v);
      keySource.set(k, leaf.agent);
    }
  }
  const forked = new Set<string>();
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
  const manifestTokens = Math.round(tally.manifestChars / 4);

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'verdict',
    body: {
      cell: cellId,
      tier,
      survival: round3(satisfied / N_REQUIREMENTS),
      reinterpreted,
      dropped,
      integration,
      forked: [...forked],
      perReq,
      tokensProxy: tokens,
      manifestTokens,
      guard: { ...tally },
    },
  });

  for (const h of handles) {
    await h.kill();
    bus.removeAgent(h.id);
  }

  const out: CellOutcome = {
    id: cellId,
    survival: round3(satisfied / N_REQUIREMENTS),
    reinterpreted,
    dropped,
    integration,
    tokens,
    manifestTokens,
    tally,
  };
  outcomes.push(out);

  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      cellIndex: outcomes.length - 1,
      tierIndex: TIERS.indexOf(tier),
      depth,
      requirementSurvival: out.survival,
      driftReinterpreted: round3(reinterpreted / N_REQUIREMENTS),
      driftDropped: round3(dropped / N_REQUIREMENTS),
      integrationTax: round3(integration / N_REQUIREMENTS),
      tokensProxy: tokens,
      manifestTokens,
      dropFlags: tally.dropFlags,
      valueFlags: tally.valueFlags,
      backfills: tally.backfills,
      corrections: tally.corrections,
      unverifiable: tally.unverifiable,
    },
  });

  console.log(
    `${cellId.padEnd(16)} | survival=${out.survival.toFixed(3)} reint=${reinterpreted} drop=${dropped} ` +
      `seam=${integration} tokens≈${tokens} manifest≈${manifestTokens} ` +
      `flags(drop=${tally.dropFlags} value=${tally.valueFlags} unverifiable=${tally.unverifiable})`,
  );
}

await runCell('d0', 'unguarded', 0);
for (const tier of TIERS) {
  await runCell(`d3b3-${tier}`, tier, DEPTH);
}

const d0 = outcomes[0];
if (d0) {
  const amp: Record<string, number> = { d0Tokens: d0.tokens };
  for (const o of outcomes.slice(1)) {
    amp[`${o.id}CostAmp`] = round3((o.tokens + o.manifestTokens) / Math.max(1, d0.tokens));
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
