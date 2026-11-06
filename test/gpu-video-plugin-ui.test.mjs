import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../plugins/zzdh/video_plugin_fastai_magic/ui/app.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../plugins/zzdh/video_plugin_fastai_magic/catalog.json',import.meta.url),'utf8')).models;

test('one plugin adapts modes, FPS and limits when switching GPU and magic models',async()=>{
 const elements=new Map(),saved=new Map();let ready;
 const element=id=>{
  if(!elements.has(id))elements.set(id,{value:'',hidden:false,events:{},children:[],addEventListener(name,callback){this.events[name]=callback;},replaceChildren(...children){this.children=children;this.value=children[0]?.value||'';}});
  return elements.get(id);
 };
 const sdk={saveParam:(key,value)=>saved.set(key,value),onReady:callback=>{ready=callback;},onAction(){},onRequestParams(){},sendAction:async()=>({ok:true,models:catalog})};
 const context={document:{getElementById:element,createElement:()=>({})},window:{PluginSDK:sdk},PluginSDK:sdk,console};
 vm.runInNewContext(source,context);
 ready({api_key:'sk-fixture-only',model:'minimax-h3-u24',duration:5,resolution:'768p',generation_mode:'参考生视频'});
 await new Promise(resolve=>setImmediate(resolve));
 const options=id=>element(id).children.map(x=>x.value);
 assert.deepEqual(options('generation_mode'),['文生视频','参考生视频']);
 assert.equal(element('duration').min,5);
 assert.equal(element('resolution').value,'768p');
 assert.equal(Number(element('fps').value),24);
 element('model').value='wan2.2';element('model').events.change();
 assert.deepEqual(options('generation_mode'),['首帧']);
 assert.deepEqual(options('ratio'),['跟随参考图']);
 assert.equal(Number(element('fps').value),16);
 assert.equal(element('duration').min,1);
 element('model').value='ltx-2.3-avatar';element('model').events.change();
 assert.deepEqual(options('generation_mode'),['数字人']);
 assert.equal(Number(element('fps').value),30);
 element('model').value='minimax-h3-x';element('model').events.change();
 assert.ok(options('generation_mode').includes('首尾帧+参考素材'));
 element('model').value='sd-2-c1';element('model').events.change();
 assert.equal(element('fps-field').hidden,true);
 assert.deepEqual(options('generation_mode'),['文生视频','参考生视频','首尾帧']);
 assert.equal(element('duration').max,10);
 assert.ok(saved.has('model'));
});
