#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

const seeds = [
  'trust-routing-holdout-v1',
  'trust-routing-holdout-v2',
  'trust-routing-holdout-v3',
  'trust-routing-holdout-v4',
  'trust-routing-holdout-v5',
];

const thresholds = {
  maxLateIncapableSelectionRate: 0.05,
  maxCapableExcludedRate: 0.02,
  maxIncapableLeakRate: 0,
  // Avoidance only has a meaningful denominator once the new root has
  // evidence about the incapable worker. Unseen workers are exploration,
  // not evidence-forgetting; score those separately via evidence coverage.
  minEvidenceConditionedTransferAvoidRate: 1,
  minTransferEvidenceRate: 0.98,
};

const rows = [];
let failed = false;
let provenance = null;

for (const seed of seeds) {
  const run = spawnSync(
    process.execPath,
    ['experiments/15-trust-forgiveness/dist/main.js'],
    {
      cwd: process.cwd(),
      env: { ...process.env, FORGIVE_SEED: seed, FORGIVE_TRIALS: '50' },
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (run.status !== 0) {
    process.stderr.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    console.error(`RT-06 holdout ${seed}: experiment exited ${run.status}`);
    process.exit(run.status ?? 1);
  }

  const summaryLine = run.stdout
    .split('\n')
    .find((line) => line.startsWith('summary: '));
  const traceLine = run.stdout
    .split('\n')
    .find((line) => line.startsWith('trace: '));
  const provenanceLine = run.stdout
    .split('\n')
    .find((line) => line.startsWith('provenance: '));
  if (!summaryLine || !traceLine || !provenanceLine) {
    console.error(`RT-06 holdout ${seed}: missing summary, trace, or provenance output`);
    process.exit(1);
  }

  const scores = JSON.parse(summaryLine.slice('summary: '.length));
  provenance ??= JSON.parse(provenanceLine.slice('provenance: '.length));
  const tracePath = traceLine.slice('trace: '.length);
  const checks = {
    loudLate: scores.evLoudLate <= thresholds.maxLateIncapableSelectionRate,
    confidentWrongLate: scores.evCWLate <= thresholds.maxLateIncapableSelectionRate,
    loudCapableExcluded: scores.evLoudCapEx <= thresholds.maxCapableExcludedRate,
    confidentWrongCapableExcluded: scores.evCWCapEx <= thresholds.maxCapableExcludedRate,
    loudLeaks: scores.evLoudLeaks <= thresholds.maxIncapableLeakRate,
    confidentWrongLeaks: scores.evCWLeaks <= thresholds.maxIncapableLeakRate,
    loudTransferWhenKnown: scores.evLoudTransfer >= thresholds.minEvidenceConditionedTransferAvoidRate,
    confidentWrongTransferWhenKnown:
      scores.evCWTransfer >= thresholds.minEvidenceConditionedTransferAvoidRate,
    loudTransferEvidence: scores.evLoudTransferEvidence >= thresholds.minTransferEvidenceRate,
    confidentWrongTransferEvidence:
      scores.evCWTransferEvidence >= thresholds.minTransferEvidenceRate,
  };
  const passed = Object.values(checks).every(Boolean);
  failed ||= !passed;
  rows.push({
    seed,
    passed,
    runId: basename(tracePath, '.jsonl'),
    trace: tracePath,
    provenance,
    scores: {
      evLoudLate: scores.evLoudLate,
      evCWLate: scores.evCWLate,
      evLoudCapEx: scores.evLoudCapEx,
      evCWCapEx: scores.evCWCapEx,
      evLoudLeaks: scores.evLoudLeaks,
      evCWLeaks: scores.evCWLeaks,
      evLoudTransfer: scores.evLoudTransfer,
      evCWTransfer: scores.evCWTransfer,
      evLoudTransferEvidence: scores.evLoudTransferEvidence,
      evCWTransferEvidence: scores.evCWTransferEvidence,
    },
    checks,
  });
console.log(
    `${passed ? 'PASS' : 'FAIL'} ${seed}: late=${scores.evLoudLate}/${scores.evCWLate} ` +
      `capEx=${scores.evLoudCapEx}/${scores.evCWCapEx} ` +
      `leaks=${scores.evLoudLeaks}/${scores.evCWLeaks} ` +
      `transferWhenKnown=${scores.evLoudTransfer}/${scores.evCWTransfer} ` +
      `evidence=${scores.evLoudTransferEvidence}/${scores.evCWTransferEvidence} ` +
      `pkg=${provenance.packageName}@${provenance.commit}`,
  );
}

console.log(JSON.stringify({ status: failed ? 'failed' : 'passed', thresholds, provenance, runs: rows }, null, 2));
if (failed) process.exit(1);
