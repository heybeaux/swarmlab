/**
 * Experiment 03 — Prompt Darwinism.
 *
 * Evolve a population of system prompts (genomes) against a hidden category task.
 * Each generation: spawn N agents through core/, run each genome to produce a
 * word list, HARNESS-GRADE every list (task.ts) into a fitness (fitness.ts),
 * record every spawn/message/score/kill through core so it traces + replays,
 * then breed the winners into the next generation (evolve.ts).
 *
 * Config (env):
 *   DARWIN_MODE=llm|sim   (default llm; falls back to sim if claude CLI absent)
 *   DARWIN_POP=8          population size
 *   DARWIN_GENS=6         generations
 *   DARWIN_ELITE=2        elitism (top-k survive unchanged)
 *   DARWIN_DECEPTION=0    0..1: how much fitness rewards the length proxy vs true F1
 *   DARWIN_SEED=...       RNG seed (reproducible)
 */
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
import { DEFAULT_TASK, grade, round3 } from './task.js';
import { buildGenePool, composition, renderPrompt, type Genome } from './genome.js';
import { fnv1a, mulberry32 } from './rng.js';
import {
  diversity,
  nextGeneration,
  seedPopulation,
  type Scored,
} from './evolve.js';
import { computeFitness } from './fitness.js';
import { SimExecutor } from './sim.js';
import { ClaudeExecutor, claudeCliAvailable } from './gen.js';
import type { Executor } from './executor.js';

// --- config -----------------------------------------------------------------

const POP = Number(process.env.DARWIN_POP ?? 8);
const GENS = Number(process.env.DARWIN_GENS ?? 6);
const ELITE = Number(process.env.DARWIN_ELITE ?? 2);
const DECEPTION = Number(process.env.DARWIN_DECEPTION ?? 0);
const SEED = process.env.DARWIN_SEED ?? 'prompt-darwinism-v1';
const requestedMode = process.env.DARWIN_MODE ?? 'llm';

const task = DEFAULT_TASK;
const pool = buildGenePool([...task.target], task.distractors);

const executor: Executor =
  requestedMode === 'llm' && claudeCliAvailable()
    ? new ClaudeExecutor()
    : new SimExecutor(SEED, task);
if (requestedMode === 'llm' && executor.mode === 'sim') {
  console.warn('claude CLI unavailable — falling back to deterministic sim mode');
}

const rand = mulberry32(fnv1a(SEED));

// --- setup ------------------------------------------------------------------

const runsDir = join(import.meta.dirname, '..', 'runs');
mkdirSync(runsDir, { recursive: true });
const runId = `pd-${Date.now().toString(36)}`;
const traceFile = join(runsDir, `${runId}.jsonl`);
const trace = new TraceWriter(traceFile, { runId, experiment: '03-prompt-darwinism' });
const bus = new MessageBus({ trace });
const runtime = new StubRuntime();

bus.publish({
  from: 'breeder',
  to: '*',
  topic: 'meta',
  body: {
    mode: executor.mode,
    model: executor.model,
    pop: POP,
    gens: GENS,
    elite: ELITE,
    deception: DECEPTION,
    seed: SEED,
    task: task.id,
  },
});

console.log(
  `run ${runId} | mode=${executor.mode} model=${executor.model} pop=${POP} gens=${GENS} ` +
    `elite=${ELITE} deception=${DECEPTION}`,
);

// --- the evolutionary line ---------------------------------------------------

let population: Genome[] = seedPopulation(rand, pool, POP, 0);
let bestEverF1 = 0;
let bestEverGenome: Genome | null = null;

for (let g = 0; g < GENS; g += 1) {
  const scored: Scored[] = [];

  for (const genome of population) {
    // Spawn each population member through core for a real spawn/kill record.
    const agent = await spawnAgent(
      { id: genome.id, systemPrompt: renderPrompt(genome), context: { gen: g } },
      { runtime, trace },
    );

    // Phenotype: genome → raw word list. The agent produces; it does not score.
    const output = await executor.run(genome);
    bus.publish({
      from: genome.id,
      to: 'breeder',
      topic: 'output',
      body: { gen: g, directives: genome.directives.map((d) => d.token), output },
    });

    // HARNESS grades the artifact. Fitness is arithmetic, never a model's claim.
    const gr = grade(output, task);
    const fit = computeFitness(genome, gr, DECEPTION);
    const comp = composition(genome);
    scored.push({ genome, fitness: fit.value, detail: { trueF1: fit.trueF1, proxy: fit.proxy } });

    trace.append({
      t: 'score',
      ts: Date.now(),
      agentId: genome.id,
      scores: {
        gen: g,
        fitness: fit.value,
        trueF1: fit.trueF1,
        proxy: fit.proxy,
        hits: gr.hits,
        misses: gr.misses,
        size: gr.size,
        precision: round3(gr.precision),
        recall: round3(gr.recall),
        themeGenes: comp.theme,
        distractGenes: comp.distract,
        metaGenes: comp.meta,
        len: genome.directives.length,
      },
    });

    if (fit.trueF1 > bestEverF1) {
      bestEverF1 = fit.trueF1;
      bestEverGenome = genome;
    }

    await agent.kill();
    bus.removeAgent(agent.id);
  }

  // Generation-level rollup — harness-computed aggregates over this gen.
  const ranked = [...scored].sort((a, b) => b.fitness - a.fitness);
  const best = ranked[0];
  const meanFitness = mean(scored.map((s) => s.fitness));
  const meanTrueF1 = mean(scored.map((s) => s.detail.trueF1 ?? 0));
  const div = diversity(population);
  const themeShare =
    mean(population.map((gm) => composition(gm).theme)) /
    Math.max(1, mean(population.map((gm) => gm.directives.length)));

  const genScores: Record<string, number> = {
    gen: g,
    bestFitness: best?.fitness ?? 0,
    bestTrueF1: best?.detail.trueF1 ?? 0,
    meanFitness: round3(meanFitness),
    meanTrueF1: round3(meanTrueF1),
    diversity: round3(div),
    themeShare: round3(themeShare),
  };
  trace.append({ t: 'score', ts: Date.now(), scores: genScores });
  bus.publish({ from: 'breeder', to: '*', topic: 'generation', body: genScores });
  console.log(
    `gen ${String(g).padStart(2)} | bestFit=${best?.fitness ?? 0} ` +
      `bestF1=${best?.detail.trueF1 ?? 0} meanFit=${round3(meanFitness)} ` +
      `meanF1=${round3(meanTrueF1)} div=${round3(div)} themeShare=${round3(themeShare)}`,
  );

  // Breed the winners into the next generation (unless this was the last gen).
  if (g < GENS - 1) {
    population = nextGeneration(rand, pool, scored, { size: POP, eliteK: ELITE, gen: g + 1 });
  }
}

// --- summary via core's Scorer seam ------------------------------------------

const summaryScorer: Scorer = {
  score(run) {
    const gens = run.events.filter(
      (e): e is Extract<TraceEvent, { t: 'score' }> =>
        e.t === 'score' && e.agentId === undefined,
    );
    const first = gens[0]?.scores;
    const last = gens[gens.length - 1]?.scores;
    const climbedF1 = (last?.bestTrueF1 ?? 0) - (first?.bestTrueF1 ?? 0);
    const collapsed = (last?.diversity ?? 1) < 0.34 ? 1 : 0;
    // Goodhart divergence: the population is still being *rewarded* (reported
    // best fitness high) while TRUE quality has stagnated or fallen below where
    // it started. The gap between what selection optimizes and what we actually
    // want is the whole ACR/AWM lesson — detect it by that gap, not by climb.
    const fitDelta = (last?.bestFitness ?? 0) - (first?.bestTrueF1 ?? 0);
    const goodhart = fitDelta > 0.15 && climbedF1 <= 0.01 ? 1 : 0;
    return {
      generations: gens.length,
      firstBestF1: first?.bestTrueF1 ?? 0,
      finalBestF1: last?.bestTrueF1 ?? 0,
      f1Climb: round3(climbedF1),
      finalReportedFitness: last?.bestFitness ?? 0,
      finalDiversity: last?.diversity ?? 0,
      converged: collapsed,
      goodhartDivergence: goodhart,
      bestEverF1: round3(bestEverF1),
    };
  },
};
const summary = runScorer(summaryScorer, trace.toRunRecord());
trace.append({ t: 'score', ts: Date.now(), scores: summary });
console.log('summary:', JSON.stringify(summary));
if (bestEverGenome) {
  console.log('best genome:', bestEverGenome.directives.map((d) => d.token).join(', ') || '(empty)');
}

trace.close();

// --- replay verification -----------------------------------------------------

const counts = { spawn: 0, kill: 0, score: 0, meta: 0, output: 0, generation: 0 };
for await (const event of replay(traceFile)) {
  if (event.t === 'spawn' || event.t === 'kill' || event.t === 'score') counts[event.t] += 1;
  else if (
    event.topic === 'meta' ||
    event.topic === 'output' ||
    event.topic === 'generation'
  ) {
    counts[event.topic] += 1;
  }
}
console.log('replay counts:', counts);
const expectedSpawns = POP * GENS;
const expectedScores = POP * GENS + GENS + 1; // per-agent + per-gen + summary
if (
  counts.spawn !== expectedSpawns ||
  counts.kill !== expectedSpawns ||
  counts.meta !== 1 ||
  counts.output !== expectedSpawns ||
  counts.generation !== GENS ||
  counts.score !== expectedScores
) {
  throw new Error('prompt-darwinism FAILED: unexpected replay event counts');
}
console.log(`prompt-darwinism OK ✅  trace: ${traceFile}`);

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
