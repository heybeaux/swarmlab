import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const candidateRuntimeSha = 'bc879d6c7fd213b49ef355b64bd83196098ffa0e';
const baselineSha = '4be84ed4aab018bee1b9a77b6012b9b97c966d1c';
const frozenHarness = 'sha256:5acc408f7c473e0ee849f015fd4609c41c2275e10dcba15c5960a5e68cff660b';
const frozenPlan = 'sha256:11541dc2489bd3c73b204b908e09b256578bca6e029a95a653be3584fd7aa4b8';
const keys = ['aegisUnsafeCoverageLossRate','aegisCoverageRejectionRate','aegisResolutionAccuracy','pinnedBaseControlAccuracy','aegisControlAccuracy','aegisInputOwnership','protectedBaseFixtureAccuracy','explicitConsentAccuracy'];
const sha = v => `sha256:${createHash('sha256').update(v).digest('hex')}`;
const hex = v => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v);
const verdict = metrics => keys.every(k => metrics[k] === (k === 'aegisUnsafeCoverageLossRate' ? 0 : 1));
const sameKeys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort());

/** Recompute facts from the complete serialized rows; no policy or LLM evaluator. */
export function verifyReceipt(receipt, bytes, source) {
  assert(receipt && typeof receipt === 'object', 'receipt required');
  assert.equal(sha(bytes), receipt.traceSha256);
  const events = bytes.toString().trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.length, 37); assert.equal(receipt.events, 37);
  assert(events.every(e => ['message','score'].includes(e.t) && Number.isFinite(e.ts)));
  const metadata = events.filter(e => e.t === 'message' && e.topic === 'meta');
  assert.equal(metadata.length, 1);
  const meta = metadata[0].body;
  assert.equal(meta.experiment, '63-rule-overlay-coverage-consent');
  assert.equal(meta.runId, receipt.runId);
  assert.equal(receipt.seed, 'overlay-coverage-consent-v1'); assert.equal(meta.seed, receipt.seed);
  assert.equal(meta.holdout, 'reserved-unused-no-tuning');
  assert.equal(sha(source), frozenHarness); assert.equal(receipt.harnessSha256, frozenHarness); assert.equal(meta.harnessSha256, frozenHarness);
  assert.equal(sha(JSON.stringify(meta.scenarios)), frozenPlan, 'scenario plan must be the pre-registered frozen plan');
  assert.deepEqual(meta.aegis, receipt.package);
  assert([baselineSha,candidateRuntimeSha].includes(receipt.package.sha));
  assert.equal(receipt.package.dirty, '');
  assert.equal(receipt.package.mode, 'real-built-public-api');
  assert.equal(receipt.package.config, 'severityTable critical/high deny; medium ask; low allow; all other package defaults');
  const expectedFiles = ['packages/aegis/dist/index.d.ts','packages/aegis/dist/index.js','packages/aegis/dist/index.js.map','packages/aegis/src/eval/evaluate.ts','packages/aegis/src/eval/preprocess.ts','packages/aegis/src/eval/safe-command.ts','packages/aegis/src/eval/source-policy-checkpoint.ts','packages/aegis/src/index.ts','packages/aegis/src/rules/loader.ts','packages/aegis/src/rules/merge.ts','packages/aegis/src/types.ts'];
  assert.deepEqual(receipt.package.manifest.map(m=>m.file).sort(), [...expectedFiles].sort());
  assert(receipt.package.manifest.every(m=>hex(m.sha256)));
  assert.equal(receipt.package.distSha256, receipt.package.manifest.find(m=>m.file==='packages/aegis/dist/index.js').sha256);
  const scores=events.filter(e=>e.t==='score'); assert.equal(scores.length, 1);
  sameKeys(receipt.metrics,keys); assert.deepEqual(scores[0].scores,receipt.metrics);
  const rows=events.filter(e=>e.t==='message'&&e.topic==='scenario'&&e.from==='real-current-cascade').map(e=>e.body);
  const controls=events.filter(e=>e.t==='message'&&e.topic==='scenario'&&e.from==='pinned-effective-base').map(e=>e.body);
  assert.equal(rows.length,25); assert.equal(controls.length,10);
  const hazardRows=[],controlRows=[],explicitRows=[];
  for(let i=0;i<rows.length;i++) {
    const row=rows[i],s=meta.scenarios[i];
    assert.equal(row.id,s.id); assert.equal(row.hazard,s.hazard); assert.equal(row.explicit,s.explicit===true);
    assert(['allow','ask','deny'].includes(row.action)); assert(['allow','ask','deny'].includes(row.priorAction));
    assert.deepEqual(row.expected,s.expected); assert(Array.isArray(row.warnings));
    const checks={effectiveRules:isDeepStrictEqual(row.effectiveRules,s.expected),warnings:row.warnings.length===s.warnings&&row.warnings.every(w=>w.ruleId===s.layers.at(-1)[0].id&&typeof w.message==='string'&&w.message.includes('allowDowngrade')),action:row.action===s.action,inputOwnership:row.checks.inputOwnership};
    assert.equal(typeof checks.inputOwnership,'boolean'); sameKeys(row.checks,Object.keys(checks));
    assert.deepEqual(row.checks,checks,'stored checks must agree with inspected fields');
    assert.equal(row.correct,Object.values(checks).every(Boolean));
    (s.hazard?hazardRows:controlRows).push(row); if(row.explicit)explicitRows.push(row);
  }
  assert.equal(hazardRows.length,10);assert.equal(explicitRows.length,3);
  controls.forEach((c,i)=>{assert.equal(c.id,hazardRows[i].id);assert.equal(c.action,'deny');assert.equal(c.correct,true);});
  const metrics={aegisUnsafeCoverageLossRate:hazardRows.filter(r=>r.action==='allow').length/10,aegisCoverageRejectionRate:hazardRows.filter(r=>r.checks.effectiveRules&&r.checks.warnings).length/10,aegisResolutionAccuracy:rows.filter(r=>r.correct).length/25,pinnedBaseControlAccuracy:controls.filter(r=>r.correct&&r.action==='deny').length/10,aegisControlAccuracy:controlRows.filter(r=>r.correct).length/15,aegisInputOwnership:Number(rows.every(r=>r.checks.inputOwnership)),protectedBaseFixtureAccuracy:hazardRows.filter(r=>r.priorAction==='deny').length/10,explicitConsentAccuracy:explicitRows.filter(r=>r.correct&&r.action==='allow').length/3};
  assert.deepEqual(receipt.metrics,metrics);assert.equal(receipt.green,verdict(metrics));
  if(receipt.package.sha===baselineSha){assert.equal(receipt.green,false);assert.equal(metrics.aegisUnsafeCoverageLossRate,1);}else assert.equal(receipt.green,true);
  return {events,meta,rows,controls};
}

export function verifyLivePackage(receipt, repo) {
  assert(repo,'AEGIS_REPO required for fresh verification');
  assert.equal(resolve(repo),resolve(receipt.package.repo));
  assert.equal(execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),candidateRuntimeSha);
  assert.equal(execFileSync('git',['-C',repo,'status','--porcelain'],{encoding:'utf8'}),'');
  for(const m of receipt.package.manifest)assert.equal(sha(readFileSync(join(repo,m.file))),m.sha256,`live artifact mismatch: ${m.file}`);
}

export function verifyFreshRun(receipt, excludedIds, startedAtMs) {
  assert(Array.isArray(excludedIds)); assert(!excludedIds.includes(receipt.runId),'fresh verification cannot reuse an earlier receipt');
  assert(Number.isFinite(startedAtMs));
  const runMs=parseInt(receipt.runId.replace(/^occ-/,''),36);
  assert(Number.isSafeInteger(runMs)&&runMs>=startedAtMs,'run must have started in this invocation');
  assert.equal(receipt.package.sha,candidateRuntimeSha);assert.equal(receipt.green,true);
}

function main() {
  const root=fileURLToPath(new URL('.',import.meta.url));
  const source=readFileSync(join(root,'src/main.ts'));
  const files=readdirSync(join(root,'runs')).filter(f=>f.endsWith('.receipt.json')).sort();
  const receipts=files.map(f=>JSON.parse(readFileSync(join(root,'runs',f),'utf8')));
  const latest=process.argv.includes('--latest');
  if(latest){
    const id=process.env.EXP63_FRESH_RUN_ID,excluded=process.env.EXP63_PREVIOUS_RUN_IDS,started=process.env.EXP63_STARTED_AT_MS;
    assert(id&&excluded&&started,'--latest requires exact fresh run ID, prior IDs, start time and AEGIS_REPO');
    const receipt=receipts.find(r=>r.runId===id);assert(receipt,'exact fresh run receipt missing');
    verifyReceipt(receipt,readFileSync(join(root,'runs',`${id}.jsonl`)),source);
    verifyFreshRun(receipt,JSON.parse(excluded),Number(started));verifyLivePackage(receipt,process.env.AEGIS_REPO);
    console.log(`exp63 fresh exact run verified: ${id}; complete metrics and live source/dist manifest green`);
  }else{
    const parsed=receipts.map(r=>verifyReceipt(r,readFileSync(join(root,'runs',`${r.runId}.jsonl`)),source));
    const bases=receipts.map((r,i)=>({r,p:parsed[i]})).filter(v=>v.r.package.sha===baselineSha);
    assert.equal(bases.length,2);assert(receipts.some(r=>r.package.sha===candidateRuntimeSha));
    assert.deepEqual(bases[0].p.rows,bases[1].p.rows);assert.deepEqual(bases[0].p.controls,bases[1].p.controls);assert.deepEqual(bases[0].r.package,bases[1].r.package);
    console.log(`exp63 exact committed receipts verified: ${receipts.length}; frozen red preserved and all metrics recomputed`);
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
