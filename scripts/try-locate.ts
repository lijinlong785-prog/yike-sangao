/**
 * 一次性验证：locate.ts 真的能把课题查成「版本 + 册次 + 课序 + 逐字原句」。
 * 跑法：esbuild 打包后 node，服务要先起在 8099。
 */
;(globalThis as unknown as { window: unknown }).window ??= globalThis
const BASE = process.env.RUN_BASE || 'http://127.0.0.1:8099'
const rawFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' && input.startsWith('/') ? `${BASE}${input}` : input
  return rawFetch(url as RequestInfo, init)
}) as typeof fetch

const { locateTopic } = await import('../src/lib/locate')

const topics = process.argv.slice(2)
for (const t of topics.length ? topics : ['驿路梨花', '电流的测量', '水的组成', '一个根本不存在的课名']) {
  const t0 = Date.now()
  const hit = await locateTopic(t)
  const ms = Date.now() - t0
  if (!hit) {
    console.log(`— 《${t}》 ${ms}ms：没查到（照常出课件，无原文页）`)
    continue
  }
  console.log(`✓ 《${t}》 ${ms}ms  ${hit.textbook} · ${hit.grade} · ${hit.unit} · ${hit.lesson} · ${hit.subject} · ${hit.author}`)
  hit.quotes.forEach((q, i) => console.log(`   ${i + 1}. ${q}`))
}

export {}
