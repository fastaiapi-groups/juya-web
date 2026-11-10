<script setup lang="ts">
import { ref, onMounted } from 'vue'
const emit=defineEmits<{authenticated:[path:string]}>()
const email=ref(''),password=ref(''),code=ref(''),temporary=ref(''),error=ref(''),busy=ref(false),ready=ref(false),captcha=ref(false)
const candidate=new URLSearchParams(location.search).get('redirect')||'/fastaiui/recharge'
const destination=/^\/fastaiui\/(?!\/)/.test(candidate)&&!/[\\\r\n]/.test(candidate)&&!candidate.startsWith('/fastaiui/login')?candidate:'/fastaiui/recharge'
const canonicalLogin='https://fastaiapi.cloud/login?redirect='+encodeURIComponent(destination)
async function request(path:string,body?:unknown){
 const response=await fetch('/fastaiapi/website-auth/'+path,{method:body?'POST':'GET',credentials:'omit',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})})
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
 <main class="website-login"><a href="/hub/home/" class="website-login-brand">FastAiApi</a><section><small>账户中心</small><h1>登录官网</h1><p>使用原官网账号，继续充值或管理客户端发布。</p>
 <p v-if="error" role="alert">{{error}}</p>
 <template v-if="captcha"><p>当前账号服务需要安全验证，请在主站完成登录。</p><a :href="canonicalLogin">前往主站验证登录 →</a></template>
 <form v-else @submit.prevent="login"><template v-if="!temporary"><label>邮箱<input v-model="email" type="email" autocomplete="username" required maxlength="254"/></label><label>密码<input v-model="password" type="password" autocomplete="current-password" required maxlength="128"/></label></template><label v-else>两步验证码<input v-model="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required/></label><button :disabled="busy||!ready">{{busy?'正在登录…':temporary?'验证并登录':'登录'}}</button></form>
 <a class="website-login-back" href="/fastaiui/downloads/manju">返回软件下载</a></section><footer>三个入口使用同一账号服务与权限；请在当前入口登录。</footer></main>
</template>
<style scoped>
.website-login{min-height:100vh;background:#f5f7f2;color:#29382b;padding:44px 24px;font-family:system-ui,sans-serif;box-sizing:border-box}.website-login-brand{font-size:22px;font-weight:700;text-decoration:none;color:#294b37}.website-login section{max-width:410px;margin:64px auto 30px;padding:36px;background:white;border:1px solid #e4eadd;border-radius:16px}.website-login small{color:#6b8268}.website-login h1{font-size:28px;margin:10px 0}.website-login p{font-size:14px;line-height:1.8;color:#697664}.website-login [role=alert]{color:#a83939}.website-login label{display:block;font-size:14px;margin-top:20px}.website-login input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #d5ddce;border-radius:7px;margin-top:8px;font:inherit}.website-login button{margin:24px 0 20px;width:100%;padding:13px;background:#294b37;color:white;border:0;border-radius:7px;font:inherit;cursor:pointer}.website-login button:disabled{opacity:.5;cursor:wait}.website-login-back,.website-login footer{font-size:13px;color:#697664}.website-login footer{text-align:center}.website-login a{color:#294b37}@media(max-width:480px){.website-login section{padding:24px;margin-top:40px}}
</style>
