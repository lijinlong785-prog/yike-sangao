import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { countVisibleChars, materialProblems } from '../src/lib/slides'
import { findText, splitQuotes } from '../src/data/texts'
/* 用法：npx tsx scripts/.content-audit.ts [slides.json] [课题] */
const slidesFile = process.argv[2] ?? '/tmp/real/slides.json'
const topic = process.argv[3] ?? '桂花雨'
const slides = JSON.parse(readFileSync(slidesFile, 'utf8')) as any[]
const dir = dirname(slidesFile)
/* 原文信任源与管线同一份：备课包落库的 meta.text（dropUnverifiedQuotes 就是拿它逐字比）；
   旧目录没有 plan.json 时退回 session.input.text */
let metaText = ''
try {
  metaText = String(JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'))?.meta?.text ?? '')
} catch {
  try {
    metaText = String(JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8'))?.input?.text ?? '')
  } catch {}
}
const norm = (s: string) => String(s ?? '').replace(/\s+/g, '')
/* 原文来源：内置引句库 + 落库原文，切句后做子串比对 */
const entry = findText(topic)
const corpus = [...(entry?.quotes ?? []), ...splitQuotes(metaText)]
const sentences = corpus.map(norm).filter(s => s.length >= 8)
// 贴原文：页上任何一句与原文某句互为子串（≥8 字重叠）
const grounded = (body: string[]) => {
  const nb = body.map(norm).filter(Boolean)
  return nb.some(b => sentences.some(s => s.includes(b) || b.includes(s)) ||
    nb.some(x => x !== b && (b.includes(x) || x.includes(b)) && x.length >= 8 && sentences.some(s => s.includes(x))))
}
/* 闸门命中：与生成路径同一把尺（materialProblems），按页码归组 */
const gate = materialProblems(slides)
const gateByPage = new Map<number, string[]>()
for (const p of gate) {
  const n = Number(/第 (\d+) 页/.exec(p)?.[1] ?? 0)
  gateByPage.set(n, [...(gateByPage.get(n) ?? []), p])
}
let gated = 0, unground = 0, thin24 = 0, quotePages = 0
slides.forEach((s, i) => {
  if (s.kind === 'quote') quotePages++
  /* quote 页原文在 title/text，不在 line/items——度量口径要把它们计入 */
  const body = s.kind === 'quote'
    ? [String(s.text ?? s.title ?? '')]
    : [s.line ?? '', ...(s.items ?? [])]
  const n = countVisibleChars(body.join(''))
  const g = grounded(body)
  const skip = ['cover', 'end', 'goals'].includes(s.kind)
  const hits = gateByPage.get(i + 1) ?? []
  const flagT = hits.length > 0
  const flagG = !skip && !g && s.kind !== 'quote'
  if (flagT) gated++
  if (flagG) unground++
  if (!skip && n < 24) thin24++
  console.log(`P${String(i + 1).padStart(2)} ${String(s.kind).padEnd(10)} 字${String(n).padStart(3)} ${g ? '贴原文' : '无原文'}${flagT ? ' ←闸' : ''}${flagG ? ' ←泛' : ''} | ${s.title} | ${body.join(' / ').slice(0, 60)}`)
  hits.forEach(h => console.log(`     ✗ ${h}`))
})
console.log(`\n闸命中页 ${gated} / 无原文页 ${unground} / 原文页 ${quotePages} / 参考:<24字页 ${thin24} / 共 ${slides.length}`)
if (quotePages > 0 && sentences.length === 0)
  console.log('⚠ 没有原文却出了原文页——逐字校验泄漏，必须查')
if (quotePages > 0 && sentences.length > 0) {
  const badQuote = slides.filter((s, i) => s.kind === 'quote' && !grounded([String(s.text ?? s.title ?? '')]))
  console.log(badQuote.length ? `⚠ ${badQuote.length} 页原文页不逐字在原文里` : '✓ 原文页逐字全在原文里')
}