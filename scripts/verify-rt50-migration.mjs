// Compatibility-only replay. Frozen experiments, receipts and thresholds stay unchanged.
import {mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, symlinkSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
if(!process.env.AEGIS_REPO) throw Error('AEGIS_REPO required');
const base=join(root,'.integration-runs');mkdirSync(base,{recursive:true});
const work=mkdtempSync(join(base,'rt50-'));
symlinkSync(join(root,'node_modules'),join(work,'node_modules'),'dir');
const hash=s=>createHash('sha256').update(s).digest('hex');
const changes=[];
function migrate(from,to,before,after){
 const original=readFileSync(from,'utf8');
 if(original.split(before).length!==2)throw Error(`Expected exactly one migration site: ${from}`);
 const updated=original.replace(before,after);writeFileSync(to,updated);
 changes.push({file:from,beforeSha256:hash(original),afterSha256:hash(updated),replacement:{before,after}});
}
const exp58=join(work,'58');mkdirSync(join(exp58,'src'),{recursive:true});
migrate(join(root,'experiments/58-async-evaluator-config-integrity/src/main.ts'),join(exp58,'src/main.ts'),'prediction:{pFailure:.1}','prediction:{pFailure:.1,confidence:1,source:\'prior\'}');
const out58=execFileSync(process.execPath,['--experimental-transform-types',join(exp58,'src/main.ts')],{encoding:'utf8',env:process.env});
writeFileSync(join(work,'exp58.log'),out58);
const summary58=JSON.parse(out58.match(/^summary: (.+)$/m)[1]);
if(summary58.aegisWrappedResolutionAccuracy!==1||summary58.aegisWrappedUnsafeConfigAllowRate!==0)throw Error('Migrated exp58 failed');
const exp72=join(work,'72');mkdirSync(exp72);
for(const f of ['main.mjs','scenarios.mjs','oracle.mjs'])copyFileSync(join(root,'experiments/72-process-input-boundary',f),join(exp72,f));
migrate(join(root,'experiments/72-process-input-boundary/child.mjs'),join(exp72,'child.mjs'),"source:'lab'","source:'prior'");
const out72=execFileSync(process.execPath,[join(exp72,'main.mjs')],{encoding:'utf8',env:process.env});writeFileSync(join(work,'exp72.json'),out72);
const result72=JSON.parse(out72);if(result72.passed!==true||result72.failed.length!==0)throw Error('Migrated exp72 failed');
const receipt={kind:'compatibility-migration-not-frozen-evidence',changes,summary58,summary72:result72.summary,aegisSha:execFileSync('git',['-C',process.env.AEGIS_REPO,'rev-parse','HEAD'],{encoding:'utf8'}).trim()};
writeFileSync(join(work,'migration.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({passed:true,receipt:join(work,'migration.json'),...receipt},null,2));
