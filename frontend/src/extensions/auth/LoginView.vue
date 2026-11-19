<script setup lang="ts">
import SiteHeader from '../../components/layout/SiteHeader.vue'
import { ref, onMounted } from 'vue'
const emit=defineEmits<{authenticated:[path:string]}>()
const email=ref(''),password=ref(''),code=ref(''),temporary=ref(''),error=ref(''),busy=ref(false),ready=ref(false),captcha=ref(false)
const candidate=(new URLSearchParams(location.search).get('redirect')||'/hub/home/recharge').replace(/^\/fastaiui(?=\/)/,'/hub/home')
const destination=/^\/(?:fastaiui|hub\/home)\/(?!\/)/.test(candidate)&&!/[\\\r\n]/.test(candidate)&&!candidate.startsWith('/hub/home/login')?candidate:'/hub/home/recharge'
const canonicalLogin='https://fastaiapi.cloud/login?redirect='+encodeURIComponent(destination)
async function request(path:string,body?:unknown){
 const response=await fetch('/hub/home/auth/'+path,{method:body?'POST':'GET',credentials:'omit',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})})
 const data=await response.json()
 if(!response.ok||typeof data.code==='number'&&data.code!==0)throw Error(data.message||data.error||'登录失败，请稍后重试')
 return data.data??data
}
onMounted(async()=>{try{const settings=await request('settings');captcha.value=settings.turnstile_enabled===true||settings.tencent_captcha_enabled===true||settings.aliyun_captcha_enabled===true;ready.value=true}catch{error.value='暂时无法连接账号服务，请稍后重试。'}})
async function login(){
 if(busy.value||!ready.value||captcha.value)return
 busy.value=true;error.value=''
 try{
  const data=await request(temporary.value?'login/2fa':'login',temporary.value?{temp_token:temporary.value,totp_code:code.value}:{email:email.value,password:password.value})
  password.value=''
  if(data.requires_2fa===true){if(!data.temp_token)throw Error('两步验证暂不可用，请重新登录');temporary.value=data.temp_token;return}
  if(typeof data.access_token!=='string'||!data.access_token)throw Error('登录响应无效，请重新登录')
  // Existing console bearer-token scheme; business records stay on the server.
  localStorage.setItem('auth_token',data.access_token)
  if(data.user)localStorage.setItem('auth_user',JSON.stringify(data.user))
  temporary.value='';code.value='';emit('authenticated',destination)
 }catch(e){error.value=e instanceof Error?e.message:'登录失败，请稍后重试'}finally{busy.value=false}
}
</script>
<template>
 <div class="website-login"><SiteHeader section="账户中心" current="login"><span></span></SiteHeader><main><section><small>账户中心</small><h1>登录官网</h1><p>使用原官网账号登录，继续充值或管理客户端发布。</p>
 <p v-if="error" role="alert">{{error}}</p>
 <template v-if="captcha"><p>当前账号服务需要安全验证，请在主站完成登录。</p><a :href="canonicalLogin">前往主站验证登录 →</a></template>
 <form v-else @submit.prevent="login"><template v-if="!temporary"><label>邮箱<input v-model="email" type="email" autocomplete="username" required maxlength="254"/></label><label>密码<input v-model="password" type="password" autocomplete="current-password" required maxlength="128"/></label></template><label v-else>两步验证码<input v-model="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required/></label><button :disabled="busy||!ready">{{busy?'正在登录…':temporary?'验证并登录':'登录'}}</button></form>
 <a class="website-login-back" href="/hub/home/">← 返回官网首页</a></section><p class="website-login-note">三个入口使用同一账号服务与权限，请在当前入口登录。</p></main></div>
</template>
<style scoped>
.website-login{min-height:100vh;background:radial-gradient(900px 420px at 50% -10%,var(--fa-accent-soft),transparent 70%),var(--fa-paper);color:var(--fa-text);font-family:var(--fa-font);color-scheme:light;box-sizing:border-box}
.website-login main{padding:56px 20px 64px}
.website-login section{max-width:420px;margin:0 auto 20px;padding:36px;background:#fff;border:1px solid var(--fa-line);border-radius:var(--fa-radius-lg);box-shadow:var(--fa-shadow)}
.website-login small{display:inline-block;color:var(--fa-accent);font-size:12px;font-weight:700;letter-spacing:2px}
.website-login h1{font-size:30px;letter-spacing:-.02em;margin:10px 0 6px}
.website-login p{font-size:15px;line-height:1.75;color:var(--fa-muted);margin:0 0 4px}
.website-login [role=alert]{color:var(--fa-danger);background:var(--fa-danger-soft);border-radius:10px;padding:10px 12px;margin-top:14px}
.website-login label{display:block;font-size:14px;font-weight:600;margin-top:20px}
.website-login input{box-sizing:border-box;width:100%;height:46px;padding:0 14px;border:1px solid var(--fa-line);border-radius:10px;margin-top:8px;font:inherit;background:#fff;color:var(--fa-text)}
.website-login input:focus{outline:none;border-color:var(--fa-accent);box-shadow:0 0 0 3px var(--fa-accent-soft)}
.website-login button{margin:26px 0 18px;width:100%;height:48px;background:var(--fa-ink);color:#fff;border:0;border-radius:10px;font:600 15px var(--fa-font);cursor:pointer;transition:background .15s}
.website-login button:hover:not(:disabled){background:var(--fa-ink-3)}
.website-login button:disabled{opacity:.5;cursor:wait}
.website-login section>a{color:var(--fa-accent);font-weight:600}
.website-login-back{font-size:14px}
.website-login-note{text-align:center;font-size:13px!important}
@media(max-width:480px){.website-login main{padding-top:32px}.website-login section{padding:26px 22px}}
</style>
