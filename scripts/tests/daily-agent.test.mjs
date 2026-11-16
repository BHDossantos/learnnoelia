import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
for (const key of ['', 'test-key-do-not-print']) test(key ? 'configured guard proceeds without exposing key' : 'missing key fails and explains that no work ran',()=>{
 const dir=mkdtempSync(join(tmpdir(),'daily-guard-'));
 try {
  const output=join(dir,'output'),summary=join(dir,'summary');
  const result=spawnSync('bash',['scripts/check-daily-agent-key.sh'],{encoding:'utf8',env:{...process.env,KEY:key,GITHUB_OUTPUT:output,GITHUB_STEP_SUMMARY:summary}});
  assert.equal(result.status,key ? 0 : 1);
  assert.equal(readFileSync(output,'utf8'),`run=${!!key}\n`);
  if(key) assert.ok(!result.stdout.includes(key));
  else {assert.match(result.stdout,/::error::/);assert.match(readFileSync(summary,'utf8'),/did not run/);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
