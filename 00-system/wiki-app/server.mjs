import http from 'node:http';
import {Readable} from 'node:stream';
import {readFile,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {WikiStore} from './lib/store.mjs';
import * as providers from './lib/providers.mjs';
import {createApplication} from './lib/application.mjs';

export async function resolveWikiRoot({workspace,root}={}){
 if(root)return path.resolve(root);
 const file=path.join(workspace,'.wiki-local.json');
 try{
  if((await lstat(file)).isSymbolicLink())throw new Error('위키 위치 설정은 일반 JSON 파일이어야 해요.');
  const setting=JSON.parse(await readFile(file,'utf8'));
  if(typeof setting.root!=='string'||!setting.root.trim())throw new Error('위키 위치 설정의 root 경로를 확인해주세요.');
  return path.resolve(workspace,setting.root);
 }catch(error){if(error.code!=='ENOENT')throw error;}
 return path.join(workspace,'30-knowledge/36-personal-wiki');
}

export async function startWiki({root,workspace,port=3113,skillDir}={}){
 if(Number(process.versions.node.split('.')[0])<20)throw new Error('위키를 실행하려면 Node.js 20 이상이 필요해요. 현재 AI에게 Node.js 실행 환경 준비를 요청해주세요.');
 const appDir=path.dirname(fileURLToPath(import.meta.url));workspace=path.resolve(workspace||path.join(appDir,'../..'));
 root=await resolveWikiRoot({workspace,root});
 skillDir=path.resolve(skillDir||path.join(workspace,'.claude/skills/karpathy-llm-wiki'));
 const skillText=await readFile(path.join(skillDir,'SKILL.md'),'utf8'),workshop=await readFile(path.join(skillDir,'references/workshop.md'),'utf8');
 const articleTemplate=await readFile(path.join(skillDir,'references/article-template.md'),'utf8');
 const store=new WikiStore(root);await store.init();
 const application=createApplication({store,providers,skillText:skillText+'\n\n'+workshop,articleTemplate,publicDir:path.join(appDir,'public')});
 const server=http.createServer(async(req,res)=>{
  const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort();});
  try{
   const host=req.headers.host||'invalid';if(!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)){res.writeHead(403);res.end('Localhost only');return;}
   const chunks=[];let size=0;
   if(!['GET','HEAD'].includes(req.method)){for await(const chunk of req){size+=chunk.length;if(size>45000000){res.writeHead(413,{'content-type':'application/json'});res.end(JSON.stringify({error:'한 번에 선택한 자료가 너무 커요. 나눠서 추가해주세요.'}));return;}chunks.push(chunk);}}
   const body=chunks.length?Buffer.concat(chunks):undefined;
   const request=new Request(`http://${host}${req.url}`,{method:req.method,headers:req.headers,signal:abort.signal,...(body?{body}:{})});
   const response=await application.handle(request);res.writeHead(response.status,Object.fromEntries(response.headers));
   if(response.body){for await(const chunk of Readable.fromWeb(response.body)){if(!res.write(chunk))await new Promise(resolve=>res.once('drain',resolve));}}
   res.end();
  }catch(error){if(!res.headersSent)res.writeHead(500,{'content-type':'application/json; charset=utf-8'});if(!res.writableEnded)res.end(JSON.stringify({error:'요청을 완료하지 못했어요. 화면에서 다시 시도해주세요.'}));}
 });
 server.requestTimeout=0;server.headersTimeout=30000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 const address=server.address(),url=`http://127.0.0.1:${address.port}/`;
 return {server,store,url,application};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i++){const key=args[i];if(!['--root','--workspace','--port','--skill-dir'].includes(key)||!args[i+1]){console.error('사용법: node server.mjs [--root 자료폴더] [--workspace 워크스페이스] [--port 3113]');process.exit(2);}options[{'--root':'root','--workspace':'workspace','--port':'port','--skill-dir':'skillDir'}[key]]=key==='--port'?Number(args[++i]):args[++i];}
 if(options.port!==undefined&&(!Number.isInteger(options.port)||options.port<1||options.port>65535)){console.error('포트는 1~65535 사이의 숫자로 지정해주세요.');process.exit(2);}
 startWiki(options).then(({server,url,store})=>{console.log(`내 위키: ${url}\n자료 저장: ${store.root}\n종료: Ctrl+C`);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));}).catch(error=>{console.error(error.code==='EADDRINUSE'?'이미 사용 중인 주소입니다. --port 3114로 다시 실행해주세요.':error.message);process.exit(1);});
}
