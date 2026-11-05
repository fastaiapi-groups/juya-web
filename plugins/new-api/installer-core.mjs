// Requests are relative to the administrator's currently logged-in new-api.
// The UI uses the regular session-refresh API; credentials are never exported.
export async function installMagicVideo({ api, catalog, source, apiKey, progress = () => {} }) {
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
