<script setup lang="ts">
const loginDestination='/hub/home/login?redirect='+encodeURIComponent(window.location.pathname+window.location.search)
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiClient, getAuthToken } from '../../api/client'
import RechargeAdmin from './RechargeAdmin.vue'
import RechargeStats from './RechargeStats.vue'
import RechargeDialog from './RechargeDialog.vue'
import RechargeOrders from './RechargeOrders.vue'
import RechargeLogs from './RechargeLogs.vue'
import SupportContact from './SupportContact.vue'
import type {Package,Order,Log,ChannelStatus} from './types'
const packages = ref<Package[]>([]), orders = ref<Order[]>([]), logs = ref<Log[]>([])
const tab = ref('products'), busy = ref(false), error = ref(''), notice = ref('')
const balance = ref<string | number>('—'), email = ref(''), authenticated = ref(false), isAdmin = ref(false)
const channelStatus = ref<ChannelStatus[]>([])
let timer: ReturnType<typeof setInterval> | undefined, refreshTimer: ReturnType<typeof setInterval> | undefined
const paidOrders = computed(() => orders.value.filter(o => o.status === 'paid' && !o.reversed_at))
const totalCredit = computed(() => paidOrders.value.reduce((n,o) => n+Number(o.credited_credit ?? o.credit),0))
const pendingCount = computed(() => orders.value.filter(o => o.status === 'pending' && o.gateway_status !== 'expired').length)
const amount = (n: number) => (n / 100).toFixed(2)
function showError(e: any) { error.value = e?.response?.data?.message || e?.message || '请求失败，请稍后重试' }
const offlineChannels = computed(() => channelStatus.value.filter(item => !item.available).map(item => item.payment_type === 'wxpay' ? '微信支付' : '支付宝'))
const allChannelsOffline = computed(() => channelStatus.value.length > 0 && offlineChannels.value.length === channelStatus.value.length)
let refreshSequence=0
async function refresh() {
 const sequence=++refreshSequence, token=getAuthToken()
 let me
 try {me=await apiClient.get('/proxy/me')} catch(e:any) {
  if(sequence===refreshSequence && (e?.response?.status===401 || e?.status===401)){authenticated.value=false;isAdmin.value=false;orders.value=[];logs.value=[];email.value='';balance.value='—'}
  throw e
 }
 const [list,history,access]=await Promise.allSettled([apiClient.get('/recharge/orders'),apiClient.get('/recharge/logs'),apiClient.get('/recharge/access')])
 if(sequence!==refreshSequence || token!==getAuthToken())return
 if(email.value!==me.data.email){orders.value=[];logs.value=[];isAdmin.value=false}
 balance.value=me.data.balance;email.value=me.data.email;authenticated.value=true
 if(list.status==='fulfilled')orders.value=list.value.data;else showError(list.reason)
 if(history.status==='fulfilled')logs.value=history.value.data;else showError(history.reason)
 isAdmin.value=access.status==='fulfilled' && access.value.data.is_admin===true
}

const checkoutOpen = ref(false), selectedProduct = ref<Package | null>(null), selectedOrder = ref<Order | null>(null)
function create(p: Package) {
 if(!authenticated.value){error.value='请先在本站登录后再充值';return}
 selectedProduct.value=p;selectedOrder.value=null;checkoutOpen.value=true
}
function resume(o: Order) {selectedOrder.value=o;selectedProduct.value=null;checkoutOpen.value=true}
async function paymentCompleted() {notice.value='支付成功，余额已自动到账';try{await refresh()}catch{error.value='余额已入账，页面信息暂未刷新，请稍后刷新查看。'}}
async function closeCheckout() {checkoutOpen.value=false;try{await refresh()}catch(e){showError(e)}}
async function checkReturn(id: string) {
  let attempts = 0
  const check = async () => {
    try {
      const { data } = await apiClient.get(`/recharge/orders/${encodeURIComponent(id)}`)
      if (data.order.reversed_at) { notice.value = '该订单已登记退款并完成余额冲正'; clearInterval(timer); await refresh() }
      else if (data.order.status === 'paid') { notice.value = '支付成功，余额已自动到账'; clearInterval(timer); await refresh() }
      else if (++attempts >= 60) { clearInterval(timer); notice.value = '支付确认仍在处理中，请稍后刷新订单。' }
    } catch (e) { clearInterval(timer); showError(e) }
  }
  timer = setInterval(check, 3000); await check()
}
onMounted(async () => {
  try { packages.value = (await apiClient.get('/recharge/packages')).data; channelStatus.value = (await apiClient.get('/recharge/channel-status')).data } catch (e) { showError(e) }
  const token = getAuthToken()
  if (!token) return
  try {
    await refresh()
    if (new URLSearchParams(window.location.search).get('tab') === 'stats' && isAdmin.value) tab.value = 'stats'
    refreshTimer=setInterval(() => {if(document.visibilityState==='visible') refresh().catch(showError)},30000)
    const id = new URLSearchParams(window.location.search).get('order')
    if (id) { tab.value = 'orders'; notice.value = '正在等待支付结果确认…'; await checkReturn(id) }
  } catch (e) { showError(e) }
})
onUnmounted(() => {clearInterval(timer);clearInterval(refreshTimer)})
async function recheck(o: Order) {
  busy.value = true; error.value = ''
  try {
    const { data } = await apiClient.post(`/recharge/orders/${encodeURIComponent(o.id)}/recheck`)
    notice.value = data.status === 'paid' ? '付款已确认，余额已到账' : '支付平台尚未确认付款，请稍后再查'
    await refresh()
  } catch (e) { showError(e) } finally { busy.value = false }
}
async function manualRefresh() { error.value = ''; try { await refresh() } catch (e) { showError(e) } }
</script>

<template>
  <div class="recharge">
    <header class="topbar"><div class="nav">
      <a class="brand" href="/hub/home/recharge"><i aria-hidden="true">$</i>充值中心</a>
      <nav aria-label="充值导航"><button :class="{ active: tab === 'products' }" @click="tab = 'products'">总览</button><button :class="{ active: tab === 'orders' }" @click="tab = 'orders'">充值记录</button><button :class="{ active: tab === 'logs' }" @click="tab = 'logs'">到账日志</button><button v-if="isAdmin" :class="{ active: tab === 'admin' }" @click="tab = 'admin'">充值管理 <small>管理员</small></button><a v-if="isAdmin" class="nav-link" href="/hub/home/admin/recharge-stats">数据统计 <small>管理员</small></a></nav>
      <div class="links"><a v-if="isAdmin" href="/hub/home/admin/client-releases">客户端发布 ↗</a><a href="/hub/home/ui/">返回绘画 ↗</a></div>
    </div></header>
    <main>
      <section class="hero">
        <div class="hero-main">
          <span class="hero-label">当前可用余额</span>
          <strong class="balance">${{ balance }}</strong>
          <div v-if="authenticated" class="identity"><span class="email">{{ email }}</span><span class="role">{{ isAdmin ? '管理员账号' : '仅显示我的数据' }}</span><button class="refresh" @click="manualRefresh">刷新 ↻</button></div>
          <div v-else class="identity"><span class="email">登录后即可充值并查看记录</span><a class="login" :href="loginDestination">登录后充值 →</a></div>
        </div>
        <div class="hero-stats">
          <div><span>最近订单到账额度</span><strong>${{ Number(totalCredit.toFixed(8)) }}</strong></div>
          <div><span>已到账订单</span><strong>{{ paidOrders.length }}<small>笔</small></strong></div>
          <div><span>待支付订单</span><strong>{{ pendingCount }}<small>笔</small></strong></div>
        </div>
      </section>
      <div v-if="error" class="alert error" role="alert">{{ error }}<button @click="error = ''">关闭</button></div><div v-if="notice" class="alert" role="status">{{ notice }}<button @click="notice = ''">关闭</button></div>
      <div v-if="offlineChannels.length" class="channel-alert" role="status"><span class="channel-alert-icon">!</span><div><strong>{{ allChannelsOffline ? '支付通道暂时离线' : '部分支付通道暂时离线' }}</strong><small>{{ offlineChannels.join('、') }}当前不可用，请选择在线通道或稍后重试。</small></div><button @click="manualRefresh">重新检测</button></div>
      <template v-if="tab === 'products'">
        <section class="block">
          <div class="block-head"><div><h2>选择充值套餐</h2><p>支付宝 / 微信扫码 · 服务端核验 · 付款后自动到账</p></div></div>
          <div class="products">
            <article v-for="p in packages" :key="p.id" class="package">
              <div class="package-credit"><strong>${{ Number(p.credit) }}</strong><small>API 额度</small></div>
              <div class="package-price">支付 <b>¥{{ amount(p.amount_cents) }}</b></div>
              <button :disabled="busy || !authenticated || allChannelsOffline" :aria-label="`立即充值 ${p.name}`" @click="create(p)">{{ allChannelsOffline ? '通道离线' : '立即充值' }}</button>
            </article>
          </div>
          <ol class="steps"><li><b>选择套餐</b><span>确认充值账号与金额</span></li><li><b>扫码付款</b><span>按订单金额原价支付</span></li><li><b>自动到账</b><span>渠道确认后即时入账</span></li></ol>
          <p class="payment-warning" role="note"><strong>支付金额必须与下单金额一致，否则无法自动到账。</strong>请勿修改扫码后的付款金额；已支付但未到账，请保留交易单号并联系客服核对，勿重复付款。</p>
        </section>
        <div class="workspace">
          <section class="block flush"><div class="block-head"><h2>我的充值记录 <b>{{ orders.length }}</b></h2><button class="text-button" @click="tab='orders'">查看全部 →</button></div><RechargeOrders :orders="orders" :busy="busy" :page-size="3" @resume="resume" @recheck="recheck"/></section>
          <section class="block flush"><div class="block-head"><h2>我的到账日志 <b>{{ logs.length }}</b></h2><button class="text-button" @click="tab='logs'">查看全部 →</button></div><RechargeLogs :logs="logs" :page-size="3"/></section>
        </div>
        <SupportContact class="page-support" />
      </template>
      <RechargeAdmin v-else-if="tab === 'admin' && isAdmin"/>
      <RechargeStats v-else-if="tab === 'stats' && isAdmin"/>
      <section v-else class="block flush"><div class="block-head"><h2>{{ tab === 'orders' ? '我的充值记录' : '我的到账日志' }}</h2><span class="hint">仅当前账号 · 最近 100 条 · 分页展示</span></div><p v-if="!authenticated" class="empty">请先登录以查看自己的记录。</p><RechargeOrders v-else-if="tab==='orders'" :orders="orders" :busy="busy" :page-size="8" @resume="resume" @recheck="recheck"/><RechargeLogs v-else :logs="logs" :page-size="8"/></section>
      <footer>渠道确认订单支付成功后自动入账。普通用户仅可查看自己的订单；充值管理仅管理员可用。<span>技术交流 QQ 群：48878665</span></footer>
    </main><RechargeDialog v-if="checkoutOpen" :product="selectedProduct" :existing-order="selectedOrder" :email="email" :channel-status="channelStatus" @close="closeCheckout" @paid="paymentCompleted"/>
  </div>
</template>
<style scoped>
.recharge{--ink:#1c2333;--muted:#76819a;--line:#e6eaf2;--brand:#2f6bff;--brand-2:#5b4dff;min-height:100vh;background:radial-gradient(1200px 420px at 50% -120px,#e3ebff 0%,#f5f7fc 60%) #f5f7fc;color:var(--ink);color-scheme:light;font-family:Inter,-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}
.recharge button{font:inherit;cursor:pointer}.recharge button:disabled{opacity:.45;cursor:not-allowed}a{text-decoration:none;color:inherit}
.topbar{position:sticky;top:0;z-index:20;background:#ffffffd9;backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--line)}
.nav{max-width:1200px;margin:auto;display:flex;align-items:center;gap:28px;height:60px;padding:0 24px}
.brand{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:750;white-space:nowrap}.brand i{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff;font-style:normal;font-weight:800;box-shadow:0 6px 14px #2f6bff40}
nav{display:flex;align-items:center;gap:4px;padding:4px;background:#f1f4fa;border-radius:12px}
nav button,nav .nav-link{border:0;background:transparent;color:#5d6880;padding:7px 14px;border-radius:9px;font-size:13px!important;white-space:nowrap;transition:background .15s,color .15s}
nav button:hover,nav .nav-link:hover{color:var(--ink)}nav button.active{background:#fff;color:var(--brand);font-weight:650;box-shadow:0 1px 3px #1c23331f}nav small{font-size:10px;margin-left:3px;color:#9aa3b5}
.links{margin-left:auto;display:flex;gap:18px;font-size:12px;color:var(--muted);white-space:nowrap}.links a:hover{color:var(--brand)}
main{max-width:1200px;margin:auto;padding:24px 24px 0}
.hero{position:relative;display:grid;grid-template-columns:1.1fr 1fr;gap:24px;align-items:center;padding:28px 32px;border-radius:22px;color:#fff;background:linear-gradient(125deg,#1f3fd1 0%,#3b5bff 45%,#6a4dff 100%);box-shadow:0 20px 50px #2f4bd833;overflow:hidden;margin-bottom:18px}
.hero::before{content:'';position:absolute;right:-80px;top:-120px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,#ffffff2e,transparent 65%)}
.hero::after{content:'';position:absolute;left:30%;bottom:-160px;width:420px;height:300px;border-radius:50%;background:radial-gradient(circle,#ffffff14,transparent 70%)}
.hero-main{position:relative;z-index:1;min-width:0}.hero-label{font-size:13px;color:#ffffffbf}
.balance{display:block;font-size:46px;font-weight:800;letter-spacing:-1.5px;margin:6px 0 14px;line-height:1.05;overflow-wrap:anywhere}
.identity{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px}.email{color:#ffffffe6;overflow-wrap:anywhere}
.role{padding:3px 9px;border-radius:999px;background:#ffffff26;font-size:11px}
.refresh{border:1px solid #ffffff47;background:#ffffff1a;color:#fff;border-radius:999px;padding:5px 12px;font-size:12px!important}.refresh:hover{background:#ffffff33}
.login{background:#fff;color:#2f4bd8;font-weight:650;border-radius:999px;padding:7px 16px;font-size:13px}
.hero-stats{position:relative;z-index:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.hero-stats>div{padding:14px 16px;border-radius:16px;background:#ffffff1f;border:1px solid #ffffff2e;backdrop-filter:blur(6px);display:flex;flex-direction:column;gap:8px;min-width:0}
.hero-stats span{font-size:11px;color:#ffffffbf}.hero-stats strong{font-size:22px;font-weight:750;letter-spacing:-.5px;overflow-wrap:anywhere}.hero-stats small{font-size:11px;font-weight:500;margin-left:3px;color:#ffffffbf}
.block{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px 24px;margin-bottom:18px;box-shadow:0 1px 2px #1c233308;min-width:0}
.block.flush{padding:0;overflow:hidden;margin-bottom:0}
.block-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.flush .block-head{padding:16px 20px;margin:0;border-bottom:1px solid #eef1f6}
.block-head h2{font-size:17px;margin:0;letter-spacing:-.2px}.flush .block-head h2{font-size:15px}.block-head h2 b{font-size:11px;background:#eef2fa;color:#6c7891;padding:2px 7px;border-radius:6px;font-weight:600;margin-left:6px;vertical-align:2px}
.block-head p{margin:5px 0 0;font-size:12px;color:var(--muted)}.hint{font-size:12px;color:var(--muted)}
.text-button{border:0;background:transparent;color:var(--brand);padding:0;font-size:12px!important;font-weight:600}
.products{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
.package{position:relative;display:flex;flex-direction:column;gap:14px;padding:20px 18px 18px;border:1.5px solid var(--line);border-radius:16px;background:linear-gradient(180deg,#fff,#fafbff);transition:transform .18s,border-color .18s,box-shadow .18s}
.package:hover{transform:translateY(-3px);border-color:#a9bdff;box-shadow:0 14px 30px #2f6bff1f}
.package-credit strong{display:block;font-size:34px;font-weight:800;letter-spacing:-1px;line-height:1;background:linear-gradient(135deg,#1f3fd1,#6a4dff);-webkit-background-clip:text;background-clip:text;color:transparent}
.package-credit small{display:block;margin-top:6px;font-size:12px;color:var(--muted)}
.package-price{font-size:13px;color:var(--muted);padding-top:12px;border-top:1px dashed #e3e8f1}.package-price b{color:var(--ink);font-size:17px;margin-left:2px}
.package button{border:0;border-radius:11px;padding:11px;font-size:14px!important;font-weight:650;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2));box-shadow:0 8px 18px #2f6bff33;transition:filter .15s}.package button:hover:not(:disabled){filter:brightness(1.07)}
.package button:disabled{background:#c9d1e2;box-shadow:none}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;list-style:none;padding:0;margin:20px 0 14px;counter-reset:s}
.steps li{counter-increment:s;display:flex;flex-direction:column;gap:3px;padding:12px 14px 12px 50px;position:relative;border-radius:12px;background:#f6f8fc}
.steps li::before{content:counter(s);position:absolute;left:14px;top:50%;transform:translateY(-50%);width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#e4ebff;color:var(--brand);font-weight:750;font-size:13px}
.steps b{font-size:13px}.steps span{font-size:11px;color:var(--muted)}
.payment-warning{margin:0;padding:11px 14px;border:1px solid #ffd7d2;border-radius:12px;background:#fff5f3;color:#b4432f;font-size:12px;line-height:1.7}.payment-warning strong{font-weight:700;margin-right:4px}
.workspace{display:grid;grid-template-columns:1.25fr 1fr;gap:18px;margin-bottom:18px}
.page-support{margin:0 0 6px;background:#fff}
.channel-alert{display:flex;align-items:center;gap:10px;border:1px solid #f4d39a;background:linear-gradient(135deg,#fffaf0,#fff4df);color:#8d5b18;border-radius:14px;font-size:12px;padding:12px 16px;margin:0 0 18px}.channel-alert-icon{display:grid;place-items:center;flex:none;width:24px;height:24px;border-radius:50%;background:#f4b84a;color:#fff;font-weight:700}.channel-alert strong{display:block;font-size:13px}.channel-alert small{display:block;color:#a77737;margin-top:3px}.channel-alert button{margin-left:auto;border:1px solid #e7bc6b;background:#fff8e9;color:#8d5b18;border-radius:8px;padding:6px 11px;font-size:12px}
.alert{display:flex;justify-content:space-between;align-items:center;border:1px solid #cfe0ff;background:#eef5ff;color:#2f5a96;border-radius:14px;font-size:13px;padding:12px 16px;margin:0 0 18px;gap:12px}.alert button{color:inherit;border:0;background:transparent;font-size:12px}.error{background:#fff2ef;border-color:#f6d2cb;color:#b14a3c}
.empty{color:#8997aa;text-align:center;padding:40px;font-size:13px;margin:0}
footer{font-size:11px;color:#97a1b3;display:flex;justify-content:space-between;gap:14px;padding:20px 0 28px;line-height:1.6}
@media(max-width:960px){.hero{grid-template-columns:1fr;padding:24px}.workspace{grid-template-columns:1fr}.links{display:none}}
@media(max-width:680px){main{padding:14px 14px 0}.nav{height:auto;flex-wrap:wrap;gap:10px;padding:10px 14px}nav{order:3;width:100%;overflow-x:auto}nav button,nav .nav-link{padding:7px 10px;font-size:12px!important;flex:1}
.hero{padding:20px;border-radius:18px;gap:16px}.balance{font-size:36px}.hero-stats{gap:8px}.hero-stats>div{padding:10px 11px;border-radius:12px}.hero-stats strong{font-size:17px}.hero-stats span{font-size:10px}
.block{padding:18px 16px;border-radius:16px}.products{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.package{padding:16px 14px 14px;gap:11px}.package-credit strong{font-size:28px}.steps{grid-template-columns:1fr;gap:8px}.flush .block-head{padding:14px 16px}footer{flex-direction:column;gap:4px}}
</style>
