// Build-time placeholders are replaced by the signed release builder.
(async()=>{'use strict';
const catalog=__CATALOG__,source=__SOURCE__;
__CORE__
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
