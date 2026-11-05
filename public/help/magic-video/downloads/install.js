// Build-time placeholders are replaced by the signed release builder.
(async()=>{'use strict';
async function decompressData(value){
 if(typeof DecompressionStream==='undefined')throw new Error('请使用当前版本 Chrome、Edge 或 Safari');
 const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

const catalog=JSON.parse(await decompressData('H4sIAAAAAAAC/82W30/TUBTH/5WmL7yspT/3K/GB8OaD8dUIWbqujCbbWvsDJYQE42QgjE2zaYTpMgOygDIIaHC48c/sdu2T/4KndBnGbeoIMJMm9/aec3vO95Nz7u0CPidpuqyk8DBOkxRJ4T48JhgSvDIU4ydomqB4WBNUORIVdCliagmwzRqGqofHxw0zKclgI0UlCV5xTTFVMDufC9Zx0d5ddj68RCvL7bM0GEVT06SUOA/2yXsPYCGpxKSEjocfLnjTSEpIuoGTT4hZ1s1D0kVNVg0vuxDaamLYOMY65WP4LMzQRrldKLdL5Va9Dq8Bf/A+BLOb1fZGxvXkCJrXXb/cnv2s0d5/jY5y8FlDiENQ3MvOqlbQ+zWftb5qfarYBxX75Bu4yOJFyLtyUkrFyYk5wRA00phXpTsLY2pCMGYULTm2CI66qaqKZkixiCbpSsJ0c3UV4ZCMik93NEZUTRZBGU1ynA+PyomEnIpHzJRsQBBNemRKuoEv+n7DoMcIhuSJGNODgqWABU0BCJryZLhqg5QKA0+wVHv31W94WqdZlK3Y6dPB+mHTNep3s+nRT5EsF+wBoEsQLTZYP/tv+gPM/6TfzaaPfs4/nH5C5HobAXM7ARoB62pnsb5NAQ9I/qUTrFqh1VyzCjVr/ekUTofpKdyHwcQfDnmzUJj2T+EdmpesnOK5VSq3q8foYNN3w43TDxxD0v7hGocQ+SuB60GGnlc9aj1QRsCBJalhMQSus34Gwxh1hbAkO3SF0APRdM4SkE1hncMkW+nQQLmandkDmWg73c4ve6tWLt9qblkrefSi7N4+sGH7yD7ZQdubTiZr14qXpGYE3RgFIZpkhgUUvOkWss4qdmVpFDQ4kvcPfRWLzO1cRbegP3CVXxFx4FXsKbjgAOOP7+tuUBg4QKDD2C0Bd94Dw6uYkfIIkcwQPB6zhNrv/KAprz34binw3eZww47T1OVfmtsazlIZ1T+i8324mnPWmx3nbd7J5MBgf0lb9TwqHaJ3S1Zp1SqusASPDsHnq4vwsAF7WqdrdqMxFLaJhBwVogI5qSQU7a+QfPhFvj2weJL6A6zpxZ/gVeLiVQwAAA==')),source=await decompressData('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');
// Requests are relative to the administrator's currently logged-in new-api.
// The UI uses the regular session-refresh API; credentials are never exported.
async function installMagicVideo({ api, catalog, source, apiKey, progress = () => {} }) {
  if (typeof apiKey !== 'string' || !/^sk-[A-Za-z0-9_-]{16,}$/.test(apiKey.trim())) throw new Error('请填写完整的本站 API Key');
  apiKey = apiKey.trim();
  const owner = (await api('/api/user/self')).data;
  if (!owner || owner.role < 100) throw new Error('请先登录目标 new-api 的超级管理员账号');
  progress('检查面板兼容性');
  await api('/api/plugin/task');
  const status = (await api('/api/status')).data;
  const currency = status.quota_display_type || 'USD';
  if (!['CNY','USD'].includes(currency)) throw new Error('此安装器支持人民币或美元面板，请先确认面板计价单位');
  const exchange = Number(status.usd_exchange_rate);
  if (!Number.isFinite(exchange) || exchange <= 0) throw new Error('面板缺少有效汇率，无法安全生成定价');
  const query = catalog.models.map(m => 'model='+encodeURIComponent(m.model_name)).join('&');
  // Fail before any write on versions without the atomic pricing API.
  await api('/api/option/model_pricing?'+query);
  progress('验证本站 Key 与模型权限');
  const available = (await api('/api/channel/fetch_models',{method:'POST',body:{type:1,base_url:catalog.api_base_url,key:apiKey}})).data;
  if (!Array.isArray(available) || !catalog.models.every(m=>available.includes(m.model_name))) throw new Error('本站 Key 不可用或缺少部分魔法视频模型权限');
  const name = 'FastAiApi 魔法视频';
  const search = '/api/channel/search?keyword='+encodeURIComponent(name)+'&p=1&page_size=100';
  const candidates = (await api(search)).data.items || [];
  let channel = candidates.find(c => c.name === name && c.base_url?.replace(/\/$/,'') === catalog.api_base_url && JSON.parse(c.setting || '{}').task_plugin_key === 'magic-video');
  if (!channel && candidates.some(c => c.name === name)) throw new Error('已有同名渠道使用其他配置，请先在面板中更名以免覆盖');
  progress('安装视频协议适配插件');
  await api('/api/plugin/task', { method:'POST', body:{source,enabled:true,remark:'FastAiApi 魔法视频一键接入'} });
  let created = false;
  if (!channel) {
    progress('建立待配置渠道');
    await api('/api/channel/', {method:'POST',body:{mode:'single',channel:{type:61,name,status:2,key:apiKey,base_url:catalog.api_base_url,models:catalog.models.map(m=>m.model_name).join(','),group:'default',setting:JSON.stringify({task_plugin_key:'magic-video'}),priority:0,weight:0,auto_ban:0}}});
    channel = (await api(search)).data.items.find(c => c.name === name && c.base_url?.replace(/\/$/,'') === catalog.api_base_url);
    if (!channel) throw new Error('渠道创建后未能读回，请刷新面板检查；安装器不会重复创建');
    created = true;
  }
  progress('自动配置计费与模型');
  const snapshot = (await api('/api/option/model_pricing?'+query)).data;
  const changes=[],custom=[];
  for (const model of catalog.models) {
    const entry = snapshot.entries.find(e=>e.model_name===model.model_name);
    const configured = entry?.configured || {};
    const pricing = {...configured};
    const variants = {...(pricing['billing_setting.plugin_billing_expr'] || {})};
    if (Object.hasOwn(variants,'magic-video')) { custom.push(model.model_name); continue; }
    const price = Number((model.model_price / exchange).toPrecision(12));
    const field=model.billing_unit==='second'?'seconds':'requests';
    const term=`u("${field}") * ${price}`;
    const resolutions=model.supported_resolutions;
    const expression=resolutions.length===1 ? `tier("${resolutions[0]}", u("resolution") == "${resolutions[0]}" ? ${term} : ${term})` : `u("resolution") == "${resolutions[0]}" ? tier("${resolutions[0]}", ${term}) : tier("${resolutions[1]}", ${term})`;
    variants['magic-video']=expression;
    pricing['billing_setting.plugin_billing_expr']=variants;
    if (Object.keys(configured).length===0) {
      pricing['billing_setting.billing_mode']='tiered_expr';
      pricing['billing_setting.billing_expr']=expression;
    }
    changes.push({model_name:model.model_name,expected_version:entry?.version || snapshot.empty_version,pricing});
  }
  if (changes.length) await api('/api/option/model_pricing',{method:'PATCH',body:{changes}});
  for (const model of catalog.models) {
    const metadata = (await api('/api/models/search?keyword='+encodeURIComponent(model.model_name)+'&p=1&page_size=100')).data.items || [];
    if (metadata.some(m=>m.model_name===model.model_name)) continue;
    await api('/api/models/',{method:'POST',body:{model_name:model.model_name,description:model.description,tags:model.tags,icon:model.icon||'',vendor_id:0,status:1,sync_official:0,name_rule:0,endpoints:JSON.stringify({'openai-video':{path:'/v1/videos',method:'POST'}})}});
  }
  if (!created) {
    const updated = {...channel,key:apiKey};
    delete updated.status;
    await api('/api/channel/',{method:'PUT',body:updated});
  }
  // A new channel remains disabled on every earlier failure, including a CAS
  // conflict, model metadata failure, or an expired administrator session.
  progress('启用并核验渠道');
  await api(`/api/channel/${channel.id}/status`,{method:'POST',body:{status:1}});
  const verified=(await api(`/api/channel/${channel.id}`)).data;
  if (!verified || verified.status!==1) throw new Error('渠道尚未启用，请在面板中查看原因');
  return {channelId:channel.id,models:catalog.models.length,currency,preservedCustomPrices:custom};
}

if(location.protocol!=='https:'&&!(location.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)))return alert('请在已登录的 new-api 管理后台点击安装书签');
if(document.getElementById('fastai-magic-install'))return;
const panel=document.createElement('dialog');panel.id='fastai-magic-install';
Object.assign(panel.style,{width:'min(520px,90vw)',padding:'28px',border:'1px solid #9fb7ad',borderRadius:'14px',color:'#163d31',background:'#f9fcfa',font:'15px system-ui'});
const title=document.createElement('h2');title.textContent='FastAiApi 魔法视频 · 一键接入';
const details=document.createElement('p');details.textContent='将安装 11 款视频模型、协议插件和默认计费配置。接口地址已内置；现有自定义价格保留。请填写 tumeiapi.com 的魔法视频分组 Key。';
const input=document.createElement('input');input.type='password';input.autocomplete='new-password';input.placeholder='本站 API Key（sk-…）';input.setAttribute('aria-label','本站 API Key');Object.assign(input.style,{width:'100%',boxSizing:'border-box',padding:'12px',margin:'12px 0'});
const submit=document.createElement('button');submit.textContent='安装并启用';submit.type='button';
const close=document.createElement('button');close.textContent='关闭';close.type='button';close.style.marginLeft='12px';close.onclick=()=>{input.value='';panel.remove();};
const status=document.createElement('p');status.setAttribute('role','status');
panel.append(title,details,input,submit,close,status);document.body.append(panel);panel.showModal();input.focus();
submit.onclick=async()=>{
 const key=input.value.trim();input.value='';submit.disabled=true;close.disabled=true;
 try{
  // Use the panel's normal refresh flow and keep its short-lived access
  // credential only in memory, scoped to same-origin management requests.
  let access='',user={};
  const refresh=await fetch(new URL('/api/user/auth/refresh',location.origin),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});
  if(refresh.ok){const bundle=await refresh.json();access=bundle.data?.access_token||'';user=bundle.data?.user||{};}
  if(!access){try{user=JSON.parse(localStorage.getItem('user')||'{}');}catch{user={};}}

  const api=async(path,{method='GET',body}={})=>{
   if(!path.startsWith('/api/'))throw new Error('安装器只允许调用当前面板的管理 API');
   const response=await fetch(new URL(path,location.origin),{method,credentials:'same-origin',headers:{...(access?{Authorization:'Bearer '+access}:{}),...(user.id?{'New-Api-User':String(user.id)}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   let data;try{data=await response.json();}catch{throw new Error('目标面板不支持所需接口，请使用支持 Task Plugin API v1 的版本');}
   if(!response.ok||data.success===false)throw new Error(data.message||`接口失败：${response.status}`);
   return data;
  };
  const result=await installMagicVideo({api,catalog,source,apiKey:key,progress:text=>status.textContent=text+'…'});
  status.textContent=`接入完成：渠道 #${result.channelId}，${result.models} 款模型。可以直接通过本面板的 /v1/videos 调用。${result.preservedCustomPrices.length?'已保留现有自定义价格。':''}`;
 }catch(error){status.textContent=(key?String(error.message||'安装失败').split(key).join('[已隐藏]'):String(error.message||'安装失败'))+'；新建渠道在配置完成前保持停用，可修复问题后再次运行。';submit.disabled=false;}
 finally{close.disabled=false;}
};
})();
