import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageBus, TraceWriter, readRunRecord, runScorer, spawnAgent, StubRuntime, type Scorer, type TraceEvent } from '@swarmlab/core';
import { runArm, scoreArm } from './policy.js';
import { SCENARIOS, SEED } from './scenarios.js';
import type { AegisRuntime, ArmId, ArmMetrics } from './types.js';

const AEGIS_REPO=process.env.AEGIS_REPO??'/Users/beauxwalton/projects/worktrees/aegis-2026-09-04-exp27';
const AEGIS_DIST=process.env.AEGIS_DIST??`${AEGIS_REPO}/packages/aegis/dist/index.js`;
const AEGIS_HOOK_DIST=process.env.AEGIS_HOOK_DIST??`${AEGIS_REPO}/packages/aegis-hook/dist/index.js`;
const sha=(repo:string)=>execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function load():Promise<AegisRuntime>{
 const a=await import(pathToFileURL(AEGIS_DIST).href) as any; const h=await import(pathToFileURL(AEGIS_HOOK_DIST).href) as any; const rules=h.loadAllPacks();
 return {evaluate(call){return a.evaluate(call,rules)},decide(e,c,d){return h.decide(e,{call:c,approvalDir:d})},approvePending(id,d){h.approvePending(id,d)}};
}
const runsDir=join(import.meta.dirname,'..','runs'); mkdirSync(runsDir,{recursive:true});
const runId=`apc-${Date.now().toString(36)}`, traceFile=join(runsDir,`${runId}.jsonl`);
const trace=new TraceWriter(traceFile,{runId,experiment:'27-approval-provenance-context-binding'}),bus=new MessageBus({trace}),runtime=new StubRuntime();
const aegisSha=sha(AEGIS_REPO),aegis=await load();
bus.publish({from:'moderator',to:'*',topic:'meta',body:{evidenceVersion:1,experiment:'27-approval-provenance-context-binding',spec:'33-approval-provenance-context-binding',runId,timestamp:new Date().toISOString(),seed:SEED,evidenceKind:'deterministic_approval_provenance_sim',scenarioCount:SCENARIOS.length,arms:['call-only','actor-binding','exact-session-binding','scope-aware-binding','aegis-wrapped'],aegis:{repo:AEGIS_REPO,dist:AEGIS_DIST,hookDist:AEGIS_HOOK_DIST,sha:aegisSha,mode:'built-artifact+real-hook-approval-store'}}});
console.log(`run ${runId} | scenarios=${SCENARIOS.length} seed=${SEED} aegis=${aegisSha}`);
const arms:readonly ArmId[]=['call-only','actor-binding','exact-session-binding','scope-aware-binding','aegis-wrapped']; const all=new Map<ArmId,ArmMetrics>();
const fields=(arm:ArmId,m:ArmMetrics)=>Object.fromEntries(Object.entries(m).map(([k,v])=>[`${arm.replaceAll('-','_')}_${k}`,v]));
for(const arm of arms){
 const handle=await spawnAgent({id:`approval-provenance:${arm}`,systemPrompt:`Deterministic arm ${arm}.`},{runtime,trace});
 const results=[]; for(const s of SCENARIOS){const r=runArm(arm,s,arm==='aegis-wrapped'?aegis:undefined);results.push(r);bus.publish({from:handle.id,to:'moderator',topic:'scenario',body:{arm,scenarioId:s.id,kind:s.kind,grantScope:s.grant.grantScope,grant:s.grant,retry:s.retry,shouldExecute:s.shouldExecute,executed:r.executed,correct:r.correct,initialAegisAction:r.initialEvaluation?.action,retryAegisAction:r.retryEvaluation?.action,retryHookExitCode:r.retryDecision?.exitCode,retryApprovalEvent:r.retryDecision?.approval?.event,retryAegisMatches:r.retryEvaluation?.matches.map(x=>x.id)??[]}})}
 const m=scoreArm(results);all.set(arm,m);trace.append({t:'score',ts:Date.now(),scores:fields(arm,m)});
 console.log(`${arm.padEnd(22)} actor=${m.crossActorExecutionRate.toFixed(3)} session=${m.crossSessionExecutionRate.toFixed(3)} workspace=${m.crossWorkspaceExecutionRate.toFixed(3)} intent=${m.crossIntentExecutionRate.toFixed(3)} revoked=${m.revokedAuthorizationExecutionRate.toFixed(3)} refresh=${m.provenanceRefreshCoverage.toFixed(3)} accuracy=${m.provenanceAccuracy.toFixed(3)} cleanAsk=${m.sameContextReaskRate.toFixed(3)} portableFail=${m.workspaceScopePortabilityFailureRate.toFixed(3)}`);
 await handle.kill();bus.removeAgent(handle.id);
}
const get=(a:ArmId)=>{const m=all.get(a);if(!m)throw new Error(`missing ${a}`);return m};
const scorer:Scorer={score(){const c=get('call-only'),e=get('exact-session-binding'),s=get('scope-aware-binding'),a=get('aegis-wrapped');return {scenarioCount:SCENARIOS.length,callOnlyProvenanceAccuracy:c.provenanceAccuracy,exactSessionWorkspaceScopePortabilityFailureRate:e.workspaceScopePortabilityFailureRate,scopeAwareProvenanceRefreshCoverage:s.provenanceRefreshCoverage,scopeAwareProvenanceAccuracy:s.provenanceAccuracy,scopeAwareSameContextReaskRate:s.sameContextReaskRate,scopeAwareWorkspaceScopePortabilityFailureRate:s.workspaceScopePortabilityFailureRate,aegisWrappedCrossActorExecutionRate:a.crossActorExecutionRate,aegisWrappedCrossSessionExecutionRate:a.crossSessionExecutionRate,aegisWrappedCrossWorkspaceExecutionRate:a.crossWorkspaceExecutionRate,aegisWrappedCrossIntentExecutionRate:a.crossIntentExecutionRate,aegisWrappedRevokedAuthorizationExecutionRate:a.revokedAuthorizationExecutionRate,aegisWrappedProvenanceRefreshCoverage:a.provenanceRefreshCoverage,aegisWrappedProvenanceAccuracy:a.provenanceAccuracy,aegisWrappedSameContextReaskRate:a.sameContextReaskRate,aegisWrappedWorkspaceScopePortabilityFailureRate:a.workspaceScopePortabilityFailureRate,aegisWrappedInitialAskCoverage:a.initialAskCoverage,fixtureCallOnlyRed:c.provenanceAccuracy<1?1:0,fixtureScopeAwareGreen:s.provenanceAccuracy===1&&s.provenanceRefreshCoverage===1&&s.sameContextReaskRate===0&&s.workspaceScopePortabilityFailureRate===0?1:0,baselineAegisRed:(a.crossActorExecutionRate>0||a.crossSessionExecutionRate>0||a.crossWorkspaceExecutionRate>0||a.crossIntentExecutionRate>0||a.revokedAuthorizationExecutionRate>0||a.provenanceAccuracy<1)?1:0}}};
const summary=runScorer(scorer,trace.toRunRecord());trace.append({t:'score',ts:Date.now(),scores:summary});console.log('summary:',JSON.stringify(summary));
const written=trace.toRunRecord(),replayed=await readRunRecord(traceFile),count=(es:readonly TraceEvent[],t:TraceEvent['t'])=>es.filter(e=>e.t===t).length;
for(const kind of ['spawn','message','score','kill'] as const){if(count(written.events,kind)!==count(replayed.events,kind))throw new Error(`replay mismatch ${kind}`)}
console.log(`replay verified: ${replayed.events.length} events`);console.log(`trace: ${traceFile}`);
