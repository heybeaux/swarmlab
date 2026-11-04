import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyReceipt,verifyFreshRun,verifyLivePackage} from './verify-receipts.mjs';
const root=import.meta.dirname,source=readFileSync(join(root,'src/main.ts'));
const hash=v=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
function fixture(){const r=JSON.parse(readFileSync(join(root,'runs/occ-mv7qn439.receipt.json')));const e=readFileSync(join(root,'runs/occ-mv7qn439.jsonl'),'utf8').trim().split('\n').map(JSON.parse);return {r,e};}
function bytes(r,e){const b=Buffer.from(e.map(v=>JSON.stringify(v)).join('\n')+'\n');r.traceSha256=hash(b);return b;}
function row(e,id){return e.find(e=>e.t==='message'&&e.from==='real-current-cascade'&&e.body.id===id).body;}
test('legitimate red/red/green receipts still verify',()=>{for(const id of ['occ-mv7qlhb7','occ-mv7qlhdk','occ-mv7qn439']){const r=JSON.parse(readFileSync(join(root,`runs/${id}.receipt.json`)));verifyReceipt(r,readFileSync(join(root,`runs/${id}.jsonl`)),source);}});
test('missing secondary metrics are not vacuous green',()=>{const {r,e}=fixture();for(const k of ['pinnedBaseControlAccuracy','aegisControlAccuracy','aegisInputOwnership','protectedBaseFixtureAccuracy','explicitConsentAccuracy']){delete r.metrics[k];delete e.at(-1).scores[k];}assert.throws(()=>verifyReceipt(r,bytes(r,e),source));});
test('consumer allowance cannot be reported green when actual action is deny',()=>{const {r,e}=fixture();row(e,'explicit-pattern-consent').action='deny';assert.throws(()=>verifyReceipt(r,bytes(r,e),source));});
test('self-check boolean cannot certify an unauthorized effective rule',()=>{const {r,e}=fixture();row(e,'regex-pattern-narrow').effectiveRules[0].match.pattern='OTHER';assert.throws(()=>verifyReceipt(r,bytes(r,e),source));});
test('wrong warning attribution cannot keep green',()=>{const {r,e}=fixture();row(e,'regex-pattern-narrow').warnings[0].ruleId='unrelated';assert.throws(()=>verifyReceipt(r,bytes(r,e),source));});
test('a duplicate/omitted scenario cannot retain exact count green',()=>{const {r,e}=fixture();row(e,'regex-remove-i').id='regex-pattern-narrow';assert.throws(()=>verifyReceipt(r,bytes(r,e),source));});
test('input ownership false cannot be hidden behind original score',()=>{const {r,e}=fixture();row(e,'description-only').checks.inputOwnership=false;assert.throws(()=>verifyReceipt(r,bytes(r,e),source));});
test('forged baseline fixture accuracy is recomputed',()=>{const {r,e}=fixture();row(e,'regex-pattern-narrow').priorAction='allow';assert.throws(()=>verifyReceipt(r,bytes(r,e),source));});
test('unknown or NaN-like metric shape is not accepted',()=>{const {r,e}=fixture();r.metrics.extra=1;e.at(-1).scores.extra=1;assert.throws(()=>verifyReceipt(r,bytes(r,e),source));});
test('changing the pre-registered scenario oracle is rejected',()=>{const {r,e}=fixture();e[0].body.scenarios[0].action='allow';assert.throws(()=>verifyReceipt(r,bytes(r,e),source));});
test('an already present receipt is never a fresh run',()=>{const {r}=fixture();assert.throws(()=>verifyFreshRun(r,[r.runId],0));});
test('even an unlisted old run is rejected by invocation start boundary',()=>{const {r}=fixture();assert.throws(()=>verifyFreshRun(r,[],parseInt(r.runId.slice(4),36)+1));});
test('the exact new candidate ID and start boundary can verify',()=>{const {r}=fixture();verifyFreshRun(r,[],parseInt(r.runId.slice(4),36));});
test('bare --latest refuses to masquerade committed evidence as fresh',()=>{assert.throws(()=>execFileSync(process.execPath,[join(root,'verify-receipts.mjs'),'--latest'],{stdio:'pipe',env:{...process.env,EXP63_FRESH_RUN_ID:'',EXP63_PREVIOUS_RUN_IDS:'',EXP63_STARTED_AT_MS:''}}));});
test('live package manifest validation rejects forged hashes', {skip:!process.env.AEGIS_REPO},()=>{const {r}=fixture();r.package.repo=process.env.AEGIS_REPO;verifyLivePackage(r,process.env.AEGIS_REPO);r.package.manifest[0].sha256='sha256:'+'0'.repeat(64);assert.throws(()=>verifyLivePackage(r,process.env.AEGIS_REPO));});
