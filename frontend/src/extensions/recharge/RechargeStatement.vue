<script setup lang="ts">
import { computed, ref } from 'vue'
import { apiClient } from '../../api/client'
import { parseStatement, readStatementFile, type StatementEntry } from './statement'

interface Order { id: string; user_id: number; user_email?: string; amount_cents: number; paid_amount_cents: number | null; status: string; gateway_status: string; channel_trade_no?: string; created_at: string; paid_at: string | null; gateway_paid_at: string | null; reversed_at: string | null }
interface Pair { entry: StatementEntry; order_id: string; time_source: 'platform' | 'local'; diff_seconds: number; ambiguous: boolean }
interface Orphan { entry: StatementEntry; candidate_ids: string[] }
interface Result { matched: Pair[]; unmatched_entries: Orphan[]; unmatched_order_ids: string[]; orders: Order[] }

const emit = defineEmits<{ recheck: [id: string] }>()
const paymentType = ref('wxpay'), text = ref(''), fileName = ref(''), busy = ref(false), error = ref(''), skipped = ref(0)
const result = ref<Result | null>(null)
const orders = computed(() => new Map((result.value?.orders || []).map(o => [o.id, o])))
const ambiguous = computed(() => result.value?.matched.filter(m => m.ambiguous).length || 0)
const statuses: Record<string, string> = { paid: '已支付', pending: '待支付', expired: '平台超时', not_found: '平台尚无订单' }
const time = (s: string | null) => s ? new Date(s).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'
const yuan = (c: number) => `¥${(c / 100).toFixed(2)}`
const order = (id: string) => orders.value.get(id)
const owner = (o?: Order) => o ? `用户 ${o.user_id} · ${o.user_email || '邮箱未找到'}` : ''
const state = (o?: Order) => o ? `${o.reversed_at ? '退款已冲正' : statuses[o.status] || o.status} / ${statuses[o.gateway_status] || '尚未查单'}` : ''

async function pick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (/\.(xlsx?|zip)$/i.test(file.name)) { error.value = 'Excel / 压缩包无法直接读取：请先解压并用 Excel 打开账单，全选复制后粘贴到下方文本框，或另存为 CSV 再上传。'; return }
  error.value = ''; fileName.value = file.name; text.value = await readStatementFile(file)
}
async function run() {
  if (busy.value) return
  error.value = ''; result.value = null
  const parsed = parseStatement(text.value)
  skipped.value = parsed.skipped
  if (!parsed.entries.length) { error.value = '没有识别到收入记录：请确认包含“交易时间”和“金额”列，或每行写成“2026-11-18 10:41 30.00”。'; return }
  busy.value = true
  try { const { data } = await apiClient.post('/recharge/admin/statement', { payment_type: paymentType.value, entries: parsed.entries }); result.value = data }
  catch (e: any) { error.value = e?.response?.data?.message || e?.message || '对账失败，请稍后重试' }
  finally { busy.value = false }
}
</script>
<template>
  <div class="statement">
    <p class="hint">支付平台不返回微信/支付宝的交易单号，只能按<b>金额 + 平台收款时间</b>把账单和订单对上。导出账单：微信「我 → 服务 → 钱包 → 账单 → 常见问题 → 下载账单」，支付宝「我的 → 账单 → … → 开具交易流水证明」。账单只用于本次比对，不会保存，也不会改动任何订单或余额。</p>
    <div class="row">
      <select v-model="paymentType"><option value="wxpay">微信支付</option><option value="alipay">支付宝</option></select>
      <label class="file">选择 CSV 文件<input type="file" accept=".csv,.txt,.xlsx,.xls,.zip" @change="pick"></label>
      <span v-if="fileName" class="muted">{{ fileName }}</span>
    </div>
    <textarea v-model="text" placeholder="粘贴账单内容（从 Excel 复制整张表即可）；也可以每行一笔：2026-11-18 10:41 30.00"></textarea>
    <div class="row"><button class="primary" :disabled="busy || !text.trim()" @click="run">{{ busy ? '对账中…' : '开始对账' }}</button><span v-if="result" class="muted">识别 {{ result.matched.length + result.unmatched_entries.length }} 笔收入<template v-if="skipped">，跳过 {{ skipped }} 行支出或无法识别的记录</template></span></div>
    <div v-if="error" class="message error" role="alert">{{ error }}</div>

    <template v-if="result">
      <div class="summary">
        <div :class="{ bad: result.unmatched_entries.length }"><b>{{ result.unmatched_entries.length }}</b>账单有收款，未对上订单</div>
        <div :class="{ bad: result.unmatched_order_ids.length }"><b>{{ result.unmatched_order_ids.length }}</b>已入账，账单中未找到</div>
        <div><b>{{ result.matched.length }}</b>已对上<small v-if="ambiguous">其中 {{ ambiguous }} 笔同金额时间相近，请留意</small></div>
      </div>

      <h4 v-if="result.unmatched_entries.length">账单有收款，未对上订单 <small>多半是付款后平台未匹配或已判超时；先对可能的订单「查单补单」，仍未入账时带着微信单号联系支付平台</small></h4>
      <table v-if="result.unmatched_entries.length"><thead><tr><th>收款时间 / 金额</th><th>付款方 / 交易单号</th><th>可能的订单（同金额、收款前 30 分钟内创建）</th></tr></thead><tbody>
        <tr v-for="(u, i) in result.unmatched_entries" :key="i"><td>{{ time(u.entry.time) }}<small>{{ yuan(u.entry.amount_cents) }}</small></td><td>{{ u.entry.counterparty || '—' }}<small><code>{{ u.entry.reference || '—' }}</code></small></td>
          <td><div v-for="id in u.candidate_ids" :key="id" class="cand"><div><code>{{ id }}</code><small>{{ owner(order(id)) }} · 下单 {{ time(order(id)?.created_at || null) }} · {{ state(order(id)) }}</small></div><button @click="emit('recheck', id)">查单补单</button></div><span v-if="!u.candidate_ids.length" class="muted">没有同金额的未支付订单</span></td></tr>
      </tbody></table>

      <h4 v-if="result.unmatched_order_ids.length">已入账，账单中未找到 <small>请确认账单时间范围和渠道；确实没有这笔收款时需联系支付平台核对</small></h4>
      <table v-if="result.unmatched_order_ids.length"><thead><tr><th>订单 / 用户</th><th>渠道单号</th><th>平台收款时间 / 实付</th></tr></thead><tbody>
        <tr v-for="id in result.unmatched_order_ids" :key="id"><td><code>{{ id }}</code><small>{{ owner(order(id)) }}</small></td><td><code>{{ order(id)?.channel_trade_no || '—' }}</code></td><td>{{ time(order(id)?.gateway_paid_at || order(id)?.paid_at || null) }}<small>{{ yuan(order(id)?.paid_amount_cents ?? order(id)?.amount_cents ?? 0) }}</small></td></tr>
      </tbody></table>

      <h4 v-if="result.matched.length">已对上</h4>
      <table v-if="result.matched.length"><thead><tr><th>收款时间 / 金额</th><th>付款方 / 交易单号</th><th>订单 / 用户</th><th>渠道单号 / 时间差</th></tr></thead><tbody>
        <tr v-for="(m, i) in result.matched" :key="i" :class="{ warn: m.ambiguous }"><td>{{ time(m.entry.time) }}<small>{{ yuan(m.entry.amount_cents) }}</small></td><td>{{ m.entry.counterparty || '—' }}<small><code>{{ m.entry.reference || '—' }}</code></small></td><td><code>{{ m.order_id }}</code><small>{{ owner(order(m.order_id)) }}<template v-if="order(m.order_id)?.reversed_at"> · 退款已冲正</template></small></td><td><code>{{ order(m.order_id)?.channel_trade_no || '—' }}</code><small>{{ m.time_source === 'platform' ? '平台收款时间' : '本地入账时间（平台时间待同步）' }}相差 {{ m.diff_seconds }} 秒<template v-if="m.ambiguous"> · 同金额时间相近，可能互换</template></small></td></tr>
      </tbody></table>
    </template>
  </div>
</template>
<style scoped>
.statement{display:flex;flex-direction:column;gap:12px;font-size:12px;color:#34435b}.hint{margin:0;line-height:1.8;color:#7d8da5;font-size:12px}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}select,textarea{border:1px solid #dfe3ec;background:#fff;color:#252936;border-radius:8px;padding:9px 12px;font:inherit}textarea{min-height:120px;resize:vertical;font-family:ui-monospace,monospace;font-size:11px}.file{border:1px solid #dfe3ec;border-radius:8px;padding:9px 13px;cursor:pointer;background:#fff}.file input{display:none}button{border:1px solid #dfe3ec;background:#fff;color:#353b49;border-radius:8px;padding:8px 12px;font-size:12px;white-space:nowrap;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.primary{background:#242731;color:#fff;border-color:#242731}.muted{color:#8b99ac}.message{padding:12px 14px;border-radius:8px}.error{color:#ad3333;background:#fff0f0}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.summary>div{border:1px solid #e3e9f2;border-radius:10px;padding:12px;color:#7d8da5}.summary b{display:block;font-size:22px;color:#34435b}.summary small{display:block;margin-top:4px;color:#b07a1e}.summary .bad{border-color:#f3c4c4;background:#fff7f7}.summary .bad b{color:#c23b3b}h4{margin:10px 0 0;font-size:13px}h4 small{font-weight:400;color:#8b99ac;margin-left:6px}table{width:100%;border-collapse:collapse;text-align:left;border:1px solid #e8edf5;border-radius:10px;overflow:hidden}th{background:#f5f6fa;color:#7d8da5;font-weight:500}td,th{padding:10px 12px;border-bottom:1px solid #eceef4;vertical-align:top}td small{display:block;color:#8b90a0;margin-top:4px}code{font-size:11px;overflow-wrap:anywhere}tr.warn td{background:#fffaf0}.cand{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.cand+.cand{margin-top:8px}@media(max-width:600px){.summary{grid-template-columns:1fr}table{display:block;overflow-x:auto}}
</style>
