import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSubmitRequest as standard} from '../plugins/new-api/plugin.js';
import {buildSubmitRequest as compatible} from '../plugins/gpu-video/comfyui-video.js';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const catalog=JSON.parse(read('plugins/zzdh/video_plugin_fastai_magic/catalog.json'));
const examples=JSON.parse(read('plugins/magic-video/examples.json'));

test('published page lists all public models with model-specific examples and no provider details',()=>{
 const page=read('public/help/magic-video/index.html');
 assert.equal(catalog.models.length,22);
 for(const model of catalog.models)assert.ok(page.includes(`data-public-model="${model.model_name}"`),model.model_name);
 for(const file of ['public/help/magic-video/index.html','public/help/magic-video/gpu-video-api.md','public/help/magic-video/acceptance-20261106.md','plugins/gpu-video/README.md','plugins/zzdh/video_plugin_fastai_magic/catalog.json']){
  assert.doesNotMatch(read(file),/meaicc|autodl|xiangong|仙宫|zealman|Go Wrapper|seetacloud|fastai-comfy-gateway|comfy\.fastaiapi/i,file);
 }
 assert.ok(page.includes('fastai-video-zzdh-1.1.1.zip'));
});

test('every documented creation example passes its actual protocol adapter without a routing field',()=>{
 assert.equal(examples.length,18);
 for(const example of examples){
  const body=example.body,build=example.format==='standard'?standard:compatible;
  assert.equal(body.channel,undefined);assert.equal(body.metadata?.channel,undefined);
  const request=build({model:body.model,upstreamModel:body.model,requestBody:body,baseUrl:'https://tumeiapi.com',apiKey:'sk-fixture-only',upstream:{kind:'new_api'},files:[]});
  assert.equal(request.url,'https://tumeiapi.com/v1/videos',example.id);
  assert.equal(request.body.model,body.model,example.id);
 }
});

test('downloaded profile only addresses the public service and strips private response metadata',()=>{
 const result=compatible({model:'minimax-h3-u24',upstreamModel:'minimax-h3-u24',requestBody:{prompt:'test',seconds:5,size:'864x480'},baseUrl:'https://tumeiapi.com',apiKey:'sk-fixture',upstream:{kind:'new_api'},files:[]});
 assert.equal(result.body.channel,undefined);
 const code=read('plugins/gpu-video/comfyui-video.js');
 assert.doesNotMatch(code,/meaicc|autodl|xiangong|仙宫|zealman|wrapper|seetacloud|fastai-comfy-gateway|comfy\.fastaiapi/i);
});
