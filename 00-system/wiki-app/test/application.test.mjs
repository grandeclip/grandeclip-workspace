import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApplication} from '../lib/application.mjs';

async function fixture(fn){
 const root=await mkdtemp(path.join(os.tmpdir(),'wiki-app-test-'));
 const docs=[{id:'raw/example.md',path:'raw/example.md',kind:'source',title:'시험 자료',summary:'기억을 꺼내본다',markdown:'# 시험 자료\n\n자료를 덮고 설명한다.',related:[],sources:[]}];
 let imports=0,commits=0;
 const store={root,init:async()=>{},getData:async()=>({title:'내 위키',docs,edges:[]}),getDocument:async id=>docs.find(d=>d.id===id),importFiles:async()=>{imports++;return {added:['raw/example.md'],duplicates:[],warnings:[]};},commitArticles:async result=>{commits++;assert.ok(result.articles.length);return result;}};
 const providers={providerStatus:async id=>({id,installed:true,authenticated:true,message:'연결됨'}),runProvider:async ({prompt})=>({text:prompt.includes('"articles"')?JSON.stringify({articles:[{path:'wiki/learning/recall.md',title:'인출 연습',markdown:'# 인출 연습\n자료를 덮고 설명한다.\n\n[원문](../../raw/example.md)'}],summary:'개념 정리'}):JSON.stringify({answer:'자료를 덮고 설명해요. [시험 자료](raw/example.md)',citations:[{id:'raw/example.md',quote:'자료를 덮고 설명한다.'}],suggestions:['어떻게 활용할까?']})})};
 await writeFile(path.join(root,'index.html'),'<html lang="ko">내 위키</html>');
 const app=createApplication({store,providers,skillText:'원자료를 보존한다.',articleTemplate:'제목과 출처',publicDir:root});
 try{await fn({root,app,docs,providers,store,getImports:()=>imports,getCommits:()=>commits});}finally{await rm(root,{recursive:true,force:true});}
}
function boot(app){return app.handle(new Request('http://127.0.0.1:3113/'));}
async function session(app){const response=await boot(app);const cookie=response.headers.get('set-cookie').split(';')[0];const state=await app.handle(new Request('http://127.0.0.1:3113/api/state',{headers:{cookie}}));return {cookie,csrf:(await state.json()).csrfToken};}
function request(url,{cookie,csrf,body,origin='http://127.0.0.1:3113'}={}){return new Request('http://127.0.0.1:3113'+url,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json','x-wiki-csrf':csrf||'',origin}:{} )},...(body?{body:JSON.stringify(body)}:{})});}
test('private wiki rejects foreign hosts and cross-origin mutations before importing',()=>fixture(async({app,getImports})=>{
 assert.equal((await app.handle(new Request('http://evil.test:3113/api/state'))).status,403);
 assert.equal((await app.handle(request('/api/state'))).status,401);
 const auth=await session(app);
 assert.equal((await app.handle(request('/api/import',{...auth,body:{provider:'codex',files:[]},origin:'https://evil.test'}))).status,403);
 assert.equal(getImports(),0);
}));
test('chat validates selected document and returns source-backed answer with persistent conversation',()=>fixture(async({app,root})=>{
 const auth=await session(app);
 const invalid=await app.handle(request('/api/chat',{...auth,body:{provider:'codex',question:'설명해줘',selectedId:'../../private.md'}}));
 assert.equal(invalid.status,400);
 const response=await app.handle(request('/api/chat',{...auth,body:{provider:'codex',question:'어떻게 공부해?',selectedId:'raw/example.md'}}));
 const events=(await response.text()).trim().split('\n').map(JSON.parse);
 const done=events.find(event=>event.type==='done');assert.ok(done);
 assert.equal(done.data.citations[0].id,'raw/example.md');assert.ok(done.data.citations[0].verified);
 const saved=JSON.parse(await readFile(path.join(root,'.state/chats',done.data.conversationId+'.json'),'utf8'));
 assert.equal(saved.messages.length,2);
}));
test('import runs real compile boundary and validates before commit',()=>fixture(async({app,getImports,getCommits})=>{
 const auth=await session(app);
 const response=await app.handle(request('/api/import',{...auth,body:{provider:'codex',files:[{name:'note.md',encoding:'base64',content:'Iw=='}]}}));
 const events=(await response.text()).trim().split('\n').map(JSON.parse);
 assert.ok(events.some(event=>event.type==='done'));
 assert.equal(getImports(),1);assert.equal(getCommits(),1);
}));
test('unknown citation and altered original quote are not presented as verified answers',()=>fixture(async({app,providers})=>{
 const auth=await session(app);
 for(const citation of [{id:'raw/made-up.md',quote:'없는 근거'},{id:'raw/example.md',quote:'원문과 다른 인용'},{id:'raw/example.md',quote:''}]){
  providers.runProvider=async()=>({text:JSON.stringify({answer:'근거가 있다는 답변',citations:[citation]})});
  const response=await app.handle(request('/api/chat',{...auth,body:{provider:'codex',question:'어떤 근거야?'}}));
  const events=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.ok(events.some(event=>event.type==='error'));assert.ok(!events.some(event=>event.type==='done'));
 }
}));
test('answer links cannot cite a missing local document even when citation metadata is empty',()=>fixture(async({app,providers})=>{
 const auth=await session(app);providers.runProvider=async()=>({text:JSON.stringify({answer:'[없는 자료](raw/missing.md)',citations:[]})});
 const response=await app.handle(request('/api/chat',{...auth,body:{provider:'codex',question:'근거를 보여줘'}}));
 const events=(await response.text()).trim().split('\n').map(JSON.parse);
 assert.ok(events.some(event=>event.type==='error'));assert.ok(!events.some(event=>event.type==='done'));
}));
test('an exact question match is retrieved even when the selected note has many neighbors',()=>fixture(async({app,providers,docs})=>{
 const auth=await session(app);docs[0].related=Array.from({length:12},(_,i)=>'wiki/topic/n'+i+'.md');
 for(const id of docs[0].related)docs.push({id,path:id,kind:'concept',title:'주변 개념',summary:'주변',markdown:'주변 내용',related:[],sources:[]});
 docs.push({id:'wiki/topic/target.md',path:'wiki/topic/target.md',kind:'concept',title:'별도목표개념',summary:'목표',markdown:'본문_검색_선택_검증문장',related:[],sources:[]});
 let prompt='';providers.runProvider=async input=>{prompt=input.prompt;return {text:JSON.stringify({answer:'자료에서 찾았어요.',citations:[]})};};
 const response=await app.handle(request('/api/chat',{...auth,body:{provider:'codex',question:'별도목표개념',selectedId:'raw/example.md'}}));await response.text();
 assert.ok(prompt.includes('본문_검색_선택_검증문장'));
}));
test('a later import gives the model previous original sources as well as compiled notes',()=>fixture(async({app,providers,docs})=>{
 const auth=await session(app);docs.push({id:'raw/older.md',path:'raw/older.md',kind:'source',title:'이전 원자료',summary:'이전 자료',markdown:'예전_원자료의_정확한_문장',related:[],sources:[]});
 docs.push({id:'wiki/topic/older.md',path:'wiki/topic/older.md',kind:'concept',title:'이전 개념',summary:'요약',markdown:'이전 개념의 짧은 요약',related:[],sources:[{id:'raw/older.md',label:'이전 원자료'}]});
 let prompt='';providers.runProvider=async input=>{prompt=input.prompt;return {text:JSON.stringify({articles:[],summary:'자료 유지'})};};
 const response=await app.handle(request('/api/import',{...auth,body:{provider:'codex',files:[{name:'new.md',encoding:'base64',content:'Iw=='}]}}));await response.text();
 assert.ok(prompt.includes('예전_원자료의_정확한_문장'));
}));
test('simultaneous requests cannot start two model runs while authentication is pending',()=>fixture(async({app,providers})=>{
 const auth=await session(app);let release;const waiting=new Promise(resolve=>release=resolve);let executions=0;
 providers.runProvider=async()=>{executions++;await waiting;return {text:JSON.stringify({answer:'원문으로 확인했어요.',citations:[]})};};
 const responses=await Promise.all([1,2].map(()=>app.handle(request('/api/chat',{...auth,body:{provider:'codex',question:'알려줘'}}))));
 assert.equal(responses.filter(response=>response.status===409).length,1);release();
 await Promise.all(responses.map(response=>response.text()));assert.equal(executions,1);
}));


test('state exposes current document import readiness before a student uploads any files', () => fixture(async ({app,store,root,getImports}) => {
  store.getImportCapabilities = async () => ({pdf:{available:false},docx:{available:true}});
  const auth = await session(app);
  const state = await (await app.handle(request('/api/state', auth))).json();
  assert.deepEqual(state.importCapabilities, {pdf:{available:false},docx:{available:true}});
  assert.equal(state.wikiRoot, root);
  assert.equal(getImports(), 0);
  store.getImportCapabilities = async () => ({pdf:{available:true},docx:{available:true}});
  const refreshed = await (await app.handle(request('/api/state', auth))).json();
  assert.equal(refreshed.importCapabilities.pdf.available, true);
}));
