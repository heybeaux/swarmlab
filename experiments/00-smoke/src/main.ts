import { mkdirSync, readFileSync } from 'node:fs';
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

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const traceFile = join(runsDir, 'smoke.jsonl');

const trace = new TraceWriter(traceFile, { runId: 'smoke-001', experiment: '00-smoke' });
const bus = new MessageBus({ trace });

function wireToBus(handle: AgentHandle): void {
  bus.subscribe(handle.id, '*', (msg) => {
    void handle.send(msg.body);
  });
}

const alice = await spawnAgent(
  { id: 'alice', systemPrompt: 'You are alice. Greet bob.' },
  { trace },
);
const bob = await spawnAgent(
  { id: 'bob', systemPrompt: 'You are bob. Listen for greetings.' },
  { trace },
);
wireToBus(alice);
wireToBus(bob);

const bobGotIt = new Promise<unknown>((resolve) => {
  const off = bob.onMessage((msg) => {
    off();
    resolve(msg);
  });
});

bus.publish({ from: 'alice', to: 'bob', topic: 'greeting', body: { text: 'hello bob' } });
const received = await bobGotIt;
console.log('bob received:', JSON.stringify(received));

const messageCountScorer: Scorer = {
  score(run) {
    const messages = run.events.filter((e) => e.t === 'message').length;
    return { messages, delivered: messages > 0 ? 1 : 0 };
  },
};
const scores = runScorer(messageCountScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores });

await alice.kill();
await bob.kill();
bus.removeAgent('alice');
bus.removeAgent('bob');
trace.close();

console.log('\n--- raw trace file ---');
console.log(readFileSync(traceFile, 'utf8').trimEnd());

console.log('\n--- replay() ---');
const replayed: TraceEvent[] = [];
for await (const event of replay(traceFile)) {
  replayed.push(event);
  console.log(`${event.t.padEnd(7)} ${JSON.stringify(event)}`);
}

const counts = { spawn: 0, message: 0, score: 0, kill: 0 };
for (const e of replayed) counts[e.t] += 1;
console.log('\nreplay counts:', counts);

if (counts.spawn !== 2 || counts.message !== 1 || counts.score !== 1 || counts.kill !== 2) {
  throw new Error('smoke FAILED: unexpected event counts');
}
console.log('smoke OK ✅');
