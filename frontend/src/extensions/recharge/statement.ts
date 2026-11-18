// Parses a WeChat / Alipay wallet statement (CSV export, or rows pasted from Excel)
// into income lines. Times in these exports are China time (UTC+8).

export interface StatementEntry { time: string; amount_cents: number; reference: string; counterparty: string }
export interface ParsedStatement { entries: StatementEntry[]; skipped: number }

const dateTime = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?/

function iso(m: RegExpMatchArray): string | null {
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] || '0'].map(Number)
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(s)}+08:00`
}

export function parseCents(raw: string): number | null {
  const v = raw.replace(/[¥￥,，+\s元]/g, '')
  const m = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(v)
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] || '0').padEnd(2, '0'))
}

function splitRow(line: string, delimiter: string): string[] {
  if (delimiter === '\t') return line.split('\t').map(c => c.trim())
  const out: string[] = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  out.push(cur.trim())
  return out
}

const clean = (v: string | undefined) => (v || '').replace(/^\/$/, '').trim().slice(0, 128)

export function parseStatement(text: string): ParsedStatement {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const entries: StatementEntry[] = []
  let skipped = 0
  // Header mode: the exports contain a header row naming the columns.
  const headerAt = lines.findIndex(l => /交易(创建)?时间/.test(l) && /金额/.test(l))
  if (headerAt >= 0) {
    const delimiter = lines[headerAt].includes('\t') ? '\t' : ','
    const head = splitRow(lines[headerAt], delimiter)
    const col = (re: RegExp) => head.findIndex(h => re.test(h))
    const cTime = col(/时间/), cAmount = col(/^金额/), cDir = col(/收\/?支/)
    const cWho = col(/交易对方/), cRef = col(/交易(订)?单号|交易号/), cState = col(/状态/)
    for (const line of lines.slice(headerAt + 1)) {
      if (!line.trim()) continue
      const row = splitRow(line, delimiter)
      const m = (row[cTime] || '').match(dateTime)
      const time = m && iso(m)
      const cents = parseCents(row[cAmount] || '')
      if (!time || cents == null) { skipped++; continue }
      const direction = cDir >= 0 ? row[cDir] || '' : ''
      if (cDir >= 0 && !direction.includes('收入')) { skipped++; continue }
      // A closed/failed transaction never reached the wallet.
      if (cState >= 0 && /关闭|失败/.test(row[cState] || '')) { skipped++; continue }
      if (cents > 0) entries.push({ time, amount_cents: cents, reference: clean(row[cRef]), counterparty: clean(row[cWho]) })
    }
    return { entries, skipped }
  }
  // Free-form mode: one receipt per line, e.g. "2026-11-18 10:41 30.00 *灿".
  for (const line of lines) {
    if (!line.trim()) continue
    const m = line.match(dateTime)
    const time = m && iso(m)
    if (!time || /支出|-\s*[¥￥]?\d/.test(line.replace(m![0], ''))) { skipped++; continue }
    const rest = line.replace(m![0], ' ')
    const amounts = [...rest.matchAll(/[+¥￥]?\s*(\d{1,8}\.\d{1,2})(?!\d)/g)]
    const plain = amounts.length ? amounts : [...rest.matchAll(/(?:^|\s)[+¥￥]?(\d{1,8})(?=\s|$)/g)]
    const cents = plain.length ? parseCents(plain[0][1]) : null
    if (cents == null || cents <= 0) { skipped++; continue }
    const ref = rest.match(/\d{20,}/)
    entries.push({ time, amount_cents: cents, reference: ref ? ref[0] : '', counterparty: '' })
  }
  return { entries, skipped }
}

// WeChat exports UTF-8; Alipay exports are commonly GBK.
export async function readStatementFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (!utf8.includes('�')) return utf8
  try { return new TextDecoder('gb18030').decode(buf) } catch { return utf8 }
}
