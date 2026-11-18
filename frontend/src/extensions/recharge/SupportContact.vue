<script setup lang="ts">
import { ref } from 'vue'
import { SUPPORT_ADD_URL, SUPPORT_AVAILABLE, SUPPORT_QR, SUPPORT_WECHAT_ID } from './support'
const props = defineProps<{ orderId?: string; tone?: 'default' | 'urgent' }>()
const open = ref(false), copied = ref('')
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
// Inside WeChat the card link opens "add friend"; on phones elsewhere, save the code and scan it from the album.
const inWeChat = /MicroMessenger/i.test(ua)
const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
async function copy(text: string, key: string) {
  try { await navigator.clipboard.writeText(text) } catch { const a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove() }
  copied.value = key; setTimeout(() => { if (copied.value === key) copied.value = '' }, 1400)
}
</script>
<template>
  <div v-if="SUPPORT_AVAILABLE" class="support" :class="[props.tone || 'default', { open }]">
    <button type="button" class="toggle" :aria-expanded="open" @click="open = !open">
      <span class="dot" aria-hidden="true">?</span>
      <span class="label"><strong>付款遇到问题？</strong><small>扣款未到账、二维码打不开，加客服微信处理</small></span>
      <span class="chev" aria-hidden="true">{{ open ? '收起' : '联系客服' }}</span>
    </button>
    <div v-if="open" class="body">
      <figure v-if="SUPPORT_QR"><img :src="SUPPORT_QR" alt="客服微信二维码" width="168" height="214"><figcaption>微信扫一扫，添加客服<br><b>此码仅用于联系，不能付款</b></figcaption></figure>
      <div class="info">
        <a v-if="inWeChat && SUPPORT_ADD_URL" class="add" :href="SUPPORT_ADD_URL">加我为好友</a>
        <template v-else-if="mobile && SUPPORT_QR"><a class="add" :href="SUPPORT_QR" download="客服微信二维码.jpg">保存二维码</a><p class="how">保存后打开微信「扫一扫」，点右上角「相册」选择这张图片即可添加</p></template>
        <p v-else-if="SUPPORT_QR" class="how">用手机微信扫一扫左侧二维码添加</p>
        <p v-if="inWeChat && SUPPORT_QR" class="how">也可以长按二维码，选择「识别图中的二维码」</p>
        <p v-if="SUPPORT_WECHAT_ID">微信号 <code>{{ SUPPORT_WECHAT_ID }}</code><button type="button" @click="copy(SUPPORT_WECHAT_ID, 'id')">{{ copied === 'id' ? '已复制' : '复制' }}</button></p>
        <p v-if="props.orderId">添加时请发送订单号<code class="order">{{ props.orderId }}</code><button type="button" @click="copy(props.orderId!, 'order')">{{ copied === 'order' ? '已复制' : '复制订单号' }}</button></p>
        <p class="tip">已付款请勿重复付款，并保留微信/支付宝的付款记录截图，核对后会尽快补到账。</p>
      </div>
    </div>
  </div>
</template>
<style scoped>
.support{border:1px solid #e6e9f0;border-radius:14px;background:#fafbfd;margin-top:16px;overflow:hidden;transition:border-color .2s}.support.urgent{border-color:#f5d6a8;background:#fffaf1}.support.open{border-color:#cfd8e8;background:#fff}.toggle{all:unset;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:11px;padding:12px 14px;cursor:pointer}.toggle:focus-visible{outline:2px solid #367af1;outline-offset:-2px;border-radius:14px}.dot{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#07c160;color:#fff;font-weight:700;font-size:14px}.label{display:flex;flex-direction:column;gap:2px;min-width:0}.label strong{font-size:13px;color:#2a2f3b}.label small{font-size:11px;color:#8b92a0}.chev{margin-left:auto;flex:none;font-size:12px;color:#07a254;font-weight:600}.body{display:flex;gap:16px;align-items:flex-start;padding:4px 14px 16px;border-top:1px dashed #e6e9f0;padding-top:14px}figure{margin:0;flex:none;text-align:center}figure img{display:block;width:168px;height:auto;aspect-ratio:888/1131;object-fit:contain;border-radius:10px;border:1px solid #edf0f5;background:#fff}figcaption{font-size:11px;color:#8b92a0;line-height:1.6;margin-top:7px}figcaption b{color:#c2410c;font-weight:600}.info{min-width:0;display:flex;flex-direction:column;gap:9px;font-size:12px;color:#5b6474}.info p{margin:0;line-height:1.7}.info code{display:inline-block;font-size:11px;background:#f2f4f8;padding:1px 6px;border-radius:5px;margin:0 6px;overflow-wrap:anywhere;color:#2a2f3b}.info code.order{display:block;margin:4px 0}.info button{border:1px solid #dfe3ea;background:#fff;border-radius:6px;padding:2px 8px;font-size:11px;color:#4b5565;cursor:pointer}.add{display:block;text-align:center;background:#07c160;color:#fff;font-weight:650;font-size:13px;border-radius:10px;padding:10px 14px;text-decoration:none;box-shadow:0 6px 14px #07c16033}.add:active{transform:translateY(1px)}.info .how{color:#4b5565}.info .tip{color:#8b92a0;font-size:11px}@media(max-width:540px){.body{flex-direction:column;align-items:center;text-align:center}.info code.order{margin:4px auto}}
</style>
