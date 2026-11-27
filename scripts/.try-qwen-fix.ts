/** 验证：走应用真实链路 generateIllustration（千问档）→ 质检，看排除句剥离后还带不带字 */
import fs from 'node:fs'
;(globalThis as unknown as { window: unknown }).window ??= globalThis
const rawFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' && input.startsWith('/') ? `http://127.0.0.1:8099${input}` : input
  return rawFetch(url as string, init)
}) as typeof fetch
const { generateIllustration } = await import('../src/lib/illustrate')
const { measureArt } = await import('../src/lib/inspect')
const r = await generateIllustration(
  'steep Wumeng mountain ridges, pine branches, stone steps, a tiny red army column climbing a distant mountain path, clouds and mist',
  { baseUrl: 'http://127.0.0.1:8099', apiKey: '', model: 'qwen-image-3.0' },
  { grade: '六年级', subjectName: '语文', look: 'mountain ridge and pine', paper: '#f5f1e6', title: '七律·长征' }
)
if (!r.ok || !r.dataUrl) { console.log('FAIL', r.error); process.exit(1) }
fs.writeFileSync('/tmp/changzheng-C.png', Buffer.from(r.dataUrl.split(',')[1], 'base64'))
const nums = await measureArt(r.dataUrl, '#f5f1e6')
console.log('C', JSON.stringify({ glyph: nums ? Math.round(nums.glyph) : null, textRisk: nums?.textRisk, empty: nums?.empty }))
console.log('prompt 里还有没有排除句:', /no text|no letters|no chinese/i.test(r.prompt) ? '有(不该)' : '没有 ✓')
