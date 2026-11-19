<script setup lang="ts">
import SiteHeader from '../../components/layout/SiteHeader.vue'
import SiteFooter from '../../components/layout/SiteFooter.vue'
import { installerHref } from '../../utils/hub-links'
const loginDestination='/hub/home/login?redirect='+encodeURIComponent(window.location.pathname+window.location.search)
import {ref,onMounted,computed} from 'vue'
import {apiClient} from '../../api/client'
import ManjuDownloads from './ManjuDownloads.vue'
import type {ClientRelease as Release} from './types'
const admin=window.location.pathname.includes('/admin/')
const initial=new URLSearchParams(location.search).get('product_id')
const product=ref(location.pathname.includes('/downloads/manju')||initial==='xiaoxiao-manju'?'xiaoxiao-manju':'fastaiapi-codexplus')
const isManju=computed(()=>product.value==='xiaoxiao-manju')
const downloadPage=computed(()=>'/hub/home/downloads/'+(isManju.value?'manju':'codexplus'))
const allowed=ref(false),loading=ref(true),busy=ref(false),error=ref(''),notice=ref(''),progress=ref(0)
const releases=ref<Release[]>([]),current=ref<Release|null>(null),installerRelease=ref<Release|null>(null),selected=ref<Release|null>(null)
const version=ref(''),notes=ref(''),mandatory=ref(false),targets=ref(isManju.value?['renderer/any']:['macos/universal','windows/x64']),reason=ref('')
const names:Record<string,string>={'macos/universal':'macOS · Apple 芯片与 Intel','windows/x64':'Windows · 64 位','macos/arm64':'macOS · Apple 芯片','macos/x64':'macOS · Intel','renderer/any':'页面热更新包 · Windows 与 Mac 通用'}
const targetChoices=computed(()=>isManju.value?['macos/arm64','windows/x64','renderer/any']:['macos/universal','macos/arm64','windows/x64'])
const publishedSelection=computed(()=>isManju.value && selected.value?.status==='published')
const editableSelection=computed(()=>isManju.value && ['draft','published'].includes(selected.value?.status||''))
const publicationDate=new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Shanghai'})
const downloads=computed(()=>installerRelease.value||current.value)
const statuses:Record<string,string>={draft:'草稿',ready:'校验通过',published:'已发布',withdrawn:'已撤回'}
const size=(n:number)=>`${(n/1024/1024).toFixed(2)} MB`
const endpoint=(suffix:string)=>`${isManju.value?'/manju-updates/api/client-updates/':'/client-updates/'}${suffix}?product_id=${product.value}`
function message(e:unknown){const v=e as {response?:{data?:{message?:string}},message?:string};return v?.response?.data?.message||v?.message||'操作失败，请稍后重试'}
async function load(){
 const data=(await apiClient.get(endpoint('public'))).data;current.value=data.release;installerRelease.value=data.installer_release||null
 if(admin){allowed.value=(await apiClient.get(endpoint('access'))).data.is_admin===true;if(allowed.value){releases.value=(await apiClient.get(endpoint('admin/releases'))).data;if(selected.value)selected.value=releases.value.find(r=>r.id===selected.value!.id)||null}}
}
async function work(fn:()=>Promise<void>){if(busy.value)return;busy.value=true;error.value='';notice.value='';try{await fn();await load()}catch(e){error.value=message(e)}finally{busy.value=false;progress.value=0}}
onMounted(async()=>{try{await load()}catch(e){error.value=message(e)}finally{loading.value=false}})
async function selectProduct(){selected.value=null;releases.value=[];current.value=null;installerRelease.value=null;mandatory.value=false;version.value='';notes.value='';targets.value=isManju.value?['renderer/any']:['macos/universal','windows/x64'];await work(async()=>{});const url=new URL(location.href);url.searchParams.set('product_id',product.value);history.replaceState(null,'',url)}
async function create(){await work(async()=>{selected.value=(await apiClient.post(endpoint('admin/releases'),{version:version.value,notes:notes.value,required_targets:targets.value,options:{mandatory:isManju.value&&mandatory.value}})).data;notice.value='草稿已创建，请上传选定的更新文件。'})}
async function upload(event:Event,target:string){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file||!selected.value)return;if(!file.size){error.value='请选择非空的更新文件';return}const r=selected.value,[platform,arch]=target.split('/');const prefix=isManju.value?'XiaoxiaoManju':'CodexPlusPlus';const ext=platform==='renderer'?'.zip':platform==='macos'?'.dmg':file.name.toLowerCase().endsWith('.msi')?'.msi':'-setup.exe';const name=`${prefix}-${r.version}-${platform}-${arch}${ext}`;await work(async()=>{if(isManju.value){const upload_id=Array.from(crypto.getRandomValues(new Uint8Array(16)), n=>n.toString(16).padStart(2,'0')).join('');let offset=0;while(offset<file.size){const end=Math.min(offset+8*1024*1024,file.size);const response=(await apiClient.post(endpoint(`admin/releases/${r.id}/assets`),file.slice(offset,end),{params:{platform,arch,name,upload_id,offset,total:file.size},headers:{'Content-Type':'application/octet-stream'},onUploadProgress:e=>{progress.value=Math.round((offset+e.loaded)/file.size*100)}})).data;if(response.next_offset<=offset||response.next_offset>file.size)throw Error('上传进度异常');offset=response.next_offset;if(response.complete)selected.value=response.release}}else{selected.value=(await apiClient.post(endpoint(`admin/releases/${r.id}/assets`),file,{params:{platform,arch,name},headers:{'Content-Type':'application/octet-stream'},onUploadProgress:e=>{progress.value=e.total?Math.round(e.loaded/e.total*100):0}})).data;}notice.value=publishedSelection.value?'文件已替换并重新签名，后续下载将使用新包。':isManju.value?'文件上传完成，可校验后发布。':'安装包上传完成，导出清单后在本机或 CI 签名。'})}
async function saveOptions(){if(!selected.value)return;await work(async()=>{selected.value=(await apiClient.post(endpoint(`admin/releases/${selected.value!.id}/options`),{notes:selected.value!.notes,mandatory:!!selected.value!.options?.mandatory})).data;notice.value=publishedSelection.value?'已更新发布说明与强制更新设置，后续检查将读取新设置。':'发布说明和更新策略已保存。'})}
async function prepare(){if(!selected.value)return;await work(async()=>{selected.value=(await apiClient.post(endpoint(`admin/releases/${selected.value!.id}/options`),{notes:selected.value!.notes,mandatory:!!selected.value!.options?.mandatory})).data;selected.value=(await apiClient.post(endpoint(`admin/releases/${selected.value!.id}/prepare`))).data;notice.value='文件、兼容信息和签名已校验，可以发布。'})}
async function exportManifest(){if(!selected.value)return;await work(async()=>{const {data}=await apiClient.get(endpoint(`admin/releases/${selected.value!.id}/manifest`));const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='client-release-manifest.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice.value='清单已导出。签名后上传 signed.json 校验。'})}
async function validate(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file||!selected.value)return;await work(async()=>{if(file.size>256*1024)throw Error('签名清单过大');selected.value=(await apiClient.post(endpoint(`admin/releases/${selected.value!.id}/validate`),JSON.parse(await file.text()))).data;notice.value='签名与安装包摘要均已通过校验，可以发布。'})}
async function publish(){if(!selected.value)return;await work(async()=>{await apiClient.post(endpoint(`admin/releases/${selected.value!.id}/publish`));notice.value='发布完成，官网和客户端已使用此版本。'})}
async function withdraw(){if(!selected.value)return;await work(async()=>{await apiClient.post(endpoint(`admin/releases/${selected.value!.id}/withdraw`),{reason:reason.value});notice.value='版本已撤回，将停止新的下载与更新。';reason.value=''})}
async function copy(hash:string){try{await navigator.clipboard.writeText(hash);notice.value='SHA-256 已复制'}catch{error.value='复制失败，请手动选择摘要复制'}}
</script>
<template>
<ManjuDownloads v-if="!admin && isManju" :current="current" :downloads="downloads" :loading="loading" :error="error" :notice="notice" @copy="copy" @dismiss="notice=''"/>
<div v-else class="client-release-page">
 <SiteHeader :section="admin?'发布管理':'客户端下载'" :current="admin?undefined:'codexplus'"/>
 <section class="fa-band page-band"><div class="hero"><div><span class="fa-eyebrow">{{admin?'RELEASE CENTER · 管理员':'CODEX++ · 桌面编程'}}</span><h1>{{admin?'客户端版本发布':'把 AI 编程带到你的桌面'}}</h1><p>{{admin?'从草稿到发布，安装包与更新清单统一管理。':'FastAiApi 定制 Codex++。登录即用，模型自动配置，FastAiApi Key 通用。'}}</p><div v-if="!admin" class="hero-actions"><a class="fa-btn fa-btn-mint" href="#downloads">下载安装包 ↓</a><a class="fa-btn hero-ghost" href="/hub/home/help/codex/">查看上手教程 →</a></div></div><span class="version-chip">{{current?'稳定版 v'+current.version:'暂未发布正式版本'}}</span></div></section>
 <main>
  <label v-if="admin" class="product-choice">客户端<select v-model="product" :disabled="busy" @change="selectProduct"><option value="fastaiapi-codexplus">Codex++</option><option value="xiaoxiao-manju">笑笑漫剧</option></select></label>
  <p v-if="loading" class="notice" role="status">正在加载版本信息…</p><p v-if="error" class="notice error" role="alert">{{error}}</p><p v-if="notice" class="notice" role="status">{{notice}}</p>
  <template v-if="!admin">
   <section v-if="downloads" id="downloads" class="download-grid"><article v-for="asset in downloads!.assets.filter(a=>a.platform!=='renderer')" :key="asset.name" class="panel download-card"><span class="platform-icon">{{asset.platform==='macos'?'⌘':'⊞'}}</span><h2>{{names[asset.platform+'/'+asset.arch]}}</h2><p>v{{downloads!.version}} · {{size(asset.size_bytes)}}</p><a class="primary" :href="installerHref(asset.url)">下载安装包 ↓</a><details><summary>文件校验</summary><code>{{asset.sha256}}</code><button @click="copy(asset.sha256)">复制 SHA-256</button></details></article></section>
   <section v-else-if="!loading&&!error" class="panel empty"><h2>客户端安装包准备中</h2><p>正式版本发布后，安装包和版本说明将在这里同步展示。</p></section>
   <ol class="install-steps"><li><span>1</span><div><strong>下载并安装</strong><p>选择你的系统，运行安装包。</p></div></li><li><span>2</span><div><strong>登录 FastAiApi 账号</strong><p>模型服务自动连接，无需手动配置。</p></div></li><li><span>3</span><div><strong>选模型，启动 Codex</strong><p>发一条消息验证，就可以开始了。</p></div></li></ol>
   <section v-if="current" class="panel release-notes"><span class="eyebrow">更新内容</span><h2>v{{current.version}} 更新说明</h2><p>{{current.notes||'本版本包含体验优化与问题修复。'}}</p></section>
   <section class="footnote"><p>旧版用户请先在这里安装一次新版，之后在客户端内自动更新。安装包经过签名，可展开“文件校验”核对 SHA-256。</p><p>需要帮助？查看 <a href="/hub/home/help/codex/">Codex++ 上手教程</a>，或联系客服 QQ 172733456 · 微信 selectthree。</p></section>
  </template>
  <template v-else-if="allowed">
   <section class="admin-grid"><aside class="panel"><div class="panel-heading"><h2>发布记录</h2><span>{{releases.length}} 个版本</span></div><div class="release-list"><button v-for="r in releases" :key="r.id" :class="{active:selected?.id===r.id}" :disabled="busy" @click="selected=r"><strong>v{{r.version}}</strong><span class="status" :class="r.status">{{statuses[r.status]}}</span><small>stable · {{r.assets.length}} 个文件 {{r.options?.mandatory?'· 强制更新':''}}</small><small v-if="r.published_at">发布于 <time :datetime="r.published_at">{{publicationDate.format(new Date(r.published_at))}}</time>（北京时间）</small></button><p v-if="!releases.length" class="muted">还没有发布记录，从创建草稿开始。</p></div></aside>
   <div class="workspace"><form class="panel create-form" @submit.prevent="create"><div class="panel-heading"><h2>创建新版本</h2><span>稳定渠道</span></div><div class="form-content"><label>版本号<input v-model="version" required pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)" placeholder="例如 1.11.3"/></label><label>发布说明<textarea v-model="notes" maxlength="16000" rows="3" placeholder="向用户介绍本次更新"/></label><fieldset><legend>本次发布的平台</legend><label v-for="target in targetChoices" :key="target" class="target"><input type="checkbox" v-model="targets" :value="target"/>{{names[target]}}</label></fieldset><label v-if="isManju" class="target"><input type="checkbox" v-model="mandatory"/>强制更新（不勾选时，用户可以跳过）</label><p v-if="isManju" class="muted">默认只发布页面包，并自动读取桌面兼容信息。若桌面接口有变化，请同时上传完整安装包；只更新页面可单独发布通用 ZIP。</p><button class="primary" :disabled="busy||!targets.length">创建草稿</button></div></form>
   <section v-if="selected" class="panel editor"><div class="panel-heading"><h2>v{{selected.version}}</h2><span class="status" :class="selected.status">{{statuses[selected.status]}}</span></div><div class="form-content"><template v-if="editableSelection"><label>更新记录<textarea :disabled="busy" v-model="selected.notes" rows="4" maxlength="16000"/></label><label class="target"><input v-if="selected.options" type="checkbox" :disabled="busy" v-model="selected.options.mandatory"/>强制更新</label><button :disabled="busy" @click="saveOptions">保存更新记录与策略</button><p v-if="publishedSelection" class="muted">保存设置或完成文件替换后，后续检查更新与下载将使用最新内容。</p></template><p v-else class="notes-preview">{{selected.notes||'暂无发布说明'}}</p><p v-if="isManju && selected.options?.runtime_sha256" class="muted">已读取页面包的桌面兼容信息</p><div v-for="target in selected.required_targets" :key="target" class="asset-row"><div><strong>{{names[target]}}</strong><small>{{selected.assets.find(a=>a.platform+'/'+a.arch===target)?size(selected.assets.find(a=>a.platform+'/'+a.arch===target)!.size_bytes):'等待上传'}}</small></div><label v-if="selected.status==='draft'||publishedSelection" class="upload-button">{{publishedSelection?'替换文件':selected.assets.some(a=>a.platform+'/'+a.arch===target)?'重新上传':'上传更新文件'}}<input type="file" :disabled="busy" :accept="target.startsWith('renderer')?'.zip':target.startsWith('macos')?'.dmg':'.exe,.msi'" @change="upload($event,target)"/></label><span v-else class="status ready">已校验</span></div><progress v-if="busy&&progress" max="100" :value="progress"/>
    <div v-if="isManju && selected.status==='draft'" class="signing"><h3>校验更新文件</h3><p>校验文件摘要、必需平台和页面兼容信息，通过后生成此版本的官方签名。</p><button :disabled="busy||!selected.assets.length" @click="prepare">校验并签名</button></div><div v-if="!isManju && selected.status==='draft'" class="signing"><h3>签名后发布</h3><p>安装包齐备后导出清单，在受信任的本机或 CI 签名，再上传签名清单。私钥无需上传网站。</p><button :disabled="busy||!selected.assets.length" @click="exportManifest">① 导出待签名清单</button><label class="upload-button">② 上传签名清单并校验<input type="file" accept=".json" :disabled="busy" @change="validate"/></label><code>go run scripts/client-release.go sign --key &lt;私钥路径&gt; --manifest client-release-manifest.json --out signed.json</code></div>
    <button v-if="selected.status==='ready'" class="primary" :disabled="busy" @click="publish">发布到官网与客户端</button>
    <div v-if="['ready','published'].includes(selected.status)" class="withdraw"><label>撤回原因<input v-model="reason" maxlength="500" placeholder="填写原因，撤回后停止新的分发"/></label><button :disabled="busy||reason.trim().length<2" @click="withdraw">撤回此版本</button></div>
   </div></section></div></section>
  </template>
  <section v-else-if="admin&&!loading" class="panel empty"><h2>需要管理员权限</h2><p>请先使用本站管理员账号登录后打开版本管理。</p><a class="primary" :href="loginDestination">前往登录</a></section>
 </main><SiteFooter/>
</div>
</template>
<style scoped>
.client-release-page{min-height:100vh;background:var(--fa-paper);color:var(--fa-text);font:15px/1.65 var(--fa-font)}
.client-release-page *{box-sizing:border-box}
a{color:var(--fa-accent);text-decoration:none}
.page-band{padding:64px 24px 72px}
.hero{max-width:1180px;margin:auto;display:flex;justify-content:space-between;gap:24px;align-items:flex-end}
.hero h1{font-size:clamp(32px,4vw,48px);font-weight:700;letter-spacing:-.03em;line-height:1.2;margin:14px 0 12px;color:#fff}
.hero p{margin:0;color:#a9b8b8;font-size:17px;max-width:620px}
.hero-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.hero-actions .fa-btn-mint{color:var(--fa-ink)}
.hero-ghost{color:#e6eeec;border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.03)}
.hero-ghost:hover{background:rgba(255,255,255,.08)}
.version-chip{display:inline-flex;align-items:center;white-space:nowrap;padding:6px 14px;border-radius:99px;background:rgba(139,242,203,.12);border:1px solid rgba(139,242,203,.3);color:var(--fa-mint);font-size:13px;font-weight:600}
main{max-width:1180px;padding:40px 24px 64px;margin:auto}
.eyebrow{font-size:12px;letter-spacing:2px;font-weight:700;color:var(--fa-accent)}
h2{font-size:20px;margin:0}
p{color:var(--fa-muted)}
.status{display:inline-flex;align-items:center;white-space:nowrap;padding:3px 10px;border-radius:99px;background:var(--fa-accent-soft);color:var(--fa-accent-strong);font-size:12px}
.panel{border:1px solid var(--fa-line);border-radius:var(--fa-radius-lg);background:#fff;overflow:hidden}
.notice+.download-grid,.notice+.notice{margin-top:16px}
.download-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
.download-card{padding:30px;box-shadow:var(--fa-shadow);transition:transform .2s}
.download-card:hover{transform:translateY(-3px)}
.platform-icon{display:grid;place-items:center;width:56px;height:56px;border-radius:14px;background:var(--fa-ink);color:var(--fa-mint);font-size:28px;margin-bottom:22px}
.download-card h2{font-size:22px}
.download-card p{font-size:14px;margin:6px 0 0}
.primary{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 20px;border-radius:10px;background:var(--fa-ink);color:#fff;border:0;cursor:pointer;font:inherit;font-weight:600;transition:background .15s}
.primary:hover{background:var(--fa-ink-3)}
.download-card .primary{width:100%;margin:20px 0 6px}
.download-card details{font-size:13px;color:var(--fa-muted);margin-top:10px}
.download-card summary{cursor:pointer}
.download-card code{display:block;overflow-wrap:anywhere;margin:8px 0;font:12px var(--fa-mono);color:var(--fa-body)}
.install-steps{list-style:none;margin:28px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.install-steps li{display:flex;gap:14px;padding:20px;border:1px solid var(--fa-line);border-radius:var(--fa-radius);background:#fff}
.install-steps li>span{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:var(--fa-accent-soft);color:var(--fa-accent);font:700 14px var(--fa-mono)}
.install-steps strong{font-size:15px}
.install-steps p{margin:4px 0 0;font-size:14px}
.release-notes{padding:28px 30px;margin-top:24px}
.release-notes h2{margin-top:8px}
.release-notes p,.notes-preview{white-space:pre-wrap;color:var(--fa-body);line-height:1.9}
.footnote{font-size:14px;padding:24px 0 0}
.footnote p{margin:6px 0}
.notice{padding:13px 16px;border:1px solid var(--fa-accent-line);background:var(--fa-accent-soft);border-radius:10px;color:var(--fa-accent-strong)}
.error{background:var(--fa-danger-soft);border-color:#f3cdb9;color:var(--fa-danger)}
.empty{text-align:center;padding:50px}
.admin-grid{display:grid;grid-template-columns:280px minmax(0,1fr);gap:24px}
.admin-grid aside{align-self:start}
.panel-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:18px 22px;border-bottom:1px solid var(--fa-line)}
.panel-heading h2{font-size:17px}
.panel-heading>span:not(.status){font-size:13px;color:var(--fa-muted)}
.release-list{padding:10px}
.release-list button{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;width:100%;padding:14px;text-align:left;background:transparent;border:1px solid transparent;border-radius:10px;cursor:pointer;color:inherit;font:inherit}
.release-list button:hover{background:var(--fa-paper)}
.release-list button.active{border-color:var(--fa-accent);background:var(--fa-accent-soft)}
.release-list small{width:100%;font-size:12px;color:var(--fa-muted)}
.workspace{display:grid;gap:24px;min-width:0}
.form-content{padding:22px;display:grid;gap:18px}
label{display:grid;gap:7px;font-size:14px;font-weight:500}
input:not([type=checkbox]),textarea,select{width:100%;padding:11px 12px;border:1px solid var(--fa-line);border-radius:10px;font:inherit;color:inherit;background:#fff}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--fa-accent);box-shadow:0 0 0 3px var(--fa-accent-soft)}
textarea{resize:vertical}
fieldset{border:0;padding:0;margin:0}
legend{font-size:14px;margin-bottom:8px}
.target{display:inline-flex;align-items:center;gap:7px;margin-right:18px}
.asset-row{display:flex;gap:16px;justify-content:space-between;align-items:center;padding:14px;border:1px solid var(--fa-line);border-radius:10px}
.asset-row strong{font-size:14px}
.asset-row small{display:block;color:var(--fa-muted);font-size:12px}
.upload-button,button:not(.primary):not(.release-list button){display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--fa-accent-line);background:var(--fa-accent-soft);border-radius:9px;padding:9px 14px;font:inherit;font-size:13px;color:var(--fa-accent-strong);cursor:pointer}
.upload-button{position:relative;overflow:hidden}
.upload-button input{position:absolute;inset:0;opacity:0;cursor:pointer}
.signing{border:1px dashed var(--fa-accent-line);border-radius:12px;padding:18px;display:flex;flex-wrap:wrap;gap:10px}
.signing h3{width:100%;margin:0;font-size:15px}
.signing p{font-size:13px;margin:0 0 6px;width:100%}
.signing code{display:block;overflow-wrap:anywhere;font:12px var(--fa-mono);color:var(--fa-muted)}
.withdraw{border-top:1px solid var(--fa-line);padding-top:18px;display:grid;gap:10px}
.status.draft{background:#eef2f4;color:var(--fa-muted)}
.status.withdrawn{background:var(--fa-danger-soft);color:var(--fa-danger)}
.muted{padding:12px;font-size:13px}
.notes-preview{margin:0;font-size:14px}
button:disabled,input:disabled{opacity:.5;cursor:default}
progress{width:100%;accent-color:var(--fa-accent)}
a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--fa-accent);outline-offset:3px}
.product-choice{display:flex;align-items:center;gap:12px;margin:0 0 20px}
.product-choice select{min-width:180px;width:auto}
@media(max-width:860px){.install-steps{grid-template-columns:1fr}}
@media(max-width:760px){.admin-grid{grid-template-columns:1fr}
.page-band{padding:44px 16px 52px}
.hero{align-items:flex-start;flex-direction:column}
main{padding:28px 16px 48px}
.panel-heading,.form-content{padding:16px}
}
</style>
