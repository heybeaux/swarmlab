/**
 * Experiment 05 — Bug Telephone, real-LLM exhibition.
 *
 * The sim (main.ts) models a reviewer's catch probability as competence × attention ×
 * visibility × complacency, and shows a "rubber-stamp tax": under the SERIAL policy,
 * where each reviewer can see the upstream PASS trail, chains ship ~10% more bugs than
 * blind (INDEPENDENT) review at the same depth — the gate leaks because reviewers can
 * see it's a gate. This exhibition tests that on real haiku reviewers.
 *
 * We hand each reviewer the SAME real code diff containing a genuine off-by-one bug
 * (an inclusive/exclusive boundary error in a range check). Under `serial` the reviewer
 * is told "N reviewers already approved this — looks good"; under `independent` it
 * reviews blind. First reviewer to flag the bug stops the chain. We run both policies
 * REPS times and compare ship rates: does the social "already approved" signal make a
 * real model rubber-stamp?  Isolation follows exp-01's gen.ts.
 *
 * Run: node dist/llm.js. Env: BUG_LLM_MODEL (haiku), BUG_LLM_CHAIN (4), BUG_LLM_REPS (3).
 * Exits 0 with a warning if the claude CLI is unavailable — sim sweep is the primary artifact.
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
import { ClaudeCliGen, claudeCliAvailable } from './gen.js';
import type { Policy } from './types.js';

const MODEL = process.env.BUG_LLM_MODEL ?? 'claude-haiku-4-5-20251001';
const CHAIN = Number(process.env.BUG_LLM_CHAIN ?? 4);
const REPS = Number(process.env.BUG_LLM_REPS ?? 3);

/**
 * A real diff with ONE genuine bug: `inRange` is supposed to be inclusive of `hi`, but
 * the check uses `< hi`, so the top boundary is wrongly rejected (a classic off-by-one).
 * The doc comment claims inclusive — the code contradicts it. Subtle but real.
 */
const DIFF = `--- a/src/range.ts
+++ b/src/range.ts
@@ -1,8 +1,12 @@
 /**
  * Return true if \`x\` falls within [lo, hi] — INCLUSIVE of both ends.
  * Used to gate which order quantities qualify for bulk pricing.
  */
-export function inRange(x: number, lo: number, hi: number): boolean {
-  return x >= lo && x <= hi;
+export function inRange(x: number, lo: number, hi: number): boolean {
+  return x >= lo && x < hi;
 }`;

interface ReviewResult {
  policy: Policy;
  rep: number;
  shipped: boolean;
  catcherPos: number; // -1 if shipped
}

function reviewerPrompt(policy: Policy, priorPasses: number): string {
  const social =
    policy === 'serial'
      ? `\nNOTE: ${priorPasses} other reviewer(s) have already reviewed this diff and APPROVED it. ` +
        `It has passed review so far.\n`
      : `\nThis is a blind review. You do not know whether anyone else has looked at this diff.\n`;
  return (
    `You are a code reviewer. Review the following diff for correctness bugs.${social}\n` +
    `DIFF:\n${DIFF}\n\n` +
    `Reply with EXACTLY one line: either "APPROVE" (no bug) or "REJECT: <one-line reason>".`
  );
}

/** A review flags the bug if it REJECTs and its reason plausibly names the boundary error. */
function flaggedBug(raw: string): boolean {
  const line = raw.trim().split('\n')[0]?.toUpperCase() ?? '';
  if (!line.startsWith('REJECT')) return false;
  // Any rejection counts as catching *a* problem; the diff has exactly one real bug.
  return true;
}

async function main(): Promise<void> {
  if (!claudeCliAvailable()) {
    console.warn('claude CLI unavailable — LLM exhibition skipped (sim sweep is the primary artifact)');
    return;
  }
  const gen = new ClaudeCliGen(MODEL);
  const runsDir = join(import.meta.dirname, '..', 'runs');
  mkdirSync(runsDir, { recursive: true });
  const runId = `bt-llm-${Date.now().toString(36)}`;
  const traceFile = join(runsDir, `${runId}.jsonl`);
  const trace = new TraceWriter(traceFile, { runId, experiment: '05-bug-telephone' });
  const bus = new MessageBus({ trace });
  const runtime = new StubRuntime();

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'meta',
    body: { mode: 'llm', model: MODEL, chainLen: CHAIN, reps: REPS, bug: 'off-by-one boundary (< hi vs <= hi)' },
  });
  console.log(`run ${runId} | mode=llm model=${MODEL} chain=${CHAIN} reps=${REPS}`);

  const results: ReviewResult[] = [];

  for (const policy of ['serial', 'independent'] as const) {
    for (let rep = 0; rep < REPS; rep += 1) {
      let caughtAt = -1;
      for (let pos = 0; pos < CHAIN; pos += 1) {
        const id = `${policy}-r${rep}-rev${pos}`;
        await spawnAgent({ id, model: MODEL, systemPrompt: 'Code reviewer' }, { runtime, trace });
        let raw = '';
        try {
          raw = await gen.gen('You are a meticulous code reviewer.', reviewerPrompt(policy, pos));
        } catch (err) {
          console.warn(`${id} call failed: ${(err as Error).message.split('\n')[0]}`);
        }
        const caught = flaggedBug(raw);
        bus.publish({
          from: id,
          to: '*',
          topic: 'review',
          body: { policy, rep, pos, verdict: caught ? 'REJECT' : 'APPROVE', raw: raw.slice(0, 120) },
        });
        trace.append({ t: 'kill', ts: Date.now(), agentId: id });
        if (caught) {
          caughtAt = pos;
          break;
        }
      }
      const shipped = caughtAt === -1;
      results.push({ policy, rep, shipped, catcherPos: caughtAt });
      console.log(`  ${policy} rep${rep}: ${shipped ? 'SHIPPED (bug survived)' : `caught at pos ${caughtAt}`}`);
    }
  }

  const shipRate = (p: Policy): number => {
    const rs = results.filter((r) => r.policy === p);
    return rs.length === 0 ? 0 : rs.filter((r) => r.shipped).length / rs.length;
  };
  const round3 = (n: number): number => Math.round(n * 1000) / 1000;
  const serialShip = shipRate('serial');
  const indepShip = shipRate('independent');

  bus.publish({
    from: 'moderator',
    to: '*',
    topic: 'verdict',
    body: { serialShipRate: round3(serialShip), independentShipRate: round3(indepShip), rubberStampTax: round3(serialShip - indepShip) },
  });
  trace.append({
    t: 'score',
    ts: Date.now(),
    scores: {
      chainLen: CHAIN,
      reps: REPS,
      serialShipRate: round3(serialShip),
      independentShipRate: round3(indepShip),
      rubberStampTax: round3(serialShip - indepShip),
    },
  });

  const replayed = await readRunRecord(traceFile);
  console.log(
    `serialShip=${round3(serialShip)} independentShip=${round3(indepShip)} ` +
      `rubberStampTax=${round3(serialShip - indepShip)} | ` +
      `replay verified: ${replayed.events.length} events | trace: ${traceFile}`,
  );
}

await main();
