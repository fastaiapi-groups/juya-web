<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import QRCode from 'qrcode'
import { apiClient } from '../../api/client'
import type { Package, Order, Checkout, ChannelStatus } from './types'
import SupportContact from './SupportContact.vue'
const props = withDefaults(defineProps<{ product?: Package | null; existingOrder?: Order | null; email: string; channelStatus?: ChannelStatus[] }>(), { channelStatus: () => [] })
const emit = defineEmits<{ close: []; paid: [order: Order] }>()
const channel = ref(props.existingOrder?.payment_type || 'alipay'), order = ref<Order | null>(props.existingOrder || null)
const phase = ref<'confirm' | 'loading' | 'qr' | 'waiting' | 'success' | 'expired'>('confirm')
const attempted = ref(false)
const submitting = ref(false), checking = ref(false), error = ref(''), qrImage = ref(''), paused = ref(false)
const modal = ref<HTMLElement | null>(null)
const requestID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `recharge-${Date.now()}-${Math.random().toString(36).slice(2)}`
const controller = new AbortController()
let timer: ReturnType<typeof setTimeout> | undefined, disposed = false, paidEmitted = false, polling = false, pollCount = 0
let previousFocus: Element | null, previousOverflow = ''
const amount = computed(() => ((order.value?.amount_cents ?? props.product?.amount_cents ?? 0) / 100).toFixed(2))
const credit = computed(() => Number(order.value?.credited_credit ?? order.value?.credit ?? props.product?.credit ?? 0))
const title = computed(() => props.product?.name || `${credit.value} 刀额度`)
const channelName = computed(() => channel.value === 'wxpay' ? '微信' : '支付宝')
const channelAvailable = (paymentType: string) => props.channelStatus.find(item => item.payment_type === paymentType)?.available !== false
const copiedOrder = ref(false)
async function copyOrder() {
  if (!order.value) return
  try { await navigator.clipboard.writeText(order.value.id) } catch { const a = document.createElement('textarea'); a.value = order.value.id; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove() }
  copiedOrder.value = true; setTimeout(() => { copiedOrder.value = false }, 1400)
}
function message(e: any) { return e?.response?.data?.message || e?.message || '网络暂时不可用，请稍后重试' }
function close() { if (!submitting.value) emit('close') }
function stopPolling() { polling = false; clearTimeout(timer) }
async function apply(session: Checkout) {
  if (disposed) return
  order.value = session.order; channel.value = session.order.payment_type
  if (session.order.reversed_at || session.state === 'expired' || session.order.gateway_status === 'expired') { phase.value = 'expired'; stopPolling(); return }
  if (session.order.status === 'paid') {
    phase.value = 'success'; error.value = ''; stopPolling()
    if (!paidEmitted) { paidEmitted = true; emit('paid', session.order) }
    return
  }
  if (session.state === 'ready' && session.qr_code) {
    const image = session.qr_kind === 'image' ? session.qr_code : await QRCode.toDataURL(session.qr_code, { width: 280, margin: 2, errorCorrectionLevel: 'M' })
    if (disposed) return
    qrImage.value = image; phase.value = 'qr'; error.value = ''
  } else if (!qrImage.value) phase.value = 'waiting'
}
function startPolling() {
  if (polling || !order.value || phase.value === 'success' || phase.value === 'expired') return
  polling = true; pollCount = 0; paused.value = false
  const tick = async () => {
    if (!polling || disposed || !order.value) return
    try {
      const { data } = await apiClient.get<Checkout>(`/recharge/orders/${encodeURIComponent(order.value.id)}`, { signal: controller.signal, timeout: 12000 })
      await apply(data)
    } catch (e: any) {
      if (disposed) return
      if ((e?.response?.status || e?.status) === 401) { error.value = '登录已过期，请回主站重新登录，再从充值记录继续支付。'; stopPolling(); return }
      error.value = '暂时无法查询到账状态，正在重试；请勿重复付款。'
    }
    if (++pollCount >= 200) { paused.value = true; stopPolling(); return }
    if (polling) timer = setTimeout(tick, 3000)
  }
  timer = setTimeout(tick, 3000)
}
async function submit() {
  if (submitting.value || disposed) return
  attempted.value = true; submitting.value = true; error.value = ''; phase.value = 'loading'
  try {
    if (!order.value) {
      const { data } = await apiClient.post<{ order: Order }>('/recharge/orders', { package_id: props.product!.id, payment_type: channel.value, request_id: requestID }, { signal: controller.signal, timeout: 20000 })
      order.value = data.order
    }
    const { data } = await apiClient.post<Checkout>(`/recharge/orders/${encodeURIComponent(order.value.id)}/checkout`, {}, { signal: controller.signal, timeout: 35000 })
    await apply(data); startPolling()
  } catch (e) {
    if (disposed) return
    phase.value = order.value ? 'waiting' : 'confirm'
    error.value = order.value ? message(e) : '提交结果暂未确认，重试会沿用相同请求，也可稍后在充值记录中查看。'
    if (order.value) startPolling()
  } finally { if (!disposed) submitting.value = false }
}
async function checkPayment() {
  if (!order.value || checking.value) return
  checking.value = true; error.value = ''
  try {
    const { data } = await apiClient.post<Order>(`/recharge/orders/${encodeURIComponent(order.value.id)}/recheck`, {}, { signal: controller.signal, timeout: 20000 })
    await apply({ order: data, state: data.status })
    if (data.status !== 'paid') error.value = '支付结果仍在确认中，请稍候；已付款请勿重复扫码。'
    if (paused.value) startPolling()
  } catch (e) { if (!disposed) error.value = message(e) }
  finally { if (!disposed) checking.value = false }
}
function keydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); close() }
  if (e.key !== 'Tab' || !modal.value) return
  const elements = Array.from(modal.value.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]'))
  const first = elements[0], last = elements[elements.length - 1]
  if (e.shiftKey && (document.activeElement === first || document.activeElement === modal.value)) { e.preventDefault(); last?.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
}
onMounted(async () => {
  previousFocus = document.activeElement; previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
  await nextTick(); modal.value?.focus(); if (props.existingOrder) await submit()
})
onUnmounted(() => {
  disposed = true; stopPolling(); controller.abort(); document.body.style.overflow = previousOverflow
  if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
})
</script>
<template>
  <Teleport to="body"><div class="checkout-backdrop" @click.self="close">
    <section ref="modal" class="checkout-dialog" :class="[`is-${channel}`, `phase-${phase}`]" role="dialog" aria-modal="true" aria-labelledby="checkout-title" tabindex="-1" @keydown="keydown">
      <button class="close" aria-label="关闭充值窗口" :disabled="submitting" @click="close">×</button>
      <template v-if="phase === 'confirm'">
        <header class="hero">
          <span class="eyebrow">确认充值</span>
          <h2 id="checkout-title">{{ title }}</h2>
          <div class="account"><span>充值账号</span><strong>{{ email }}</strong></div>
        </header>
        <div class="content">
          <div class="summary">
            <div><span>到账额度</span><strong>${{ credit }} <small>USD</small></strong></div>
            <div class="total"><span>应付金额</span><strong class="amount"><small>¥</small>{{ amount }}</strong></div>
          </div>
          <fieldset><legend>选择支付方式</legend>
            <label :class="{ selected: channel === 'alipay', offline: !channelAvailable('alipay') }"><input v-model="channel" :disabled="attempted || !channelAvailable('alipay')" type="radio" name="checkout-channel" value="alipay"><i class="alipay">支</i><span>支付宝<small :class="{ warn: !channelAvailable('alipay') }">{{ channelAvailable('alipay') ? '推荐 · 长期稳定' : '当前通道离线' }}</small></span><b aria-hidden="true"></b></label>
            <label :class="{ selected: channel === 'wxpay', offline: !channelAvailable('wxpay') }"><input v-model="channel" :disabled="attempted || !channelAvailable('wxpay')" type="radio" name="checkout-channel" value="wxpay"><i class="wxpay">微</i><span>微信支付<small :class="{ warn: !channelAvailable('wxpay') }">{{ channelAvailable('wxpay') ? '扫码支付' : '当前通道离线' }}</small></span><b aria-hidden="true"></b></label>
          </fieldset>
          <p class="payment-warning" role="note"><strong>请按 ¥{{ amount }} 原价付款，勿修改金额</strong>金额不一致将无法自动到账。</p>
          <div v-if="error" class="error" role="alert">{{ error }}</div>
          <button class="primary" :disabled="submitting" @click="submit">提交订单</button>
          <ul class="trust"><li>服务端核验</li><li>付款后自动到账</li><li>不保存支付账号</li></ul>
          <SupportContact />
        </div>
      </template>
      <template v-else-if="phase === 'success'">
        <div class="content result">
          <div class="success-icon" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg></div>
          <h2 id="checkout-title">充值成功</h2>
          <p>实付 ¥{{ ((order?.paid_amount_cents ?? order?.amount_cents ?? 0) / 100).toFixed(2) }}，<strong>${{ credit }} USD</strong> 额度已自动到账。</p>
          <code>{{ order?.id }}</code>
          <button class="primary" @click="close">完成</button>
        </div>
      </template>
      <template v-else-if="phase === 'expired'">
        <div class="content result">
          <div class="expired-icon" aria-hidden="true">!</div>
          <h2 id="checkout-title">{{ order?.reversed_at ? '订单已退款冲正' : '二维码已过期' }}</h2>
          <p>{{ order?.reversed_at ? '请关闭窗口，在充值记录中查看该订单。' : '请关闭窗口后重新下单。如果已经付款，请勿重复付款，联系客服核对补单。' }}</p>
          <code>{{ order?.id }}</code>
          <button class="primary" @click="close">关闭窗口</button>
          <SupportContact :order-id="order?.id" tone="urgent" />
        </div>
      </template>
      <template v-else>
        <header class="hero pay">
          <span class="eyebrow"><i :class="channel">{{ channel === 'wxpay' ? '微' : '支' }}</i>{{ channelName }}扫码支付</span>
          <h2 id="checkout-title">{{ phase === 'loading' ? '正在生成订单…' : '请扫码完成充值' }}</h2>
          <div class="scan-amount"><small>¥</small>{{ amount }}<span>到账 ${{ credit }} USD</span></div>
          <ol class="steps" aria-label="支付步骤"><li>打开{{ channelName }}扫一扫</li><li>按 ¥{{ amount }} 付款</li><li>自动到账</li></ol>
        </header>
        <div class="content">
          <p class="payment-warning" role="note"><strong>请按 ¥{{ amount }} 原价付款，勿修改金额</strong>金额不一致将无法自动到账。</p>
          <div class="qr-wrap">
            <div v-if="qrImage && phase !== 'loading'" class="qr"><img :src="qrImage" :alt="`${channelName}支付二维码`" width="256" height="256"></div>
            <div v-else class="qr placeholder"><span class="spinner" v-if="submitting"></span><span>{{ submitting ? '正在获取渠道二维码' : '订单正在确认，请稍后重试获取二维码' }}</span></div>
          </div>
          <p v-if="qrImage" class="status"><span class="pulse" aria-hidden="true"></span>等待付款，付款后自动到账，无需刷新页面</p>
          <p v-else class="scan-tip">将保留原订单，不会因重试重复创建渠道订单。</p>
          <div v-if="order" class="order"><span>订单号</span><code>{{ order.id }}</code><button type="button" @click="copyOrder">{{ copiedOrder ? '已复制' : '复制' }}</button></div>
          <p v-if="paused" class="footnote">自动查询已暂停，可点击下方按钮重新确认。</p>
          <div v-if="error" class="error" role="alert">{{ error }}</div>
          <button v-if="!qrImage" class="primary" :disabled="submitting" @click="submit">{{ submitting ? '处理中…' : '重试获取二维码' }}</button>
          <button v-else class="primary" :disabled="checking || submitting" @click="checkPayment">{{ checking ? '正在确认…' : '我已付款，确认到账' }}</button>
          <SupportContact :order-id="order?.id" />
        </div>
      </template>
    </section>
  </div></Teleport>
</template>
<style scoped>
.checkout-backdrop{--accent:#1677ff;--accent-2:#0e5fd8;--accent-soft:#eef5ff;position:fixed;inset:0;z-index:1000;background:#0e1220a3;backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px;color:#191a20;color-scheme:light;font-family:Inter,-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}
.checkout-dialog{position:relative;width:480px;max-width:100%;max-height:calc(100dvh - 48px);overflow:auto;background:#fff;border-radius:24px;box-shadow:0 30px 120px #070b1a59,0 2px 0 #ffffff1a inset;outline:none;animation:rise .28s cubic-bezier(.2,.8,.2,1)}
.checkout-dialog.is-wxpay{--accent:#07c160;--accent-2:#05a14f;--accent-soft:#ecfaf2}
@keyframes rise{from{opacity:0;transform:translateY(14px) scale(.98)}}
.close{position:absolute;right:16px;top:16px;z-index:2;width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:50%;background:#ffffff26;color:#fff;font-size:24px;line-height:1;cursor:pointer;transition:background .15s}.close:hover{background:#ffffff40}
.phase-success .close,.phase-expired .close{background:#f2f3f6;color:#80838d}
.hero{position:relative;padding:30px 30px 26px;color:#fff;background:radial-gradient(120% 140% at 100% 0%,#3a4a72 0%,#1b2238 55%,#131828 100%);overflow:hidden}
.hero::after{content:'';position:absolute;right:-60px;bottom:-90px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,#ffffff14,transparent 70%)}
.hero.pay{background:linear-gradient(150deg,var(--accent) 0%,var(--accent-2) 100%);text-align:center;padding-bottom:22px}
.eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;letter-spacing:.3px;color:#ffffffb8;margin-bottom:8px}
.eyebrow i{width:20px;height:20px;border-radius:6px;font-size:11px;background:#fff;color:var(--accent)}
h2{font-size:24px;letter-spacing:-.4px;margin:0 36px 0 0;line-height:1.3}.hero.pay h2{margin:0;font-size:18px;font-weight:600;color:#ffffffe6}
.account{display:inline-flex;align-items:center;gap:8px;margin-top:16px;padding:6px 12px 6px 6px;border-radius:999px;background:#ffffff14;border:1px solid #ffffff1f;font-size:12px;max-width:100%}.account span{background:#ffffff1f;border-radius:999px;padding:2px 8px;color:#ffffffb3;flex:none}.account strong{font-weight:500;overflow-wrap:anywhere}
.content{padding:22px 26px 24px}
.summary{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:22px}.summary>div{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-radius:14px;background:#f5f7fb;font-size:12px;color:#7b8292}.summary strong{color:#20242e;font-size:20px}.summary small{font-size:11px;color:#979dab;font-weight:500}.summary .total{background:#141927;color:#ffffffa6}.summary .amount{color:#fff;font-size:28px;font-weight:750;letter-spacing:-.5px}.summary .amount small{color:#ffffffb3;font-size:16px;margin-right:2px}
fieldset{border:0;padding:0;margin:0 0 14px;display:grid;grid-template-columns:1fr 1fr;gap:10px}legend{font-size:13px;font-weight:650;margin-bottom:10px;padding:0;color:#30343f}
label{position:relative;display:flex;align-items:center;gap:10px;border:1.5px solid #e5e8ef;border-radius:14px;padding:13px 12px;cursor:pointer;font-size:14px;font-weight:600;color:#262a34;transition:border-color .15s,background .15s,box-shadow .15s}label:hover{border-color:#cdd3df}
label.selected{border-color:var(--accent);background:var(--accent-soft);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 14%,transparent)}
label.offline{opacity:.55;background:#fafafa;cursor:not-allowed}label small{display:block;color:#8d93a0;font-size:11px;font-weight:400;margin-top:3px}label small.warn{color:#d56b58}
input{position:absolute;opacity:0;width:1px;height:1px}label:focus-within{outline:2px solid #367af1;outline-offset:3px}
i{flex:none;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;color:#fff;font-weight:700;font-style:normal;font-size:14px}.alipay{background:#1677ff}.wxpay{background:#07c160}
label b{margin-left:auto;flex:none;width:18px;height:18px;border-radius:50%;border:1.5px solid #c9ced8;transition:all .15s}label.selected b{border-color:var(--accent);background:var(--accent);box-shadow:inset 0 0 0 3px #fff}
.primary{width:100%;border:0;border-radius:14px;background:linear-gradient(180deg,#232838,#161a25);color:#fff;padding:16px;font-size:15px;font-weight:650;cursor:pointer;box-shadow:0 8px 20px #161a2533;transition:transform .12s,box-shadow .12s}.primary:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 12px 26px #161a2540}
.phase-qr .primary,.phase-waiting .primary,.phase-loading .primary{background:linear-gradient(180deg,var(--accent),var(--accent-2));box-shadow:0 8px 20px color-mix(in srgb,var(--accent) 30%,transparent)}
button:disabled{opacity:.45;cursor:not-allowed}
.trust{display:flex;justify-content:center;gap:16px;list-style:none;padding:0;margin:14px 0 0;font-size:11px;color:#9097a5}.trust li::before{content:'✓';color:#22a667;margin-right:4px;font-weight:700}
.payment-warning{display:flex;flex-direction:column;gap:2px;padding:10px 13px;border-radius:11px;background:#fff4f2;border:1px solid #ffd9d2;color:#b4432f;font-size:12px;line-height:1.6;margin:0 0 16px}.payment-warning strong{font-weight:700;color:#a1301d}
.error{padding:11px 14px;background:#fff2f0;color:#b64e3f;border:1px solid #f6d5cf;border-radius:10px;font-size:13px;line-height:1.7;margin:0 0 14px}
.scan-amount{font-size:44px;font-weight:800;letter-spacing:-1.5px;margin:14px 0 4px;line-height:1}.scan-amount small{font-size:22px;margin-right:2px;font-weight:700;opacity:.9}.scan-amount span{display:block;font-size:12px;font-weight:500;letter-spacing:0;margin-top:9px;color:#ffffffc7}
.steps{display:flex;justify-content:center;gap:6px;list-style:none;padding:0;margin:18px 0 0;counter-reset:s;flex-wrap:wrap}.steps li{counter-increment:s;display:flex;align-items:center;gap:6px;font-size:11px;color:#ffffffe0;background:#ffffff1f;border-radius:999px;padding:4px 10px 4px 4px}.steps li::before{content:counter(s);display:grid;place-items:center;width:17px;height:17px;border-radius:50%;background:#fff;color:var(--accent-2);font-weight:700;font-size:10px}
.qr-wrap{position:relative;width:fit-content;margin:4px auto 0;padding:14px;border-radius:20px;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(140deg,var(--accent),#ffffff00 45%,#ffffff00 55%,var(--accent)) border-box;border:2px solid transparent;box-shadow:0 10px 30px #1a213a14}
.qr{width:236px;height:236px;max-width:100%;display:flex;align-items:center;justify-content:center;background:#fff}.qr img{display:block;width:100%;height:100%;object-fit:contain}
.placeholder{flex-direction:column;gap:16px;color:#9299a5;font-size:13px;text-align:center;padding:22px;background:#fafbfd;border-radius:12px}
.status{display:flex;align-items:center;justify-content:center;gap:8px;color:#4e5666;font-size:13px;margin:16px 0 4px}.pulse{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 0 var(--accent);animation:pulse 1.6s infinite}@keyframes pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 55%,transparent)}100%{box-shadow:0 0 0 10px transparent}}
.scan-tip{text-align:center;color:#7b8391;font-size:13px;line-height:1.7;margin:15px 0 4px}
.order{display:flex;align-items:center;justify-content:center;gap:8px;color:#9a9fac;font-size:11px;margin:10px 0 18px;flex-wrap:wrap}.order code{color:#5d6574;background:#f3f5f9;padding:3px 8px;border-radius:6px;overflow-wrap:anywhere}.order button{border:1px solid #e0e4eb;background:#fff;border-radius:6px;padding:3px 9px;font-size:11px;color:#4b5565;cursor:pointer}
.footnote{font-size:12px;color:#9398a4;line-height:1.7;text-align:center;margin:0 0 12px}
code{font-size:11px}
.result{text-align:center;padding-top:40px}.result h2{margin:18px 0 10px}.result p{color:#7a8392;font-size:14px;line-height:1.8;margin:0}.result code{display:inline-block;margin:18px 0 24px;color:#8c93a0;background:#f3f5f9;padding:4px 10px;border-radius:7px;overflow-wrap:anywhere}
.success-icon svg{width:76px;height:76px}.success-icon circle{fill:#eaf9f0;stroke:#22a667;stroke-width:2;stroke-dasharray:151;stroke-dashoffset:151;animation:draw .5s ease-out forwards}.success-icon path{fill:none;stroke:#22a667;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:40;stroke-dashoffset:40;animation:draw .35s .4s ease-out forwards}@keyframes draw{to{stroke-dashoffset:0}}
.expired-icon{display:grid;place-items:center;margin:0 auto;width:72px;height:72px;border-radius:50%;background:#fff4e5;color:#e08a1e;font-size:34px;font-weight:800}
.spinner{width:28px;height:28px;border:3px solid #e1e8f5;border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.checkout-dialog,.pulse,.success-icon *{animation:none!important}.success-icon circle,.success-icon path{stroke-dashoffset:0}}
@media(max-width:540px){.checkout-backdrop{padding:12px}.checkout-dialog{border-radius:20px;max-height:calc(100dvh - 24px)}.hero{padding:24px 20px 20px}.content{padding:18px 16px 20px}h2{font-size:21px}.close{right:12px;top:12px}label{padding:11px 10px;gap:8px;font-size:13px}i{width:28px;height:28px}.scan-amount{font-size:38px}.qr{width:216px;height:216px}.trust{gap:10px;flex-wrap:wrap}}
</style>
