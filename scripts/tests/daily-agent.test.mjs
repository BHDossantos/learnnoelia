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

for (const key of [undefined, '   \t\n']) test(`unset or whitespace-only key fails (${JSON.stringify(key)})`, () => {
 const dir=mkdtempSync(join(tmpdir(),'daily-guard-'));
 try {
  const env={...process.env,GITHUB_OUTPUT:join(dir,'output')};
  delete env.GITHUB_STEP_SUMMARY;
  if(key===undefined) delete env.KEY; else env.KEY=key;
  const result=spawnSync('bash',['scripts/check-daily-agent-key.sh'],{encoding:'utf8',env});
  assert.equal(result.status,1);
  assert.equal(readFileSync(env.GITHUB_OUTPUT,'utf8'),'run=false\n');
  assert.match(result.stdout,/No courses or improvements were generated/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('workflow does not mask agent or rebase failure and tests run in aggregate',()=>{
 const workflow=readFileSync('.github/workflows/daily-agent.yml','utf8');
 assert.match(workflow,/run: bash scripts\/check-daily-agent-key\.sh/);
 assert.doesNotMatch(workflow,/\|\| true|continue-on-error/);
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 assert.match(pkg.scripts.test,/npm run test:daily-agent/);
});
