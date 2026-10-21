import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {resolveWikiRoot} from '../server.mjs';
test('local root pointer is read without moving data or rewriting the setting',async()=>{
 const workspace=await mkdtemp(path.join(os.tmpdir(),'wiki-root-'));
 try{const file=path.join(workspace,'.wiki-local.json'),content=JSON.stringify({root:'/private/tmp/selected-personal-wiki'});await writeFile(file,content);
  assert.equal(await resolveWikiRoot({workspace}),'/private/tmp/selected-personal-wiki');assert.equal(await readFile(file,'utf8'),content);
  assert.equal(await resolveWikiRoot({workspace,root:'/private/tmp/explicit-wiki'}),'/private/tmp/explicit-wiki');
 }finally{await rm(workspace,{recursive:true,force:true});}
});
test('fresh workspaces use the ignored default wiki folder without a configuration file',async()=>{
 const workspace=await mkdtemp(path.join(os.tmpdir(),'wiki-default-'));
 try{assert.equal(await resolveWikiRoot({workspace}),path.join(workspace,'30-knowledge/36-personal-wiki'));}finally{await rm(workspace,{recursive:true,force:true});}
});
