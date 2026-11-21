import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {scenarios} from './scenarios.mjs';
const {isSafeCommand}=await import(pathToFileURL(join(process.env.AEGIS_REPO,'packages/aegis/dist/index.js')).href);
// Only constant registered scripts; the simulated effect prints one marker.
const prelude="lab_effect() { printf '%s\\n' LAB_EFFECT; }\ncatastrophe() { :; }\n";
const shell=command=>{
 const r=spawnSync('/bin/bash',['--noprofile','--norc','-c',prelude+command],{cwd:'/tmp',env:{PATH:'/usr/bin:/bin',LC_ALL:'C'},encoding:'utf8',timeout:3000,maxBuffer:16384});
 return {status:r.status,signal:r.signal,stdout:r.stdout,stderr:r.stderr,...(r.error?{error:String(r.error)}:{})};
};
console.log(JSON.stringify(scenarios.map(s=>{
 try {
  const allowlist=new Set(['echo','pwd','whoami']);
  const r={id:s.id,status:'ok',allowlistBefore:[...allowlist],implicit:isSafeCommand(s.command),explicit:isSafeCommand(s.command,allowlist),shell:shell(s.command)};
  if(s.kind==='hazard')r.paired={implicit:isSafeCommand(s.pairedCommand),explicit:isSafeCommand(s.pairedCommand,allowlist),shell:shell(s.pairedCommand)};
  r.allowlistAfter=[...allowlist];r.recovery=isSafeCommand('echo SAFE');return r;
 }catch(error){return {id:s.id,status:'infrastructure-error',error:String(error)}}
})));
