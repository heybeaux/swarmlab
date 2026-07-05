/**
 * Experiment 11 — Reverse Engineer, real-LLM exhibition.
 *
 * The sim (main.ts) reverse-engineers a sealed pricing oracle with a deterministic
 * curve-fitter and finds a sharp split: the happy-path tiered ladder is easy to recover,
 * but hidden behavior (a rounding cliff, session-state loyalty, a rare promo path) is
 * near-invisible to input->output probing. This exhibition puts a REAL haiku in the
 * prober's seat: it picks probes, sees only prices, then predicts held-out prices.
 *
 * Two-phase, all against the SAME sealed OracleSession so state (loyalty) is real:
 *   1. PROBE: the model is given a budget and asked for a list of qty values to test.
 *      We run them against the oracle and return (qty -> price).
 *   2. PREDICT: the model, shown its own probe results, predicts the price for a held-out
 *      test set split into HAPPY (ordinary quantities) and EDGE (cliff band, promo,
 *      post-loyalty) cases. We score exact-match agreement, happy vs edge.
 *
 * This measures whether a real model — which reasons rather than curve-fits — recovers
 * the ladder AND whether it does any better than the sim on the hidden edges. Isolation
 * follows exp-01's gen.ts. Run: node dist/llm.js. Env: RE_LLM_MODEL (haiku),
 * RE_LLM_BUDGET (12), RE_LLM_COMPLEXITY (stateful). Exits 0 if the CLI is unavailable.
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
import { buildOracleSpec, OracleSession } from './oracle.js';
import { buildTestSet } from './sim.js';
import { seeded } from './rng.js';
import type { OracleComplexity } from './types.js';

const MODEL = process.env.RE_LLM_MODEL ?? 'claude-haiku-4-5-20251001';
const BUDGET = Number(process.env.RE_LLM_BUDGET ?? 12);
const COMPLEXITY = (process.env.RE_LLM_COMPLEXITY ?? 'stateful') as OracleComplexity;
const SEED = process.env.RE_LLM_SEED ?? 'reveng-llm-v1';
const MAX_QTY = 40;

/** Parse a list of integers from a model reply (probe plan or a single predicted price). */
function parseInts(raw: string): number[] {
  return (stripFences(raw).match(/-?\d+/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
}

async function main(): Promise<void> {
  if (!claudeCliAvailable()) {
    console.warn('claude CLI unavailable — LLM exhibition skipped (sim sweep is the primary artifact)');
    return;
  }
  const gen = new ClaudeCliGen(MODEL);
  const runsDir = join(import.meta.dirname, '..', 'runs');
  mkdirSync(runsDir, { recursive: true });
  const runId = `re-llm-${Date.now().toString(36)}`;
  const traceFile = join(runsDir, `${runId}.jsonl`);
  const trace = new TraceWriter(traceFile, { runId, experiment: '11-reverse-engineer' });
  const bus = new MessageBus({ trace });
  const runtime = new StubRuntime();

  const rand = seeded(SEED);
  const spec = buildOracleSpec(COMPLEXITY, rand);
  const session = new OracleSession(spec);

  bus.publish({
    from: 'oracleA',
    to: '*',
    topic: 'meta',
    body: { mode: 'llm', model: MODEL, complexity: COMPLEXITY, budget: BUDGET, maxQty: MAX_QTY },
  });
  console.log(`run ${runId} | mode=llm model=${MODEL} complexity=${COMPLEXITY} budget=${BUDGET}`);

  await spawnAgent({ id: 'proberB', model: MODEL, systemPrompt: 'Reverse engineer' }, { runtime, trace });

  // --- Phase 1: PROBE ---------------------------------------------------------
  const probeSys =
    'You are reverse-engineering a black-box pricing function. It takes an integer quantity ' +
    `(1..${MAX_QTY}) and returns a price in cents. You have a budget of ${BUDGET} probes. ` +
    'Choose which quantities to test to best recover the pricing rule (watch for tiered ' +
    'per-unit discounts, thresholds, and any nonlinearity). Output ONLY the list of integer ' +
    'quantities to probe, comma-separated.';
  const planRaw = await gen.gen(probeSys, 'List your probe quantities now.');
  const plan = [...new Set(parseInts(planRaw).filter((q) => q >= 1 && q <= MAX_QTY))].slice(0, BUDGET);
  const observed: Array<{ qty: number; price: number }> = [];
  for (const qty of plan) {
    const obs = session.ask({ qty, promo: false });
    observed.push({ qty, price: obs.price });
    bus.publish({ from: 'proberB', to: 'oracleA', topic: 'probe', body: { qty, price: obs.price } });
  }
  console.log(`probed ${observed.length}: ${observed.map((o) => `${o.qty}=${o.price}`).join(' ')}`);

  // --- Phase 2: PREDICT -------------------------------------------------------
  const tests = buildTestSet(spec, seeded(`${SEED}:tests`));
  const table = observed.map((o) => `qty=${o.qty} -> ${o.price}`).join('\n');
  const predictSys =
    'You probed a black-box pricing function and observed these (quantity -> price cents) pairs:\n' +
    `${table}\n\n` +
    'Now predict the price the SAME function returns for each quantity I list. Reply with ONLY ' +
    'lines of the form "qty=price" (one per line), e.g. "15=1596". No prose, no other text.';
  const qtyList = tests.map((t) => t.probe.qty);
  const predRaw = await gen.gen(predictSys, `Quantities (predict a price for each):\n${qtyList.join('\n')}`);
  // Parse "qty=price" pairs; last write wins per qty. Falls back to positional if none parse.
  const byQty = new Map<number, number>();
  for (const line of stripFences(predRaw).split('\n')) {
    const m = /(-?\d+)\s*(?:=|->|:)\s*(-?\d+)/.exec(line);
    if (m && m[1] && m[2]) byQty.set(Number(m[1]), Number(m[2]));
  }
  const positional = byQty.size === 0 ? parseInts(predRaw) : [];
  const predAt = (i: number, qty: number): number | undefined =>
    byQty.size > 0 ? byQty.get(qty) : positional[i];
  const preds = tests.map((t, i) => predAt(i, t.probe.qty));

  let all = 0;
  let happy = 0;
  let happyN = 0;
  let edge = 0;
  let edgeN = 0;
  // Exact match is brutal for a reasoning model that infers a smooth-ish curve; also track
  // "close" (within 5%) so the README can distinguish "recovered the shape but off by the
  // loyalty cut" from "totally lost". The self-poisoning story lives in this gap.
  let happyClose = 0;
  const within5 = (g: number | undefined, truth: number): boolean =>
    g !== undefined && truth > 0 && Math.abs(g - truth) / truth <= 0.05;
  const samples: string[] = [];
  for (let i = 0; i < tests.length; i += 1) {
    const tc = tests[i];
    if (!tc) continue;
    const guess = preds[i];
    const match = guess === tc.truth ? 1 : 0;
    all += match;
    if (tc.kind === 'happy') {
      happy += match;
      happyN += 1;
      if (within5(guess, tc.truth)) happyClose += 1;
      if (samples.length < 6) samples.push(`${tc.probe.qty}: pred=${guess ?? '?'} truth=${tc.truth}`);
    } else {
      edge += match;
      edgeN += 1;
    }
  }
  const round3 = (n: number): number => Math.round(n * 1000) / 1000;
  const agreement = round3(tests.length === 0 ? 0 : all / tests.length);
  const happyAgreement = round3(happyN === 0 ? 0 : happy / happyN);
  const happyCloseAgreement = round3(happyN === 0 ? 0 : happyClose / happyN);
  const edgeAgreement = round3(edgeN === 0 ? 1 : edge / edgeN);
  console.log(`happy samples: ${samples.join(' | ')}`);

  bus.publish({
    from: 'oracleA',
    to: '*',
    topic: 'verdict',
    body: { agreement, happyPathAgreement: happyAgreement, happyPathWithin5pct: happyCloseAgreement, edgeCaseAgreement: edgeAgreement, probesUsed: observed.length },
  });
  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      complexity: COMPLEXITY === 'stateless' ? 0 : COMPLEXITY === 'tiered' ? 1 : 2,
      budget: BUDGET,
      probesUsed: observed.length,
      agreement,
      happyPathAgreement: happyAgreement,
      happyPathWithin5pct: happyCloseAgreement,
      edgeCaseAgreement: edgeAgreement,
      predsReturned: preds.filter((p) => p !== undefined).length,
      testCases: tests.length,
    },
  });
  trace.append({ t: 'kill', ts: Date.now(), agentId: 'proberB' });

  const replayed = await readRunRecord(traceFile);
  console.log(
    `agreement=${agreement} happy=${happyAgreement} happyWithin5%=${happyCloseAgreement} edge=${edgeAgreement} ` +
      `probes=${observed.length} preds=${preds.filter((p) => p !== undefined).length}/${tests.length} | ` +
      `replay verified: ${replayed.events.length} events | trace: ${traceFile}`,
  );
}

await main();
