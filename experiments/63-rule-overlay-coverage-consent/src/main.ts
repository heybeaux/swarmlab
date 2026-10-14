import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { MessageBus, TraceWriter, readRunRecord } from '@swarmlab/core';

type Action = 'allow' | 'ask' | 'deny';
type Severity = 'critical' | 'high' | 'medium' | 'low';
type Rule = {id:string;category:'bash';severity:Severity;description:string;match:{kind:'regex'|'substring';pattern:string;flags?:string;target:'command'|'content'};appliesTo:string[];enabled?:boolean;allowDowngrade?:boolean};
interface Runtime {mergeLayers(layers:Rule[][]):{rules:Rule[];warnings:{ruleId:string;message:string}[]}; loadPack(pack:{packId:string;version:string;rules:Rule[]}):unknown[];evaluate(call:{tool:string;command:string},rules:unknown[]):{action:Action;matches:unknown[]}}
const EXP='63-rule-overlay-coverage-consent';
const SEED='overlay-coverage-consent-v1';
const REPO=process.env['AEGIS_REPO'];
if(!REPO) throw new Error('AEGIS_REPO required; this experiment must use real Aegis');
const DIST=join(REPO,'packages/aegis/dist/index.js');
const runtime=await import(pathToFileURL(DIST).href) as Runtime;
const clone=<T>(v:T):T=>structuredClone(v);
const hash=(v:string|Buffer)=>`sha256:${createHash('sha256').update(v).digest('hex')}`;
const base=():Rule=>({id:'coverage.block',category:'bash',severity:'critical',description:'protected classifier',match:{kind:'regex',pattern:'BLOCK\\b',flags:'i',target:'command'},appliesTo:['Bash','Shell']});
const overlay=(b:Rule,fields:Partial<Rule>):Rule=>({...clone(b),...fields});
type Scenario={id:string;hazard:boolean;layers:Rule[][];preceding:Rule[];expected:Rule[];warnings:number;action:Action;command:string;tool:string;explicit?:boolean};
const scenarios:Scenario[]=[];
function hazard(id:string,b:Rule,o:Rule,command='BLOCK',prior?:Rule){
 const layers=prior?[[base()],[b],[o]]:[[b],[o]];
 scenarios.push({id,hazard:true,layers,preceding:[clone(b)],expected:[clone(b)],warnings:1,action:'deny',command,tool:'Bash'});
}
{const b=base();hazard('regex-pattern-narrow',b,overlay(b,{match:{...b.match,pattern:'OTHER'}}));}
{const b=overlay(base(),{match:{kind:'substring',pattern:'BLOCK',target:'command'}});hazard('substring-pattern-narrow',b,overlay(b,{match:{...b.match,pattern:'OTHER'}}));}
{const b=base(),o=clone(b);delete o.match.flags;hazard('regex-remove-i',b,o,'block');}
{const b=base();hazard('target-command-to-content',b,overlay(b,{match:{...b.match,target:'content'}}));}
{const b=base();hazard('regex-to-substring',b,overlay(b,{match:{...b.match,kind:'substring'}}));}
{const b=base();hazard('appliesTo-drop-Bash',b,overlay(b,{appliesTo:['Shell']}));}
{const b=overlay(base(),{appliesTo:['*']});hazard('wildcard-to-finite',b,overlay(b,{appliesTo:['Shell']}));}
{const b=overlay(base(),{appliesTo:['Bash']});hazard('severity-escalation-plus-narrow',b,overlay(b,{severity:'critical',match:{...b.match,pattern:'OTHER'}}));}
{const b=overlay(base(),{description:'explicit previous consent',allowDowngrade:true});const o=overlay(b,{match:{...b.match,pattern:'OTHER'}});delete o.allowDowngrade;hazard('prior-explicit-consent-not-inherited',b,o,'BLOCK',base());}
{const b=overlay(base(),{description:'intermediate expanded policy',appliesTo:['Bash','Shell','Execute']});hazard('intermediate-base-retained',b,overlay(b,{appliesTo:['Shell','Execute']}),'BLOCK',base());}
function control(id:string,b:Rule,o:Rule,expected:Rule,action:Action='deny',warnings=0,explicit=false){scenarios.push({id,hazard:false,layers:[[b],[o]],preceding:[clone(b)],expected:[expected],warnings,action,command:'BLOCK',tool:'Bash',explicit});}
{const b=base();control('unchanged',b,clone(b),clone(b));}
{const b=base(),o=overlay(b,{description:'metadata revision'});control('description-only',b,o,clone(o));}
{const b=overlay(base(),{severity:'high'}),o=overlay(b,{severity:'critical'});control('severity-tighten',b,o,clone(o));}
{const b=base(),o=overlay(b,{appliesTo:['Bash','Shell','Execute']});control('tools-expand',b,o,clone(o));}
{const b=base(),o=overlay(b,{appliesTo:['*']});control('tools-wildcard',b,o,clone(o));}
{const b=base(),o=overlay(b,{appliesTo:['Shell','Bash','Shell']});control('tools-reorder-duplicate',b,o,clone(o));}
{const b=base();b.match.flags='im';const o=overlay(b,{match:{...b.match,flags:'mi'}});control('regex-flags-reorder',b,o,clone(o));}
{const b=base();delete b.match.flags;const o=overlay(b,{match:{...b.match,flags:''}});control('empty-flags-equivalent',b,o,clone(o));}
{const b=base(),o=overlay(b,{match:{...b.match,pattern:'OTHER'},allowDowngrade:true});control('explicit-pattern-consent',b,o,clone(o),'allow',0,true);}
{const b=base(),o=overlay(b,{appliesTo:['Shell'],allowDowngrade:true});control('explicit-scope-consent',b,o,clone(o),'allow',0,true);}
{const b=overlay(base(),{id:'coverage.other',match:{...base().match,pattern:'OTHER'}}),o=base();scenarios.push({id:'new-rule-addition',hazard:false,layers:[[b],[o]],preceding:[clone(b)],expected:[clone(b),clone(o)],warnings:0,action:'deny',command:'BLOCK',tool:'Bash'});}
{const b=overlay(base(),{enabled:false}),o=overlay(b,{enabled:true,match:{...b.match,pattern:'OTHER'}});control('disabled-base-retune',b,o,clone(o),'allow');}
{const b=base(),o=overlay(b,{severity:'low',allowDowngrade:true});control('explicit-severity-consent',b,o,clone(o),'allow',0,true);}
{const b=base(),o=overlay(b,{severity:'low'});control('silent-severity-downgrade',b,o,clone(b),'deny',1);}
{const b=base(),o=overlay(b,{match:{...b.match,pattern:'BLOCK\\b|OTHER'}});control('opaque-regex-broadening-without-proof',b,o,clone(b),'deny',1);}
if(scenarios.length!==25||scenarios.filter(s=>s.hazard).length!==10)throw new Error('frozen scenario counts incorrect');
const dir=join(import.meta.dirname,'..','runs');mkdirSync(dir,{recursive:true});
const runId=`occ-${Date.now().toString(36)}`;const tracePath=join(dir,`${runId}.jsonl`);
const trace=new TraceWriter(tracePath,{runId,experiment:EXP});const bus=new MessageBus({trace});
const files=execFileSync('find',[join(REPO,'packages/aegis/src'),join(REPO,'packages/aegis/dist'),'-type','f'],{encoding:'utf8'}).trim().split('\n').sort();
const packageInfo={sha:execFileSync('git',['-C',REPO,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['-C',REPO,'status','--porcelain'],{encoding:'utf8'}),repo:REPO,distSha256:hash(readFileSync(DIST)),manifest:files.map(file=>({file:file.slice(REPO.length+1),sha256:hash(readFileSync(file))})),mode:'real-built-public-api',config:'package defaults; no override'};
const harnessSha256=hash(readFileSync(join(import.meta.dirname,'..','src/main.ts')));
bus.publish({from:'moderator',to:'*',topic:'meta',body:{evidenceVersion:1,experiment:EXP,seed:SEED,holdout:'reserved-unused-no-tuning',runId,scenarios,harnessSha256,aegis:packageInfo}});
function evaluate(rules:Rule[],s:Scenario){return runtime.evaluate({tool:s.tool,command:s.command},runtime.loadPack({packId:'coverage-consent',version:'1',rules})).action;}
const rows=[];
for(const s of scenarios){
 const before=JSON.stringify(s.layers);
 const priorAction=evaluate(s.preceding,s);
 const result=runtime.mergeLayers(s.layers);
 const action=evaluate(result.rules,s);
 const checks={effectiveRules:isDeepStrictEqual(result.rules,s.expected),warnings:result.warnings.length===s.warnings&&result.warnings.every(w=>w.ruleId===s.layers.at(-1)![0]!.id&&typeof w.message==='string'&&w.message.includes('allowDowngrade')),action:action===s.action,inputOwnership:before===JSON.stringify(s.layers)};
 const row={id:s.id,hazard:s.hazard,explicit:s.explicit===true,priorAction,action,warnings:result.warnings,effectiveRules:result.rules,expected:s.expected,checks,correct:Object.values(checks).every(Boolean)};
 rows.push(row);bus.publish({from:'real-current-cascade',to:'moderator',topic:'scenario',body:row});
 if(s.hazard){const pinnedAction=evaluate(s.expected,s);bus.publish({from:'pinned-effective-base',to:'moderator',topic:'scenario',body:{id:s.id,action:pinnedAction,correct:pinnedAction==='deny'}});if(pinnedAction!=='deny'||priorAction!=='deny')throw new Error(`broken fixture/control ${s.id}`);}
}
const hazards=rows.filter(r=>r.hazard),controls=rows.filter(r=>!r.hazard),explicit=rows.filter(r=>r.explicit);
const metrics={aegisUnsafeCoverageLossRate:hazards.filter(r=>r.action==='allow').length/10,aegisCoverageRejectionRate:hazards.filter(r=>r.checks.effectiveRules&&r.checks.warnings).length/10,aegisResolutionAccuracy:rows.filter(r=>r.correct).length/25,pinnedBaseControlAccuracy:1,aegisControlAccuracy:controls.filter(r=>r.correct).length/15,aegisInputOwnership:Number(rows.every(r=>r.checks.inputOwnership)),protectedBaseFixtureAccuracy:hazards.filter(r=>r.priorAction==='deny').length/10,explicitConsentAccuracy:explicit.filter(r=>r.correct&&r.action==='allow').length/3};
const green=Object.entries(metrics).every(([k,v])=>v===(k==='aegisUnsafeCoverageLossRate'?0:1));
trace.append({t:'score',ts:Date.now(),scores:metrics});
const replay=await readRunRecord(tracePath);if(JSON.stringify(replay.events)!==JSON.stringify(trace.toRunRecord().events))throw new Error('full serialized replay mismatch');
const receipt={runId,harnessSha256,package:packageInfo,seed:SEED,metrics,green,traceSha256:hash(readFileSync(tracePath)),events:replay.events.length};writeFileSync(join(dir,`${runId}.receipt.json`),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));console.log(`policy verdict: ${green?'green':'red'}; trace: ${tracePath}`);
