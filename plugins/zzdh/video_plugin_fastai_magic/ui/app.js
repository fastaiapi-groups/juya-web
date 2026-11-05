(()=>{'use strict';
const el=id=>document.getElementById(id);let params={},models=[],ready=false;
const fields=['model','resolution','ratio','duration','duration_source','generation_mode'];
function values(){const data={api_key:el('key').value.trim()};for(const field of fields)data[field]=field==='duration'?Number(el(field).value):el(field).value;return data;}
function save(){if(!ready)return;for(const [key,value]of Object.entries(values()))PluginSDK.saveParam(key,value);}
function options(id,items,preferred){el(id).replaceChildren(...items.map(value=>{const o=document.createElement('option');o.value=o.textContent=String(value);return o;}));if(items.includes(preferred))el(id).value=preferred;}
function update(){const item=models.find(m=>m.model_name===el('model').value);if(!item)return;
 options('resolution',item.supported_resolutions,params.resolution);options('ratio',item.supported_ratios,params.ratio);
 el('model-icon').src=item.model_name==='w3-p-c1'?'assets/alibaba.svg':'assets/jimeng.svg';
 const rule=item.supported_duration;el('duration').min=rule.min;el('duration').max=rule.max;el('duration').value=Math.max(rule.min,Math.min(rule.max,Number(el('duration').value)||rule.min));
 el('details').textContent=`${item.description}${item.tags?' · '+item.tags:''}\n参考售价：¥${item.model_price}/${item.billing_unit==='second'?'秒':'次'}，以当前账单为准`;
}
function apply(data){if(!data?.ok||!Array.isArray(data.models))return;models=data.models;options('model',models.map(m=>m.model_name),params.model||'sd-2-c1');update();}
if(!window.PluginSDK){el('status').textContent='请在字字动画客户端中打开此插件';return;}
for(const field of fields)el(field).addEventListener('change',()=>{if(field==='model')update();params=values();save();});
el('duration').addEventListener('input',save);el('key').addEventListener('change',save);
PluginSDK.onReady(p=>{params=p||{};el('key').value=params.api_key||'';for(const field of ['duration','duration_source','generation_mode'])if(params[field]!==undefined)el(field).value=params[field];ready=true;Promise.resolve(PluginSDK.sendAction('list_models')).then(data=>{if(data)apply(data);}).catch(()=>{el('status').textContent='模型列表加载失败，请重试';});});
if(typeof PluginSDK.onAction==='function'){PluginSDK.onAction('list_models',apply);PluginSDK.onAction('test_connection',data=>{el('status').textContent=data?.ok?'连接成功':data?.error||'连接失败';el('test').disabled=false;});}
if(typeof PluginSDK.onRequestParams==='function')PluginSDK.onRequestParams(values);
el('test').addEventListener('click',async()=>{save();el('test').disabled=true;el('status').textContent='连接中…';try{const data=await PluginSDK.sendAction('test_connection',{api_key:el('key').value.trim()},{timeoutMs:20000});if(data)el('status').textContent=data.ok?'连接成功':data.error||'连接失败';}catch{el('status').textContent='连接失败，请检查 Key 和网络';}finally{el('test').disabled=false;}});
})();
