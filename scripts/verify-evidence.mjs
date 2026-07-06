#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { replay } from '@swarmlab/core';

const ROOT = process.cwd();
const CLAIMS_PATH = resolve(ROOT, 'CLAIMS.json');
const VALID_STATUSES = new Set(['verified', 'in_sample', 'exhibition_only', 'needs_holdout']);
const REQUIRED_FIELDS = [
  'id',
  'claim',
  'experiment',
  'spec',
  'runIds',
  'tracePaths',
  'scoreFields',
  'expectedValues',
  'reproductionCommand',
  'stackRecommendation',
  'stackReposAndPRs',
  'evidenceStatus',
  'notes',
];

function fail(message) {
  throw new Error(message);
}

function loadClaims() {
  if (!existsSync(CLAIMS_PATH)) fail('Missing CLAIMS.json');
  const parsed = JSON.parse(readFileSync(CLAIMS_PATH, 'utf8'));
  if (!Array.isArray(parsed)) fail('CLAIMS.json must contain an array');
  return parsed;
}

function validateClaimShape(claim, index) {
  const label = claim && typeof claim === 'object' && typeof claim.id === 'string' ? claim.id : `claim[${index}]`;
  if (typeof claim !== 'object' || claim === null || Array.isArray(claim)) fail(`${label}: claim entry must be an object`);
  for (const field of REQUIRED_FIELDS) {
    if (!(field in claim)) fail(`${label}: missing required field ${field}`);
  }
  if (!VALID_STATUSES.has(claim.evidenceStatus)) fail(`${label}: invalid evidenceStatus ${claim.evidenceStatus}`);
  if (!Array.isArray(claim.runIds) || claim.runIds.length === 0) fail(`${label}: runIds must be a non-empty array`);
  if (!Array.isArray(claim.tracePaths)) fail(`${label}: tracePaths must be an array`);
  if (!Array.isArray(claim.scoreFields)) fail(`${label}: scoreFields must be an array`);
  if (typeof claim.expectedValues !== 'object' || claim.expectedValues === null || Array.isArray(claim.expectedValues)) {
    fail(`${label}: expectedValues must be an object`);
  }
  if (!Array.isArray(claim.stackReposAndPRs)) fail(`${label}: stackReposAndPRs must be an array`);
  if (claim.evidenceStatus === 'verified' && claim.tracePaths.length === 0) fail(`${label}: verified claim has no tracePaths`);
  if (claim.evidenceStatus === 'verified' && Object.keys(claim.expectedValues).length === 0) {
    fail(`${label}: verified claim has no expectedValues`);
  }
  for (const scoreField of claim.scoreFields) {
    if (!(scoreField in claim.expectedValues)) fail(`${label}: scoreField ${scoreField} has no expectedValues entry`);
  }
}

async function replayTrace(tracePath) {
  const abs = resolve(ROOT, tracePath);
  if (!existsSync(abs)) fail(`Missing trace path: ${tracePath}`);
  const events = [];
  for await (const event of replay(abs)) events.push(event);
  if (events.length === 0) fail(`Trace has no events: ${tracePath}`);
  const scores = events.filter((event) => event.t === 'score');
  if (scores.length === 0) fail(`Trace has no score events: ${tracePath}`);
  return { events, scores };
}

function parseAssertionKey(key) {
  const hashIndex = key.indexOf('#');
  if (hashIndex === -1) fail(`Assertion key missing '#': ${key}`);
  const tracePath = key.slice(0, hashIndex);
  const selectorAndField = key.slice(hashIndex + 1);
  const dotIndex = selectorAndField.indexOf('.');
  if (dotIndex === -1) fail(`Assertion key missing selector.field: ${key}`);
  const selector = selectorAndField.slice(0, dotIndex);
  const field = selectorAndField.slice(dotIndex + 1);
  if (!field) fail(`Assertion key missing score field: ${key}`);
  return { tracePath, selector, field };
}

function scoreEventForSelector(scores, selector, key) {
  if (selector === 'last') return scores[scores.length - 1];
  if (selector === 'first') return scores[0];
  const match = selector.match(/^score\[(\d+)\]$/);
  if (match) {
    const index = Number(match[1]);
    const event = scores[index];
    if (!event) fail(`${key}: score index ${index} out of range (${scores.length} score events)`);
    return event;
  }
  fail(`${key}: unsupported score selector ${selector}`);
}

function expectedValue(spec, key) {
  if (typeof spec === 'number') return { expected: spec, tolerance: 0 };
  if (typeof spec === 'object' && spec !== null && !Array.isArray(spec)) {
    const expected = 'equals' in spec ? spec.equals : spec.value;
    const tolerance = 'tolerance' in spec ? spec.tolerance : 0;
    if (typeof expected !== 'number') fail(`${key}: expected value must be numeric`);
    if (typeof tolerance !== 'number' || tolerance < 0) fail(`${key}: tolerance must be a non-negative number`);
    return { expected, tolerance };
  }
  fail(`${key}: expectedValues entry must be a number or object`);
}

function assertScore(cache, key, spec) {
  const { tracePath, selector, field } = parseAssertionKey(key);
  const trace = cache.get(tracePath);
  if (!trace) fail(`${key}: trace was not declared in tracePaths`);
  const scoreEvent = scoreEventForSelector(trace.scores, selector, key);
  const actual = scoreEvent.scores[field];
  if (typeof actual !== 'number') fail(`${key}: score field ${field} missing or non-numeric`);
  const { expected, tolerance } = expectedValue(spec, key);
  const delta = Math.abs(actual - expected);
  if (delta > tolerance) {
    fail(`${key}: expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

const claims = loadClaims();
const seenIds = new Set();
const statusCounts = new Map();
let assertionCount = 0;
const traceCache = new Map();

for (let i = 0; i < claims.length; i += 1) {
  const claim = claims[i];
  validateClaimShape(claim, i);
  if (seenIds.has(claim.id)) fail(`Duplicate claim id ${claim.id}`);
  seenIds.add(claim.id);
  statusCounts.set(claim.evidenceStatus, (statusCounts.get(claim.evidenceStatus) ?? 0) + 1);

  for (const tracePath of claim.tracePaths) {
    if (!traceCache.has(tracePath)) traceCache.set(tracePath, await replayTrace(tracePath));
  }

  for (const [key, spec] of Object.entries(claim.expectedValues)) {
    assertScore(traceCache, key, spec);
    assertionCount += 1;
  }
}

const statusSummary = [...statusCounts.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([status, count]) => `${status}=${count}`)
  .join(', ');

console.log(`verify:evidence ok — claims=${claims.length}, traces=${traceCache.size}, assertions=${assertionCount}, ${statusSummary}`);
