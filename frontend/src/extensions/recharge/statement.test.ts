import { describe, expect, it } from 'vitest'
import { parseCents, parseStatement } from './statement'

describe('wallet statement parsing', () => {
  it('reads the WeChat CSV export, keeping income rows only', () => {
    const csv = [
      '微信支付账单明细,,,,,,,,',
      '起始时间：[2026-11-18 00:00:00] 终止时间：[2026-11-18 23:59:59],,,,,,,,',
      '----------------------微信支付账单明细列表--------------------,,,,,,,,',
      '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注',
      '2026-11-18 10:42:07,二维码收款,*灿,/,收入,¥30.00,/,已收钱,10001073012026111801797993545592\t,/,/',
      '2026-11-18 10:50:00,商户消费,某商户,"商品,含逗号",支出,¥12.50,零钱,支付成功,4200000001,/,/',
      '2026-11-18 10:55:31,二维码收款,/,/,收入,"¥1,030.5",/,已收钱,10001073012026111801797993545593,/,/',
    ].join('\n')
    const r = parseStatement(csv)
    expect(r.entries).toEqual([
      { time: '2026-11-18T10:42:07+08:00', amount_cents: 3000, reference: '10001073012026111801797993545592', counterparty: '*灿' },
      { time: '2026-11-18T10:55:31+08:00', amount_cents: 103050, reference: '10001073012026111801797993545593', counterparty: '' },
    ])
    expect(r.skipped).toBe(1)
  })

  it('reads rows pasted from Excel (tab separated) and Alipay headers', () => {
    const tsv = '交易时间\t交易分类\t交易对方\t对方账号\t商品说明\t收/支\t金额\t收/付款方式\t交易状态\t交易订单号\n2026/11/18 9:05\t收款\t张三\tz***@x.com\t收款\t收入\t29.99\t余额\t交易成功\t2026111822001\n2026/11/18 9:06\t收款\t李四\t\t收款\t收入\t5.00\t\t交易关闭\t2026111822002'
    const r = parseStatement(tsv)
    expect(r.entries).toEqual([{ time: '2026-11-18T09:05:00+08:00', amount_cents: 2999, reference: '2026111822001', counterparty: '张三' }])
    expect(r.skipped).toBe(1)
  })

  it('accepts one receipt per line when there is no header', () => {
    const r = parseStatement('2026-11-18 10:41 30.00 *灿\n2026年11月18日 10:42 +30\n2026-11-18 10:43 -30.00\nnote')
    expect(r.entries.map(e => [e.time, e.amount_cents])).toEqual([['2026-11-18T10:41:00+08:00', 3000], ['2026-11-18T10:42:00+08:00', 3000]])
    expect(r.skipped).toBe(2)
  })

  it('parses money without floating point', () => {
    expect(parseCents('¥0.1')).toBe(10)
    expect(parseCents('+30.00')).toBe(3000)
    expect(parseCents('30.001')).toBeNull()
    expect(parseCents('abc')).toBeNull()
  })
})
