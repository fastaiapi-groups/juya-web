<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Log } from './types'
const props = withDefaults(defineProps<{ logs: Log[]; pageSize?: number }>(),{pageSize:8})
const page=ref(1), pages=computed(() => Math.max(1,Math.ceil(props.logs.length/props.pageSize)))
watch(pages,n => {page.value=Math.min(n,page.value)})
const rows=computed(() => props.logs.slice((page.value-1)*props.pageSize,page.value*props.pageSize))
const events:Record<string,string>={credited:'余额已入账',created:'订单创建',exception:'订单异常',recheck_requested:'查询付款',issue_resolved:'异常已处理',refund_registered:'退款已冲正',refund_requested:'退款登记'}
function detail(l:Log){try{const d=JSON.parse(l.detail);if(l.event==='credited')return `到账 $${Number(d.credit)}${d.paid_amount_cents!=null ? ` · 实付 ¥${(d.paid_amount_cents/100).toFixed(2)}` : ''} · 余额 $${Number(d.balance_after)}`;if(l.event==='refund_registered')return `扣回 $${Number(d.debit)} · ${d.reason}`;if(d.reason)return d.reason}catch{}return l.detail}
function reference(l:Log){try{const d=JSON.parse(l.detail);return d.trade_no ? `流水 ${d.trade_no}` : d.refund_reference ? `退款凭证 ${d.refund_reference}` : ''}catch{return ''}}
const time=(s:string)=>new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
const copied = ref('')
async function copyChannelNo(l: Log) {
 if (!l.channel_trade_no) return
 try { await navigator.clipboard.writeText(l.channel_trade_no) } catch { const area=document.createElement('textarea'); area.value=l.channel_trade_no; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove() }
 copied.value=l.order_id; setTimeout(() => { if (copied.value===l.order_id) copied.value='' }, 1200)
}
</script>
<template><div class="log-list"><div v-for="l in rows" :key="l.order_id+l.event+l.created_at" class="log-row"><span class="dot" :class="{green:l.event==='credited',red:l.event==='exception'}"></span><div class="log-copy"><div class="log-title"><strong :class="{green:l.event==='credited'}">{{ events[l.event] || l.event }}</strong><time>{{ time(l.created_at) }}</time></div><p :title="l.detail">{{ detail(l) }}</p><div class="log-meta"><span>{{ l.payment_type==='wxpay' ? '微信支付' : '支付宝' }}</span><button v-if="l.channel_trade_no" class="channel-no" :title="`复制 ${l.channel_trade_no}`" @click="copyChannelNo(l)">{{ copied===l.order_id ? '已复制' : l.channel_trade_no }}</button><code :title="l.order_id">{{ l.order_id }}<span v-if="reference(l)"> · {{ reference(l) }}</span></code></div></div></div><p v-if="!logs.length" class="empty">暂无充值日志，创建订单后会自动记录。</p><div class="pagination"><span>共 {{ logs.length }} 条 · {{ page }} / {{ pages }} 页</span><div><button :disabled="page<=1" @click="page--">上一页</button><button :disabled="page>=pages" @click="page++">下一页</button></div></div></div></template>
<style scoped>
.log-list{color:#1c2333;color-scheme:light}.log-row{display:flex;align-items:flex-start;gap:12px;padding:13px 18px;border-bottom:1px solid #f1f6f5;min-height:60px;transition:background .15s}.log-row:hover{background:#fbfefd}.dot{margin-top:6px;flex-shrink:0;width:9px;height:9px;background:#c5cddc;border-radius:50%;box-shadow:0 0 0 3px #f2f7f6}.dot.green{background:#22b26f;box-shadow:0 0 0 3px #e3f7ec}.dot.red{background:#e78369;box-shadow:0 0 0 3px #fdebe6}.log-copy{min-width:0;flex:1}.log-title{display:flex;align-items:center;justify-content:space-between;gap:8px}strong{color:#2b3346;font-size:13px;font-weight:650}.green{color:#1f9d63}time{font-size:12px;color:#97a1b3;white-space:nowrap}p{margin:5px 0 4px;font-size:12px;color:#5d6880;line-height:1.6;overflow-wrap:anywhere}.log-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#7c869b;font-size:11px}.log-meta code{display:inline;color:#a0a9ba;font-size:11px;overflow-wrap:anywhere}.channel-no{padding:0;border:0;background:transparent;color:#d14f4f;font-size:11px;cursor:pointer}.pagination{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;font-size:12px;color:#8a94a8;gap:10px}.pagination>div{display:flex;gap:6px}button{font-size:12px;color:#4d5a73;background:#fff;border:1px solid #e4efec;padding:5px 11px;border-radius:8px;cursor:pointer}button:disabled{opacity:.35;cursor:not-allowed}.empty{padding:34px 16px;text-align:center;font-size:13px;color:#8a94a8;margin:0}
</style>
