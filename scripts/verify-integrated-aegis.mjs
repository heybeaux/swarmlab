// Regression expectations, not new scientific evidence. Frozen designs remain unchanged.
import {readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
if(!process.env.AEGIS_REPO)throw Error('AEGIS_REPO required');
process.env.AEGIS_DIST=join(process.env.AEGIS_REPO,'packages/aegis/dist/index.js');
const expectations=JSON.parse(readFileSync(join(import.meta.dirname,'integrated-aegis-expectations.json')));
const output=join(root,'.integration-runs',`combined-${Date.now()}`);mkdirSync(output,{recursive:true});
for(const [number,expected] of Object.entries(expectations)){
 const folder=readdirSync(join(root,'experiments')).find(n=>n.startsWith(`${number}-`));
 const base=join(root,'experiments',folder);
 const main=existsSync(join(base,'main.mjs'))?'main.mjs':'dist/main.js';
 const stdout=execFileSync(process.execPath,[join(base,main)],{cwd:root,env:process.env,encoding:'utf8',timeout:120000,maxBuffer:10000000});
 writeFileSync(join(output,`exp${number}.log`),stdout);
 const line=stdout.match(/^summary: (.+)$/m);
 const summary=line?JSON.parse(line[1]):JSON.parse(stdout.match(/"(?:summary|metrics)":\s*(\{[^}]+\})/)[1]);
 assert.deepEqual(summary,expected,`exp${number} combined runtime regression`);
 console.log(`exp${number}: expected metrics verified`);
}
const migration=execFileSync(process.execPath,[join(root,'scripts/verify-rt50-migration.mjs')],{cwd:root,env:process.env,encoding:'utf8',timeout:120000});
writeFileSync(join(output,'rt50-migration.json'),migration);assert.equal(JSON.parse(migration).passed,true);
console.log('exp58/72: separate producer migration verified; frozen evidence unchanged');
