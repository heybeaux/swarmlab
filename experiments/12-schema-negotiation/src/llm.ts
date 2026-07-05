/**
 * Experiment 12 — Schema Negotiation, real-LLM exhibition.
 *
 * The sim (main.ts) matches fields with a name/type/value heuristic and shows that an
 * exact-name false friend ("total" = pre-tax to A, post-tax to B) sails through with
 * high confidence — silent corruption nobody detects. This exhibition asks the sharper
 * question: does a REAL model, reasoning in natural language over the same wire surface,
 * fall into the same trap — or does it notice the ambiguity the heuristic is blind to?
 *
 * Two real haiku agents (A and B) each receive ONLY their own field list — wire NAME,
 * wire TYPE, and 3 example VALUES per field. Neither sees the other's hidden `concept`
 * labels. Each independently proposes a mapping from its fields to the peer's; we keep
 * the rows BOTH sides endorse (mutual agreement), then score every agreed row against
 * the hidden ground-truth concepts. A believed-matched row whose concepts actually
 * differ is a silent corruption — the exact failure the sim measures, now on real
 * reasoning. Isolation follows exp-01's gen.ts.
 *
 * Run: node dist/llm.js. Env: SCHEMA_LLM_MODEL (default haiku). Exits 0 with a warning
 * if the claude CLI is unavailable — the sim sweep in main.ts is the primary artifact.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MessageBus,
  TraceWriter,
  readRunRecord,
  spawnAgent,
  StubRuntime,
} from '@swarmlab/core';
import { ClaudeCliGen, claudeCliAvailable, stripFences } from './gen.js';
import { buildSchemaPair, sampleValue } from './schemas.js';
import { seeded } from './rng.js';
import type { FieldDef, Schema } from './types.js';

const MODEL = process.env.SCHEMA_LLM_MODEL ?? 'claude-haiku-4-5-20251001';
const SEED = process.env.SCHEMA_LLM_SEED ?? 'schema-llm-v1';
// Overlap high + all 3 false friends injected: the hardest, most instructive surface.
const OVERLAP = Number(process.env.SCHEMA_LLM_OVERLAP ?? 0.7);
const FALSE_FRIENDS = Number(process.env.SCHEMA_LLM_FF ?? 3);

/** Render one agent's observable view: name, type, 3 sample values. No concepts. */
function renderView(schema: Schema, rand: () => number): string {
  return schema.fields
    .map((f) => {
      const samples = [0, 1, 2].map(() => sampleValue(f.concept, rand));
      return `- ${f.name} (type: ${f.wire}) e.g. ${samples.map((s) => JSON.stringify(s)).join(', ')}`;
    })
    .join('\n');
}

interface Pair {
  from: string;
  to: string;
}

/** Parse "MYFIELD -> THEIRFIELD" lines from a model reply into pairs. */
function parsePairs(raw: string, mine: readonly FieldDef[], theirs: readonly FieldDef[]): Pair[] {
  const mineNames = new Set(mine.map((f) => f.name.toLowerCase()));
  const theirNames = new Set(theirs.map((f) => f.name.toLowerCase()));
  const canon = (set: Set<string>, defs: readonly FieldDef[], s: string): string | undefined => {
    const low = s.toLowerCase();
    if (set.has(low)) return defs.find((f) => f.name.toLowerCase() === low)?.name;
    return undefined;
  };
  const pairs: Pair[] = [];
  for (const line of stripFences(raw).split('\n')) {
    const m = /([A-Za-z0-9_]+)\s*(?:->|=>|:|\bto\b|=)\s*([A-Za-z0-9_]+)/.exec(line.trim());
    if (!m || !m[1] || !m[2]) continue;
    const from = canon(mineNames, mine, m[1]);
    const to = canon(theirNames, theirs, m[2]);
    if (from && to) pairs.push({ from, to });
  }
  return pairs;
}

function proposePrompt(selfView: string, peerView: string, selfLabel: string, peerLabel: string): string {
  return (
    `You are agent ${selfLabel}. You and agent ${peerLabel} store the SAME kind of business ` +
    `records (e-commerce orders) but with different field names and encodings. You must map ` +
    `YOUR fields onto ${peerLabel}'s fields so records can be exchanged. You can see only wire ` +
    `names, types, and example values — never the other side's intended meaning. Beware: a ` +
    `field with the same NAME on both sides may mean DIFFERENT things (e.g. a pre-tax vs a ` +
    `post-tax total, milliseconds vs seconds). Map only pairs you are confident share the SAME ` +
    `real-world meaning; skip anything ambiguous.\n\n` +
    `YOUR (${selfLabel}) FIELDS:\n${selfView}\n\n${peerLabel}'s FIELDS:\n${peerView}\n\n` +
    `Output ONLY mapping lines, one per line, in the form:  MYFIELD -> THEIRFIELD\n` +
    `No prose, no explanation.`
  );
}

async function main(): Promise<void> {
  if (!claudeCliAvailable()) {
    console.warn('claude CLI unavailable — LLM exhibition skipped (sim sweep is the primary artifact)');
    return;
  }
  const gen = new ClaudeCliGen(MODEL);
  const runsDir = join(import.meta.dirname, '..', 'runs');
  mkdirSync(runsDir, { recursive: true });
  const runId = `sn-llm-${Date.now().toString(36)}`;
  const traceFile = join(runsDir, `${runId}.jsonl`);
  const trace = new TraceWriter(traceFile, { runId, experiment: '12-schema-negotiation' });
  const bus = new MessageBus({ trace });
  const runtime = new StubRuntime();

  const rand = seeded(SEED);
  const pair = buildSchemaPair(OVERLAP, FALSE_FRIENDS, rand);
  const aView = renderView(pair.a, seeded(`${SEED}:a`));
  const bView = renderView(pair.b, seeded(`${SEED}:b`));

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'meta',
    body: {
      mode: 'llm',
      model: MODEL,
      overlap: OVERLAP,
      falseFriends: pair.falseFriendNames,
      aFields: pair.a.fields.map((f) => f.name),
      bFields: pair.b.fields.map((f) => f.name),
    },
  });
  console.log(`run ${runId} | mode=llm model=${MODEL} falseFriends=[${pair.falseFriendNames.join(',')}]`);

  await spawnAgent({ id: 'A', model: MODEL, systemPrompt: 'Schema negotiator A' }, { runtime, trace });
  await spawnAgent({ id: 'B', model: MODEL, systemPrompt: 'Schema negotiator B' }, { runtime, trace });

  // Each side independently proposes a mapping (its own fields -> peer fields).
  const aRaw = await gen.gen('Schema negotiator A', proposePrompt(aView, bView, 'A', 'B'));
  const aPairs = parsePairs(aRaw, pair.a.fields, pair.b.fields);
  bus.publish({ from: 'A', to: 'B', topic: 'propose', body: { pairs: aPairs } });
  console.log(`A proposed ${aPairs.length}: ${aPairs.map((p) => `${p.from}->${p.to}`).join(', ')}`);

  const bRaw = await gen.gen('Schema negotiator B', proposePrompt(bView, aView, 'B', 'A'));
  const bPairsRaw = parsePairs(bRaw, pair.b.fields, pair.a.fields);
  // Normalise B's (Bfield -> Afield) into the same (Afield, Bfield) key space.
  const bPairs = bPairsRaw.map((p) => ({ aName: p.to, bName: p.from }));
  bus.publish({ from: 'B', to: 'A', topic: 'counter', body: { pairs: bPairsRaw } });
  console.log(`B proposed ${bPairs.length}: ${bPairs.map((p) => `${p.aName}<-${p.bName}`).join(', ')}`);

  // Mutual agreement: rows BOTH sides asserted (A said a->b AND B said a<-b).
  const bKeys = new Set(bPairs.map((p) => `${p.aName}\u0000${p.bName}`));
  const agreed = aPairs
    .map((p) => ({ aName: p.from, bName: p.to }))
    .filter((p) => bKeys.has(`${p.aName}\u0000${p.bName}`));

  // Score against hidden ground-truth concepts.
  const conceptOf = (s: Schema, name: string): string | undefined =>
    s.fields.find((f) => f.name === name)?.concept;
  let truly = 0;
  let silent = 0;
  const silentRows: string[] = [];
  for (const row of agreed) {
    const ac = conceptOf(pair.a, row.aName);
    const bc = conceptOf(pair.b, row.bName);
    if (ac !== undefined && ac === bc) truly += 1;
    else {
      silent += 1;
      silentRows.push(`${row.aName}(${ac})=${row.bName}(${bc})`);
    }
  }
  const ffNames = new Set(pair.falseFriendNames);
  const ffMapped = agreed.filter((r) => ffNames.has(r.aName) && ffNames.has(r.bName)).length;
  const ffCaught = pair.falseFriendNames.length - ffMapped;

  const round3 = (n: number): number => Math.round(n * 1000) / 1000;
  const mapped = agreed.length;
  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'verdict',
    body: { agreedRows: mapped, trulyMatched: truly, silentCorruptions: silent, silentRows },
  });
  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      agreedRows: mapped,
      trulyMatched: truly,
      silentCorruption: round3(mapped === 0 ? 0 : silent / mapped),
      falseFriendsInjected: pair.falseFriendNames.length,
      falseFriendsMapped: ffMapped,
      falseFriendsCaught: round3(pair.falseFriendNames.length === 0 ? 1 : ffCaught / pair.falseFriendNames.length),
    },
  });
  trace.append({ t: 'kill', ts: Date.now(), agentId: 'A' });
  trace.append({ t: 'kill', ts: Date.now(), agentId: 'B' });

  const replayed = await readRunRecord(traceFile);
  console.log(
    `agreed=${mapped} truly=${truly} silent=${silent} [${silentRows.join('; ')}] ` +
      `ffCaught=${ffCaught}/${pair.falseFriendNames.length} | ` +
      `replay verified: ${replayed.events.length} events | trace: ${traceFile}`,
  );
}

await main();
