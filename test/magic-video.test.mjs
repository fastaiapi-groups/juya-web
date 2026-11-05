import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createMagicVideoGateway} from '../server/magic-video.mjs';
const VENDOR_KEY='vendor-fixture-key', USER_KEY='customer-fixture-key';
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0]);
async function server(t, options={}) {
 const events=[];const handle=createMagicVideoGateway({vendorKey:VENDOR_KEY,audit:m=>events.push(m),...options});
 const app=createServer(async(req,res)=>{if(!await handle(req,res,new URL(req.url,'http://localhost').pathname)){res.writeHead(404);res.end();}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 return {url:`http://127.0.0.1:${app.address().port}`,events};
}
function fixtureFetch(log,{visible=true,disabled=false,restricted=false,unsafe=false,expired=false}={}) {
 return async(url, options={})=>{
  log.push({url,options});
  if(url.endsWith('/v1/models'))return Response.json({data:visible?[{id:'sd-2-c1'}]:[{id:'other-model'}]},{status:disabled?401:200});
  if(url.endsWith('/api/usage/token/'))return Response.json({data:{expires_at:expired?1:0,model_limits_enabled:restricted,model_limits:restricted?{'other-model':true}:{}}});
  if(url.includes('/api/get-upload-url'))return Response.json({uploadUrl:unsafe?'https://untrusted.example/upload':'https://minioapi.meaicc.com/upload?signature=private',viewUrl:'https://minioapi.meaicc.com/public.png'});
  if(url.startsWith('https://minioapi.meaicc.com/upload'))return new Response('',{status:200});
  return Response.json({id:'task-1',status:'RUNNING'});
 };
}
const upload=(url,key=USER_KEY,body=png,filename='image.png')=>fetch(url+'/api/magic-video/assets',{method:'POST',headers:{...(key?{Authorization:`Bearer ${key}`} : {}),'X-File-Name':encodeURIComponent(filename),'Content-Type':'application/octet-stream'},body});
test('uploads require live platform authentication and never forward the customer key to storage',async t=>{
 const calls=[];const app=await server(t,{fetchImpl:fixtureFetch(calls)});
 const response=await upload(app.url);assert.equal(response.status,201);assert.deepEqual(await response.json(),{url:'https://minioapi.meaicc.com/public.png'});
 assert.equal(calls[0].options.headers.Authorization,`Bearer ${USER_KEY}`);
 assert.equal(calls[2].options.headers.Authorization,`Bearer ${VENDOR_KEY}`);
 assert.equal(calls[3].options.headers.Authorization,undefined);
 assert(calls.every(c=>c.options.redirect==='error'));
 assert(!app.events.join('\n').includes(USER_KEY));assert(!app.events.join('\n').includes(VENDOR_KEY));
});
for(const [name,options,status]of [['no magic model',{visible:false},403],['disabled token',{disabled:true},401],['restricted token',{restricted:true},403],['expired token',{expired:true},403],['untrusted upload host',{unsafe:true},502]])test('rejects '+name,async t=>{
 const calls=[];const app=await server(t,{fetchImpl:fixtureFetch(calls,options)});assert.equal((await upload(app.url)).status,status);
 assert(!calls.some(c=>c.url.startsWith('https://untrusted.example')));
 assert(!app.events.join('\n').includes(USER_KEY));
});
test('cookies do not authenticate upload or bridge requests',async t=>{
 const calls=[];const app=await server(t,{fetchImpl:fixtureFetch(calls)});
 assert.equal((await upload(app.url,'')).status,401);
 assert.equal((await fetch(app.url+'/api/magic-video/bridge/v1/videos/task-1',{headers:{Cookie:'merchant_session=fixture',Authorization:`Bearer ${USER_KEY}`}})).status,401);
 assert.equal(calls.length,0);
});
test('rejects filenames, content masquerading and oversized uploads',async t=>{
 const app=await server(t,{fetchImpl:fixtureFetch([])});
 assert.equal((await upload(app.url,USER_KEY,png,'../image.png')).status,400);
 assert.equal((await upload(app.url,USER_KEY,Buffer.from('<script>alert(1)</script>'),'image.png')).status,415);
 assert.equal((await upload(app.url,USER_KEY,Buffer.alloc(10*1024*1024+1),'image.png')).status,413);
});
test('polls one provider task at most once per 20 seconds and coalesces concurrent queries',async t=>{
 let now=100000;const calls=[];const app=await server(t,{fetchImpl:fixtureFetch(calls),now:()=>now});
 const query=()=>fetch(app.url+'/api/magic-video/bridge/v1/videos/task-1',{headers:{Authorization:`Bearer ${VENDOR_KEY}`}});
 const results=await Promise.all([query(),query()]);assert(results.every(r=>r.status===200));assert.equal(calls.length,1);
 now+=15000;await query();assert.equal(calls.length,1);
 now+=5001;await query();assert.equal(calls.length,2);
});
test('creation is never retried or cached and channel credentials stay on their fixed recipient',async t=>{
 const calls=[];const app=await server(t,{fetchImpl:fixtureFetch(calls)});
 for(let i=0;i<2;i++)assert.equal((await fetch(app.url+'/api/magic-video/bridge/v1/videos',{method:'POST',headers:{Authorization:`Bearer ${VENDOR_KEY}`},body:'{"model":"sd-2-c1"}'})).status,200);
 assert.equal(calls.length,2);assert(calls.every(c=>c.url==='https://api.meaicc.com/v1/videos'));
 assert.equal((await fetch(app.url+'/api/magic-video/bridge/v1/videos/task%2Fbad',{headers:{Authorization:`Bearer ${VENDOR_KEY}`}})).status,404);
});

test('revocation is checked again after a previously successful upload',async t=>{
 const calls=[];let revoked=false;const upstream=fixtureFetch(calls);
 const app=await server(t,{fetchImpl:async(url,options)=>url.endsWith('/v1/models')&&revoked?new Response('{}',{status:401}):upstream(url,options)});
 assert.equal((await upload(app.url)).status,201);revoked=true;
 assert.equal((await upload(app.url)).status,401);
 assert.equal(calls.filter(c=>c.url.includes('/api/get-upload-url')).length,1);
});
