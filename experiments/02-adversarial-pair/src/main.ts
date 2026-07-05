import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MessageBus,
  TraceWriter,
  replay,
  runScorer,
  spawnAgent,
  StubRuntime,
  type Scorer,
  type TraceEvent,
} from '@swarmlab/core';
import {
  ORACLE_RULES,
  makeTest,
  runSuite,
  type TestCase,
} from './oracle.js';
import { initialCode, toClassifier, toSource, cloneCode, type CodeModel } from './code.js';
import { churn, ConvergenceTracker } from './metrics.js';
import { SimAgents } from './sim.js';
import { ClaudeAgents, claudeCliAvailable } from './gen.js';
import type { PairAgents } from './agents.js';

// --- configuration ---------------------------------------------------------

const ROUNDS = Number(process.env.PAIR_ROUNDS ?? 20);
const POISON_RATE = Number(process.env.PAIR_POISON ?? 0);
const SEED = process.env.PAIR_SEED ?? 'adversarial-pair-v1';

const requestedMode = process.env.PAIR_MODE ?? 'llm';
const agents: PairAgents =
  requestedMode === 'llm' && claudeCliAvailable()
    ? new ClaudeAgents()
    : new SimAgents(SEED, POISON_RATE);
if (requestedMode === 'llm' && agents.mode === 'sim') {
  console.warn('claude CLI unavailable — falling back to deterministic sim mode');
}

const CODER_PROMPT =
  '[role:coder] You own solution.ts. Each turn you rewrite classify(n) as an ordered ' +
  'rule list so that every accumulated test passes. You never see the oracle — only the ' +
  'tests. Later matching rule wins.';
const BREAKER_PROMPT =
  '[role:breaker] You own tests.ts. Each turn you probe the current classify(n) for one ' +
  'input where its output is wrong and file a single failing test to pin that bug. You ' +
  'see the code but not the oracle behind it.';

// --- setup ------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `ap-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);

const trace = new TraceWriter(traceFile, { runId, experiment: '02-adversarial-pair' });
const bus = new MessageBus({ trace });
// Both agents are spawned through core for real spawn/kill + AgentSpec records.
// The game logic runs through the PairAgents seam; StubRuntime just acks spawns.
const runtime = new StubRuntime();

bus.publish({
  from: 'orchestrator',
  to: '*',
  topic: 'meta',
  body: {
    mode: agents.mode,
    model: agents.model,
    rounds: ROUNDS,
    poisonRate: POISON_RATE,
    seed: SEED,
    oracle: ORACLE_RULES,
  },
});

const coder = await spawnAgent({ id: 'coder', systemPrompt: CODER_PROMPT }, { runtime, trace });
const breaker = await spawnAgent(
  { id: 'breaker', systemPrompt: BREAKER_PROMPT },
  { runtime, trace },
);

// --- the adversarial line ----------------------------------------------------

console.log(
  `run ${runId} | mode=${agents.mode} model=${agents.model} rounds=${ROUNDS} poison=${POISON_RATE}`,
);

let code: CodeModel = initialCode();
let prevSource = toSource(code);
const suite: TestCase[] = [];
let poisonedTests = 0;
const convergence = new ConvergenceTracker();
let convergedAt = -1;

for (let r = 0; r < ROUNDS; r += 1) {
  // 1. Coder publishes its current implementation to the breaker.
  const codeSource = toSource(code);
  bus.publish({ from: 'coder', to: 'breaker', topic: 'code', body: { round: r, text: codeSource } });

  // 2. Breaker probes the live code and files one new test (or gives up).
  const move = await agents.breakerMove(cloneCode(code), suite);
  let killed = false;
  let poisoned = false;
  if (move) {
    const test = makeTest(move.input, move.expected);
    poisoned = test.poisoned;
    // Did this test actually catch the current code? (real execution)
    const before = runSuite(toClassifier(code), [test]);
    killed = before.fail > 0;
    suite.push(test);
    if (poisoned) poisonedTests += 1;
    bus.publish({
      from: 'breaker',
      to: 'coder',
      topic: 'test',
      body: { round: r, input: test.input, expected: test.expected, poisoned, killed },
    });
  } else {
    // Breaker gave up: no new test. Still record the (empty) move for the trace.
    bus.publish({
      from: 'breaker',
      to: 'coder',
      topic: 'test',
      body: { round: r, input: null, expected: null, poisoned: false, killed: false, gaveUp: true },
    });
  }

  // 3. Coder repairs against the FULL executed suite.
  code = await agents.coderMove(cloneCode(code), suite);

  // 4. Harness executes the whole suite against the repaired code — real result.
  const result = runSuite(toClassifier(code), suite);
  const nextSource = toSource(code);
  const roundChurn = churn(prevSource, nextSource);
  prevSource = nextSource;

  const oracleConsistent = poisonedTests === 0 ? 1 : 0;
  const converged = convergence.update(result.passRate, roundChurn);
  if (converged && convergedAt < 0) convergedAt = r;

  const scores: Record<string, number> = {
    round: r,
    tests: result.tests,
    pass: result.pass,
    fail: result.fail,
    passRate: round3(result.passRate),
    poisonedTests,
    oracleConsistent,
    churn: roundChurn,
    converged,
  };
  trace.append({ t: 'score', ts: Date.now(), agentId: 'coder', scores });
  console.log(
    `round ${String(r).padStart(2)} | tests=${result.tests} pass=${result.pass} ` +
      `rate=${round3(result.passRate)} poison=${poisonedTests} churn=${roundChurn} ` +
      `conv=${converged}${move ? '' : ' [breaker gave up]'}`,
  );
}

// Final code so the full text is in the trace.
bus.publish({
  from: 'coder',
  to: 'breaker',
  topic: 'code',
  body: { round: ROUNDS, text: toSource(code) },
});

// --- summary scoring via core's Scorer seam ----------------------------------

const summaryScorer: Scorer = {
  score(run) {
    const rounds = run.events.filter(
      (e): e is Extract<TraceEvent, { t: 'score' }> => e.t === 'score' && e.agentId === 'coder',
    );
    const last = rounds[rounds.length - 1]?.scores;
    const everConverged = rounds.some((e) => e.scores.converged === 1) ? 1 : 0;
    const meanChurn =
      rounds.length === 0
        ? 0
        : rounds.reduce((s, e) => s + (e.scores.churn ?? 0), 0) / rounds.length;
    return {
      rounds: rounds.length,
      finalPassRate: last?.passRate ?? 0,
      finalTests: last?.tests ?? 0,
      poisonedTests: last?.poisonedTests ?? 0,
      oracleConsistent: last?.oracleConsistent ?? 0,
      everConverged,
      convergedAtRound: convergedAt,
      meanChurn: round3(meanChurn),
    };
  },
};
const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));

for (const agent of [coder, breaker]) {
  await agent.kill();
  bus.removeAgent(agent.id);
}
trace.close();

// --- replay verification ------------------------------------------------------

const counts = { spawn: 0, kill: 0, score: 0, code: 0, test: 0, meta: 0 };
for await (const event of replay(traceFile)) {
  if (event.t === 'spawn' || event.t === 'kill' || event.t === 'score') counts[event.t] += 1;
  else if (event.topic === 'code' || event.topic === 'test' || event.topic === 'meta') {
    counts[event.topic] += 1;
  }
}
console.log('replay counts:', counts);
if (
  counts.spawn !== 2 ||
  counts.kill !== 2 ||
  counts.meta !== 1 ||
  counts.code !== ROUNDS + 1 ||
  counts.test !== ROUNDS ||
  counts.score !== ROUNDS + 1
) {
  throw new Error('adversarial-pair FAILED: unexpected replay event counts');
}
console.log(`adversarial-pair OK ✅  trace: ${traceFile}`);

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
