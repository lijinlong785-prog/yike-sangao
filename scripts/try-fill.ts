/* 一次性验证：fillPulls 在真机那一叠（25 页 / 6 图 / 0 pull）上能不能指对句子 */
;(globalThis as unknown as { window: unknown }).window ??= globalThis
const BASE = process.env.RUN_BASE || 'http://127.0.0.1:8099'
const rawFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' && input.startsWith('/') ? `${BASE}${input}` : input
  return rawFetch(url as RequestInfo, init)
}) as typeof fetch

const fs = await import('node:fs')
const { findText } = await import('../src/data/texts')
const { DEFAULT_CONFIG } = await import('../src/lib/llm')
const { fillPulls, withPulls } = await import('../src/lib/slides')
import type { StudentSlide } from '../src/lib/slides'

const slides = JSON.parse(fs.readFileSync('/tmp/yalang7/slides.json', 'utf8')) as StudentSlide[]
const text = (findText('狼牙山五壮士')?.quotes ?? []).join('\n')
const plan = { meta: { topic: '狼牙山五壮士', text } } as never

const t0 = Date.now()
const filled = await fillPulls(slides, plan, { ...DEFAULT_CONFIG, apiKey: '', illust: 'off' })
const final = withPulls(filled, plan)
console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log(`原始 ${slides.length} 页 · 有图 ${slides.filter((s) => s.illustration).length} · 指完 ${final.filter((s) => s.pull).length} 页有引文块`)
final.forEach((s, i) => {
  if (s.pull) console.log(`  p${String(i + 1).padStart(2)} [${s.kind}] ${String(s.title).slice(0, 18)} →「${s.pull.slice(0, 34)}」`)
})
const quotes = (findText('狼牙山五壮士')?.quotes ?? [])
const bad = final.filter((s) => s.pull && !quotes.includes(s.pull))
console.log(bad.length ? `❌ ${bad.length} 句对不上原文` : '✅ 全部逐字对得上原文')
export {}
