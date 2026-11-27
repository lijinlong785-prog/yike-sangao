/* 临时诊断（自删）：跑一篇陌生课文，把每页内容 / 有无图 / 模板 / 版式块数全打出来。
 * 用法：node scripts/.diag.mjs 将相和
 */
import { writeFileSync } from 'node:fs'

const g = globalThis as unknown as { window?: unknown }
g.window = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
const real = globalThis.fetch
globalThis.fetch = ((u: string, init?: RequestInit) =>
  real(String(u).startsWith('/') ? `http://localhost:8080${u}` : String(u), init)) as typeof fetch

const { buildStudentSlides } = await import('../src/lib/slides')
const { generatePlan, DEFAULT_CONFIG } = await import('../src/lib/llm')
const { findText } = await import('../src/data/texts')
const { defaultTemplateId, templateOf } = await import('../src/lib/deck2/theme')
const { place } = await import('../src/lib/deck2/place')

const which = process.argv[2] ?? '将相和'
const input = {
  topic: which,
  subject: '语文',
  stage: '小学',
  grade: '五年级',
  period: '第一课时',
  textbook: '部编版',
  duration: 40,
  text: findText(which)?.quotes.join('\n') ?? '',
}
const cfg = { ...DEFAULT_CONFIG, apiKey: '' }

const t0 = Date.now()
const plan = await generatePlan(input as never, cfg)
const marks = [`教案 ${((Date.now() - t0) / 1000).toFixed(1)}s`]

let note = ''
const slides = await buildStudentSlides(plan as never, cfg, {
  onFallback: (r: string) => {
    note = r
  },
  onProgress: (p: { stage: string }) => marks.push(`${p.stage}@${((Date.now() - t0) / 1000).toFixed(0)}s`),
  onIllustrated: (n: number, used: string) => marks.push(`图${used}${n ? `/${n.slice(0, 14)}` : ''}`),
})

const tid = defaultTemplateId(plan.meta.subject, plan.meta.topic, plan.meta.period)
const tpl = templateOf(tid)

console.log(`\n========== ${which}（40 分钟 · 模板 ${tid} / ${tpl.family}）`)
console.log(`  ${marks.join(' | ')} | 总 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log(`  原文：${findText(which) ? '内置有' : '内置没有'}；环节 ${plan.segments.length} 个`)
if (note) console.log(`  交接：${note}`)
console.log(`  学生版 ${slides.length} 页；有图 ${slides.filter((s) => s.illustration).length} 页`)
let placedBlocks = 0
let placedChars = 0
slides.forEach((s, i) => {
  const blocks = place(s, tpl)
  placedBlocks += blocks.length
  for (const b of blocks) if (b.text) placedChars += [...b.text].length
  console.log(
    `--- ${i + 1} [${s.kind}] title=${JSON.stringify(s.title)}` +
      ` line=${JSON.stringify(s.line ?? '')}` +
      ` items=${JSON.stringify(s.items ?? [])}` +
      ` ${s.illustration ? '[图]' : '[无图]'} 版式块=${blocks.length} 字=${blocks.reduce((n, b) => n + [...(b.text ?? '')].length, 0)}`
  )
})
console.log(`  合计：版式块 ${placedBlocks}，上屏字 ${placedChars}，平均每页 ${(placedChars / slides.length).toFixed(0)} 字`)

writeFileSync('/tmp/diag-plan.json', JSON.stringify(plan, null, 1), 'utf8')
writeFileSync('/tmp/diag-slides.json', JSON.stringify(slides, null, 1), 'utf8')