import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root=import.meta.dirname,dir=join(root,'runs');
const before=readdirSync(dir).filter(f=>f.endsWith('.receipt.json'));
const startedAt=Date.now();
// Preserve the complete runner output for the source/dist receipt and metric audit.
execFileSync(process.execPath,[join(root,'dist/main.js')],{stdio:'inherit',env:process.env});
const fresh=readdirSync(dir).filter(f=>f.endsWith('.receipt.json')&&!before.includes(f));
assert.equal(fresh.length,1,'runner must produce exactly one NEW receipt');
const id=fresh[0].replace('.receipt.json','');
execFileSync(process.execPath,[join(root,'verify-receipts.mjs'),'--latest'],{stdio:'inherit',env:{...process.env,EXP63_FRESH_RUN_ID:id,EXP63_PREVIOUS_RUN_IDS:JSON.stringify(before.map(f=>f.replace('.receipt.json',''))),EXP63_STARTED_AT_MS:String(startedAt)}});
