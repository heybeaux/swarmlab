import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MessageBus,
  TraceWriter,
  replay,
  runScorer,
  spawnAgent,
  type AgentHandle,
  type Scorer,
  type TraceEvent,
} from '@swarmlab/core';
import { ClaudeCliGen, GenRuntime, claudeCliAvailable, type TextGen } from './gen.js';
import { SimGen } from './sim.js';
import { drift } from './drift.js';

// --- configuration ---------------------------------------------------------

const ROUNDS = Number(process.env.TELEPHONE_ROUNDS ?? 10);

const requestedMode = process.env.TELEPHONE_MODE ?? 'llm';
const gen: TextGen =
  requestedMode === 'llm' && claudeCliAvailable() ? new ClaudeCliGen() : new SimGen();
if (requestedMode === 'llm' && gen.mode === 'sim') {
  console.warn('claude CLI unavailable — falling back to deterministic sim mode');
}

const BRIEF =
  'Write a precise spec (max 220 words, plain prose, no headings) for a parking garage ' +
  'fee calculator function with these rules: the first 15 minutes are free; after that, ' +
  '3.50 dollars per started hour; daily cap 24.00 dollars; on weekends the daily cap is ' +
  '18.00 dollars instead; a lost ticket costs a flat 45 dollars regardless of duration; ' +
  'electric vehicles get a 20 percent discount on the pre-cap total, rounded to the ' +
  'nearest 0.25 dollars. State inputs, output, and every rule.';

const SPECCER_PROMPT =
  '[role:speccer] You write concise, precise software specs. Output ONLY the spec text — ' +
  'no preamble, no headings, no markdown.';
const CODER_PROMPT =
  '[role:coder] You are a coder. You receive a natural-language spec and output ONLY ' +
  'TypeScript code implementing it (max 80 lines, minimal comments). No explanation, ' +
  'no markdown fences.';
const RESPECCER_PROMPT =
  '[role:respeccer] You are a reverse-engineer. You receive source code and output ONLY a ' +
  'natural-language spec (max 220 words, plain prose) describing exactly what the code ' +
  'does. You have never seen any earlier spec. No preamble, no markdown.';

// --- setup ------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `tg-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);

const trace = new TraceWriter(traceFile, { runId, experiment: '01-telephone-compiler' });
const bus = new MessageBus({ trace });
const runtime = new GenRuntime(gen);

bus.publish({
  from: 'orchestrator',
  to: '*',
  topic: 'meta',
  body: { mode: gen.mode, model: gen.model, rounds: ROUNDS, brief: BRIEF },
});

const speccer = await spawnAgent({ id: 'speccer', systemPrompt: SPECCER_PROMPT }, { runtime, trace });
const coder = await spawnAgent({ id: 'coder', systemPrompt: CODER_PROMPT }, { runtime, trace });
const respeccer = await spawnAgent(
  { id: 'respeccer', systemPrompt: RESPECCER_PROMPT },
  { runtime, trace },
);

/** Send one message to an agent and await its single reply. */
function ask(handle: AgentHandle, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const off = handle.onMessage((msg) => {
      off();
      resolve(String(msg));
    });
    handle.send(text).catch((err: unknown) => {
      off();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

// --- the telephone line ------------------------------------------------------

console.log(`run ${runId} | mode=${gen.mode} model=${gen.model} rounds=${ROUNDS}`);
const spec0 = await ask(speccer, BRIEF);
console.log(`spec_0 (${spec0.split(/\s+/).length} words)`);

let spec = spec0;
for (let r = 0; r < ROUNDS; r += 1) {
  bus.publish({
    from: r === 0 ? 'speccer' : 'respeccer',
    to: 'coder',
    topic: 'spec',
    body: { round: r, text: spec },
  });
  const code = await ask(coder, spec);
  bus.publish({ from: 'coder', to: 'respeccer', topic: 'code', body: { round: r, text: code } });
  spec = await ask(respeccer, code);
  const scores = drift(spec0, spec, r);
  trace.append({ t: 'score', ts: Date.now(), agentId: 'respeccer', scores });
  console.log(
    `round ${String(r).padStart(2)} | jaccard=${scores.jaccard} numbers=${scores.numberRetention} ` +
      `content=${scores.contentRetention} length=${scores.lengthRatio}`,
  );
}

// final spec (round ROUNDS) so the full text is in the trace
bus.publish({
  from: 'respeccer',
  to: 'coder',
  topic: 'spec',
  body: { round: ROUNDS, text: spec },
});

// --- summary scoring via core's Scorer seam ----------------------------------

const summaryScorer: Scorer = {
  score(run) {
    const rounds = run.events.filter(
      (e): e is Extract<TraceEvent, { t: 'score' }> => e.t === 'score' && e.agentId === 'respeccer',
    );
    const last = rounds[rounds.length - 1]?.scores;
    const minNumbers = Math.min(...rounds.map((e) => e.scores.numberRetention ?? 1));
    return {
      rounds: rounds.length,
      finalJaccard: last?.jaccard ?? 0,
      finalNumberRetention: last?.numberRetention ?? 0,
      minNumberRetention: minNumbers,
      finalLengthRatio: last?.lengthRatio ?? 0,
    };
  },
};
const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

for (const agent of [speccer, coder, respeccer]) {
  await agent.kill();
  bus.removeAgent(agent.id);
}
trace.close();

// --- replay verification ------------------------------------------------------

const counts = { spawn: 0, kill: 0, score: 0, spec: 0, code: 0, meta: 0 };
for await (const event of replay(traceFile)) {
  if (event.t === 'spawn' || event.t === 'kill' || event.t === 'score') counts[event.t] += 1;
  else if (event.topic === 'spec' || event.topic === 'code' || event.topic === 'meta') {
    counts[event.topic] += 1;
  }
}
console.log('replay counts:', counts);
if (
  counts.spawn !== 3 ||
  counts.kill !== 3 ||
  counts.meta !== 1 ||
  counts.spec !== ROUNDS + 1 ||
  counts.code !== ROUNDS ||
  counts.score !== ROUNDS + 1
) {
  throw new Error('telephone-compiler FAILED: unexpected replay event counts');
}
console.log(`telephone-compiler OK ✅  trace: ${traceFile}`);
